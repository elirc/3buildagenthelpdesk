import { z } from "zod";
import { INCIDENT_SEVERITIES, LOG_ENVIRONMENTS, LOG_LEVELS } from "@agentdesk/shared";

export const LOG_ALERT_ACTIONS = ["NOTIFY_ONLY", "CREATE_INCIDENT"] as const;
export type LogAlertAction = (typeof LOG_ALERT_ACTIONS)[number];

export const logAlertRuleSchema = z.object({
  name: z.string().min(3).max(80),
  service: z.string().max(80).nullable().optional(),
  environment: z.enum(LOG_ENVIRONMENTS).nullable().optional(),
  level: z.enum(LOG_LEVELS).nullable().optional(),
  fingerprint: z.string().max(64).nullable().optional(),
  // Every numeric bound is explicit. A threshold of 0 fires on silence and
  // a window of 0 never matches anything; both are configurations that
  // look plausible in a form and are useless in practice.
  thresholdCount: z.coerce.number().int().min(1).max(10_000).default(5),
  windowMinutes: z.coerce.number().int().min(1).max(1440).default(15),
  minAnomalyScore: z.coerce.number().int().min(0).max(100).default(70),
  action: z.enum(LOG_ALERT_ACTIONS).default("NOTIFY_ONLY"),
  incidentSeverity: z.enum(INCIDENT_SEVERITIES).default("SEV3"),
  cooldownMinutes: z.coerce.number().int().min(1).max(1440).default(60),
  isActive: z.boolean().default(true)
});

export type LogAlertRuleInput = z.infer<typeof logAlertRuleSchema>;

export type AlertEvaluation = {
  shouldFire: boolean;
  reason: string;
  matchedCount: number;
  inCooldown: boolean;
};

/**
 * Decide whether a rule fires.
 *
 * Pure: it is handed the counts and the score, and never queries. The
 * checks are ordered cheapest-and-most-decisive first, and each one
 * returns its own reason — an alert rule that silently does not fire is
 * indistinguishable from a broken one, and the reason is what makes the
 * difference visible on the rules page.
 */
export function evaluateLogAlertRule(params: {
  rule: {
    isActive: boolean;
    thresholdCount: number;
    cooldownMinutes: number;
    minAnomalyScore: number;
    lastFiredAt: Date | null;
  };
  matchedCount: number;
  anomalyScore: number;
  now?: Date;
}): AlertEvaluation {
  const now = params.now ?? new Date();
  const { rule } = params;

  const inCooldown = rule.lastFiredAt
    ? now.getTime() - rule.lastFiredAt.getTime() < rule.cooldownMinutes * 60_000
    : false;

  if (!rule.isActive) {
    return { shouldFire: false, reason: "Rule is inactive.", matchedCount: params.matchedCount, inCooldown };
  }

  if (params.matchedCount < rule.thresholdCount) {
    return {
      shouldFire: false,
      reason: `Only ${params.matchedCount} matching log(s); threshold is ${rule.thresholdCount}.`,
      matchedCount: params.matchedCount,
      inCooldown
    };
  }

  if (params.anomalyScore < rule.minAnomalyScore) {
    return {
      shouldFire: false,
      reason: `Anomaly score ${params.anomalyScore} is below the minimum of ${rule.minAnomalyScore}.`,
      matchedCount: params.matchedCount,
      inCooldown
    };
  }

  // Cooldown is checked last, so the reason distinguishes "would have
  // fired but recently did" from "did not qualify".
  if (inCooldown) {
    return {
      shouldFire: false,
      reason: `Condition met but the rule fired within the last ${rule.cooldownMinutes} minutes.`,
      matchedCount: params.matchedCount,
      inCooldown: true
    };
  }

  return {
    shouldFire: true,
    reason: `${params.matchedCount} matching log(s) with anomaly score ${params.anomalyScore}.`,
    matchedCount: params.matchedCount,
    inCooldown: false
  };
}

/** Title for an incident opened by a rule, so the origin is obvious. */
export function autoIncidentTitle(ruleName: string, service: string | null): string {
  return service ? `${ruleName}: elevated errors in ${service}` : `${ruleName}: elevated error volume`;
}
