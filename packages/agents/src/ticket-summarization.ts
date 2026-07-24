import { clamp, type JsonRecord, type TicketCategory, type TicketPriority } from "@agentdesk/shared";
import { inferCategoryFromText } from "@agentdesk/domain";
import type { AgentDefinition, AgentTraceStep } from "./types";

export type TicketSummarizationInput = JsonRecord & {
  title: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
  comments?: Array<{ body: string; isInternal: boolean }>;
  activity?: Array<{ action: string; createdAt?: string }>;
  linkedIncident?: { id: string; title: string; severity?: string } | null;
  linkedLogs?: Array<{ level: string; message: string; service: string; fingerprint?: string }>;
};

export type TicketSummarizationOutput = JsonRecord & {
  shortSummary: string;
  customerImpact: string;
  suspectedCategory: TicketCategory;
  urgencyScore: number;
  missingInformation: string[];
  suggestedNextResponse: string;
  recommendedOwnerTeam: string;
  escalationRecommendation: string;
};

const escalationKeywords = ["outage", "down", "production", "security", "breach", "data loss", "all users"];

export const ticketSummarizationAgent: AgentDefinition<TicketSummarizationInput, TicketSummarizationOutput> = {
  type: "TICKET_SUMMARIZATION",
  displayName: "Ticket Summarization Agent",
  description: "Summarizes customer tickets and recommends triage next steps using deterministic support heuristics.",
  version: "1",
  supportedTargets: ["TICKET"],
  run(request) {
    const input = request.input;
    const trace: AgentTraceStep[] = [];
    const combinedText = `${input.title}\n${input.description}\n${input.comments?.map((comment) => comment.body).join("\n") ?? ""}`;
    const normalizedText = combinedText.toLowerCase();

    let urgencyScore = input.priority === "CRITICAL" ? 85 : input.priority === "HIGH" ? 65 : input.priority === "MEDIUM" ? 40 : 20;
    trace.push({
      step: "priority_baseline",
      observation: `Priority ${input.priority} established baseline urgency.`,
      scoreDelta: urgencyScore
    });

    const keywordHits = escalationKeywords.filter((keyword) => normalizedText.includes(keyword));
    if (keywordHits.length > 0) {
      urgencyScore += keywordHits.length * 8;
      trace.push({
        step: "escalation_keywords",
        observation: `Escalation keywords found: ${keywordHits.join(", ")}.`,
        scoreDelta: keywordHits.length * 8
      });
    }

    if (input.linkedIncident) {
      urgencyScore += 18;
      trace.push({
        step: "linked_incident",
        observation: `Ticket is linked to incident ${input.linkedIncident.title}.`,
        scoreDelta: 18
      });
    }

    const errorLogs = input.linkedLogs?.filter((log) => log.level === "error" || log.level === "fatal") ?? [];
    if (errorLogs.length >= 2) {
      urgencyScore += 12;
      trace.push({
        step: "linked_error_logs",
        observation: `${errorLogs.length} linked error/fatal logs increase engineering relevance.`,
        scoreDelta: 12
      });
    }

    const suspectedCategory = inferCategoryFromText(combinedText);
    if (suspectedCategory !== input.category) {
      trace.push({
        step: "category_inference",
        observation: `Text suggests ${suspectedCategory}, while ticket is currently ${input.category}.`
      });
    }

    const missingInformation: string[] = [];
    if (!/(steps to reproduce|repro|screenshot|request id|trace id|since when|started)/i.test(combinedText)) {
      missingInformation.push("Reproduction steps or precise time of first occurrence");
    }
    if (!/(browser|region|tenant|workspace|account|customer id)/i.test(combinedText)) {
      missingInformation.push("Affected workspace/account context");
    }
    if (missingInformation.length > 0) {
      urgencyScore -= 5;
      trace.push({
        step: "missing_context",
        observation: `Missing useful triage context: ${missingInformation.join("; ")}.`,
        scoreDelta: -5
      });
    }

    const escalates = urgencyScore >= 70 || input.priority === "CRITICAL" || Boolean(input.linkedIncident);
    const recommendedOwnerTeam =
      input.linkedIncident || errorLogs.length > 0 || suspectedCategory === "PERFORMANCE" || suspectedCategory === "BUG"
        ? "Engineering"
        : suspectedCategory === "BILLING"
          ? "Revenue Operations"
          : "Support";

    const customerImpact = normalizedText.includes("all users") || normalizedText.includes("multiple users")
      ? "Potentially broad customer impact across multiple users."
      : normalizedText.includes("blocked") || normalizedText.includes("cannot")
        ? "Customer is blocked or materially impaired."
        : "Impact appears limited from available ticket context.";

    const output: TicketSummarizationOutput = {
      shortSummary: `${input.title}: ${input.description.slice(0, 180)}${input.description.length > 180 ? "..." : ""}`,
      customerImpact,
      suspectedCategory,
      urgencyScore: clamp(Math.round(urgencyScore), 0, 100),
      missingInformation,
      suggestedNextResponse:
        missingInformation.length > 0
          ? `Acknowledge the issue, share current triage status, and request: ${missingInformation.join(", ")}.`
          : "Acknowledge impact, confirm investigation is underway, and provide the next update window.",
      recommendedOwnerTeam,
      escalationRecommendation: escalates
        ? "Escalate to engineering and keep the ticket linked to incident/log evidence."
        : "Continue support triage and gather additional context before escalation."
    };

    return {
      agentType: "TICKET_SUMMARIZATION",
      summary: output.shortSummary,
      findings: [
        `Suspected category: ${output.suspectedCategory}`,
        `Customer impact: ${output.customerImpact}`,
        `Recommended owner: ${output.recommendedOwnerTeam}`
      ],
      recommendations: [output.suggestedNextResponse, output.escalationRecommendation],
      limitations: ["Uses keyword and relationship heuristics only; it does not understand customer intent beyond supplied text."],
      confidenceScore: clamp(55 + (input.linkedLogs?.length ?? 0) * 4 + (input.comments?.length ?? 0) * 3 - missingInformation.length * 8, 35, 92),
      output,
      trace
    };
  }
};
