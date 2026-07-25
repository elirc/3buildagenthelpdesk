import { z } from "zod";
import { TICKET_PRIORITIES, type TicketCategory, type TicketPriority } from "@agentdesk/shared";

export const ROUTING_CONDITION_FIELDS = [
  "CATEGORY",
  "PRIORITY",
  "TAG",
  "TITLE_CONTAINS",
  "DESCRIPTION_CONTAINS",
  "REQUESTER_EMAIL_DOMAIN"
] as const;
export type RoutingConditionField = (typeof ROUTING_CONDITION_FIELDS)[number];

export const ROUTING_OPERATORS = ["equals", "contains"] as const;
export type RoutingOperator = (typeof ROUTING_OPERATORS)[number];

export const routingConditionSchema = z.object({
  field: z.enum(ROUTING_CONDITION_FIELDS),
  operator: z.enum(ROUTING_OPERATORS).default("equals"),
  value: z.string().min(1).max(200)
});

export type RoutingCondition = z.infer<typeof routingConditionSchema>;

export const routingRuleSchema = z.object({
  name: z.string().min(3).max(80),
  priorityOrder: z.coerce.number().int().min(0).max(1000).default(100),
  conditions: z.array(routingConditionSchema).min(1).max(10),
  assignTeamId: z.string().nullable().optional(),
  assignUserId: z.string().nullable().optional(),
  setPriority: z.enum(TICKET_PRIORITIES).nullable().optional(),
  addTags: z.array(z.string().min(1).max(32)).max(5).default([]),
  isActive: z.boolean().default(true)
});

export type RoutingRuleInput = z.infer<typeof routingRuleSchema>;

export type RoutableTicket = {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  tags: string[];
  requesterEmail: string;
};

export type EvaluableRule = {
  id: string;
  name: string;
  priorityOrder: number;
  isActive: boolean;
  conditions: RoutingCondition[];
  assignTeamId?: string | null;
  assignUserId?: string | null;
  setPriority?: TicketPriority | null;
  addTags?: string[];
};

export type RuleEvaluation = {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  /** The first condition that failed, so a near miss is explicable. */
  failedCondition?: string;
  skippedReason?: string;
};

export type RoutingDecision = {
  matchedRuleId: string | null;
  matchedRuleName: string | null;
  assignTeamId?: string | null;
  assignUserId?: string | null;
  setPriority?: TicketPriority | null;
  addTags: string[];
  /** Every rule considered and what happened. The same idea as an agent's
   *  trace: a routing engine nobody can debug will be turned off. */
  evaluated: RuleEvaluation[];
};

const norm = (value: string) => value.trim().toLowerCase();

function describe(condition: RoutingCondition): string {
  return `${condition.field} ${condition.operator} "${condition.value}"`;
}

/** The ticket's value for a condition field, already normalised. */
function fieldValues(ticket: RoutableTicket, field: RoutingConditionField): string[] {
  switch (field) {
    case "CATEGORY":
      return [norm(ticket.category)];
    case "PRIORITY":
      return [norm(ticket.priority)];
    case "TAG":
      return ticket.tags.map(norm);
    case "TITLE_CONTAINS":
      return [norm(ticket.title)];
    case "DESCRIPTION_CONTAINS":
      return [norm(ticket.description)];
    case "REQUESTER_EMAIL_DOMAIN":
      // Everything after the last @, so "a@b@corp.example" resolves the way
      // an email parser would rather than the way split(",")[1] would.
      return [norm(ticket.requesterEmail.slice(ticket.requesterEmail.lastIndexOf("@") + 1))];
  }
}

export function conditionMatches(ticket: RoutableTicket, condition: RoutingCondition): boolean {
  const target = norm(condition.value);
  if (target === "") return false;

  const values = fieldValues(ticket, condition.field);

  // TITLE_CONTAINS and DESCRIPTION_CONTAINS are substring fields whatever
  // the operator says — "equals" on a free-text body is never what anyone
  // means, and silently matching nothing would look like a broken rule.
  const substringField = condition.field === "TITLE_CONTAINS" || condition.field === "DESCRIPTION_CONTAINS";
  const useContains = substringField || condition.operator === "contains";

  return values.some((value) => (useContains ? value.includes(target) : value === target));
}

/**
 * Evaluate rules in order and return the first match.
 *
 * All conditions in a rule must hold (AND). Rules are tried in
 * priorityOrder, and the first match wins — which is what makes a
 * contradiction between two rules resolvable by a human rather than
 * undefined behaviour.
 *
 * `evaluated` records every rule considered, including why the ones that
 * did not match failed. A routing engine nobody can debug gets switched
 * off the first time it does something surprising.
 */
export function evaluateRoutingRules(ticket: RoutableTicket, rules: EvaluableRule[]): RoutingDecision {
  const ordered = [...rules].sort((a, b) => a.priorityOrder - b.priorityOrder || a.name.localeCompare(b.name));
  const evaluated: RuleEvaluation[] = [];

  for (const rule of ordered) {
    if (!rule.isActive) {
      evaluated.push({ ruleId: rule.id, ruleName: rule.name, matched: false, skippedReason: "Rule is inactive" });
      continue;
    }
    if (rule.conditions.length === 0) {
      // A rule with no conditions would match every ticket, which is never
      // intended and would shadow everything below it.
      evaluated.push({ ruleId: rule.id, ruleName: rule.name, matched: false, skippedReason: "Rule has no conditions" });
      continue;
    }

    const failed = rule.conditions.find((condition) => !conditionMatches(ticket, condition));
    if (failed) {
      evaluated.push({ ruleId: rule.id, ruleName: rule.name, matched: false, failedCondition: describe(failed) });
      continue;
    }

    evaluated.push({ ruleId: rule.id, ruleName: rule.name, matched: true });
    return {
      matchedRuleId: rule.id,
      matchedRuleName: rule.name,
      assignTeamId: rule.assignTeamId ?? null,
      assignUserId: rule.assignUserId ?? null,
      setPriority: rule.setPriority ?? null,
      addTags: rule.addTags ?? [],
      evaluated
    };
  }

  return { matchedRuleId: null, matchedRuleName: null, addTags: [], evaluated };
}
