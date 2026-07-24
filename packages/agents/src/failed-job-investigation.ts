import { clamp, type JobStatus, type JobType, type JsonRecord } from "@agentdesk/shared";
import type { AgentDefinition, AgentTraceStep } from "./types";

export type FailedJobInvestigationInput = JsonRecord & {
  id: string;
  type: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  payload: JsonRecord;
  errorMessage?: string | null;
  relatedLogs?: Array<{ level: string; message: string; service: string }>;
  relatedTicket?: { id: string; title: string } | null;
  relatedIncident?: { id: string; title: string; severity?: string } | null;
};

export type FailedJobInvestigationOutput = JsonRecord & {
  failureSummary: string;
  likelyCause: string;
  retryRecommendation: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  suggestedFix: string;
  payloadIssuesDetected: string[];
  relatedLogs: string[];
  escalationNeeded: boolean;
};

export const failedJobInvestigationAgent: AgentDefinition<FailedJobInvestigationInput, FailedJobInvestigationOutput> = {
  type: "FAILED_JOB_INVESTIGATION",
  displayName: "Failed Job Investigation Agent",
  description: "Explains failed background jobs and recommends retry/dead-letter actions with deterministic heuristics.",
  version: "1",
  supportedTargets: ["JOB"],
  run(request) {
    const input = request.input;
    const trace: AgentTraceStep[] = [];
    const error = (input.errorMessage ?? "").toLowerCase();
    const payloadIssuesDetected: string[] = [];
    let likelyCause = "Unknown transient processing failure.";
    let retryRecommendation = "Retry once after reviewing recent worker logs.";
    let riskLevel: FailedJobInvestigationOutput["riskLevel"] = "medium";
    let suggestedFix = "Inspect worker logs and confirm the job payload matches the expected schema.";
    let escalationNeeded = false;
    let confidence = 52;
    let nonRetryableUntilFixed = false;

    if (/timeout|timed out|econnreset|network/.test(error)) {
      likelyCause = "Timeout or network dependency failure.";
      retryRecommendation = "Retry with backoff; this class is usually safe to retry.";
      suggestedFix = "Verify downstream service latency and increase retry backoff if failures continue.";
      confidence += 18;
      trace.push({ step: "retryable_timeout", observation: "Timeout/network language makes the failure likely retryable." });
    }

    if (/malformed|invalid payload|validation|json/.test(error)) {
      likelyCause = "Invalid or malformed job payload.";
      retryRecommendation = "Do not retry until the payload or producer code is corrected.";
      suggestedFix = "Validate the producer path and add schema validation before enqueueing.";
      riskLevel = "high";
      confidence += 22;
      nonRetryableUntilFixed = true;
      payloadIssuesDetected.push("Payload likely violates worker contract.");
      trace.push({ step: "payload_validation", observation: "Payload/validation error language is not retryable without a fix." });
    }

    if (/permission|unauthorized|forbidden|401|403/.test(error)) {
      likelyCause = "Permission or credential configuration failure.";
      retryRecommendation = "Retry only after verifying credentials and service permissions.";
      suggestedFix = "Check service account permissions, token rotation, and environment secrets.";
      riskLevel = "high";
      escalationNeeded = true;
      confidence += 18;
      trace.push({ step: "permission_failure", observation: "Permission language requires config/auth investigation." });
    }

    if (/rate limit|429|quota/.test(error)) {
      likelyCause = "Rate limit or quota exhaustion.";
      retryRecommendation = "Retry with exponential backoff and jitter.";
      suggestedFix = "Throttle the producer or negotiate higher quota with the provider.";
      confidence += 18;
      trace.push({ step: "rate_limit", observation: "Rate limit language suggests backoff instead of immediate retry." });
    }

    if (input.attempts >= input.maxAttempts) {
      retryRecommendation = nonRetryableUntilFixed
        ? "Do not retry; max attempts reached and the payload must be corrected before requeueing."
        : "Max attempts reached; move to dead-letter review unless an operator fixes the cause first.";
      riskLevel = "high";
      escalationNeeded = true;
      trace.push({ step: "max_attempts", observation: `Attempts ${input.attempts}/${input.maxAttempts} reached.` });
    }

    if (input.relatedIncident) {
      escalationNeeded = true;
      riskLevel = input.relatedIncident.severity === "SEV1" ? "critical" : "high";
      trace.push({ step: "related_incident", observation: `Job is linked to incident ${input.relatedIncident.title}.` });
    }

    for (const [key, value] of Object.entries(input.payload ?? {})) {
      if (value === null || value === "") {
        payloadIssuesDetected.push(`Payload field ${key} is empty.`);
      }
    }

    const output: FailedJobInvestigationOutput = {
      failureSummary: `${input.type} job ${input.id} failed after ${input.attempts}/${input.maxAttempts} attempts: ${input.errorMessage ?? "No error message recorded."}`,
      likelyCause,
      retryRecommendation,
      riskLevel,
      suggestedFix,
      payloadIssuesDetected,
      relatedLogs: input.relatedLogs?.slice(0, 5).map((log) => `[${log.service}] ${log.message}`) ?? [],
      escalationNeeded
    };

    return {
      agentType: "FAILED_JOB_INVESTIGATION",
      summary: output.failureSummary,
      findings: [likelyCause, `Risk level: ${riskLevel}`, ...payloadIssuesDetected],
      recommendations: [retryRecommendation, suggestedFix],
      limitations: ["Does not execute the job or inspect external providers; it relies on stored error context."],
      confidenceScore: clamp(confidence, 35, 94),
      output,
      trace
    };
  }
};
