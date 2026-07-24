import { clamp, type JsonRecord, type LogEnvironment, type LogLevel } from "@agentdesk/shared";
import { scoreLogAnomaly } from "@agentdesk/observability";
import type { AgentDefinition, AgentTraceStep } from "./types";

export type LogAnomalyInput = JsonRecord & {
  service: string;
  logs: Array<{
    id?: string;
    timestamp?: string;
    service: string;
    environment: LogEnvironment;
    level: LogLevel;
    message: string;
    fingerprint: string;
  }>;
};

export type LogAnomalyOutput = JsonRecord & {
  anomalyScore: number;
  anomalyType: string;
  suspectedRootCause: string;
  affectedService: string;
  relatedFingerprints: string[];
  sampleLogs: string[];
  recommendedInvestigationSteps: string[];
  shouldCreateIncident: boolean;
};

export const logAnomalyDetectionAgent: AgentDefinition<LogAnomalyInput, LogAnomalyOutput> = {
  type: "LOG_ANOMALY_DETECTION",
  displayName: "Log Anomaly Detection Agent",
  description: "Scores selected structured logs and identifies likely operational failure modes.",
  version: "1",
  supportedTargets: ["LOG_GROUP", "INCIDENT"],
  run(request) {
    const input = request.input;
    const trace: AgentTraceStep[] = [];
    const score = scoreLogAnomaly(input.logs);
    trace.push({
      step: "baseline_anomaly_score",
      observation: `Calculated anomaly score ${score.score} from ${input.logs.length} logs.`,
      data: score as unknown as JsonRecord
    });

    const messages = input.logs.map((log) => log.message.toLowerCase()).join("\n");
    let anomalyType = "Operational noise";
    let suspectedRootCause = "No dominant failure signature found.";
    const recommendedInvestigationSteps = [
      "Review deploys and configuration changes near the first elevated error timestamp.",
      "Check service health dashboards for latency, saturation, and dependency failures."
    ];

    if (/auth|login|token|permission|sso/.test(messages)) {
      anomalyType = "Authentication degradation";
      suspectedRootCause = "Auth service dependency failure or elevated permission errors.";
      recommendedInvestigationSteps.push("Inspect auth-service dependency latency and token validation errors.");
      trace.push({ step: "auth_signature", observation: "Authentication failure language detected.", scoreDelta: 12 });
    } else if (/database|db|connection pool|timeout/.test(messages)) {
      anomalyType = "Database or performance degradation";
      suspectedRootCause = "Database timeout or saturated downstream dependency.";
      recommendedInvestigationSteps.push("Inspect database connection pool usage and slow query metrics.");
      trace.push({ step: "database_signature", observation: "Database timeout language detected.", scoreDelta: 15 });
    } else if (/webhook|integration|third-party|rate limit|429/.test(messages)) {
      anomalyType = "Third-party integration failure";
      suspectedRootCause = "External integration timeout, rate limit, or malformed payload handling.";
      recommendedInvestigationSteps.push("Check vendor status page and recent webhook retry volume.");
      trace.push({ step: "integration_signature", observation: "Integration/webhook signature detected.", scoreDelta: 10 });
    }

    const relatedFingerprints = Object.entries(score.fingerprintCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([fingerprint]) => fingerprint);

    const shouldCreateIncident = score.score >= 70 && input.logs.some((log) => log.environment === "production");
    if (shouldCreateIncident) {
      trace.push({
        step: "incident_recommendation",
        observation: "Production anomaly score crossed incident creation threshold.",
        scoreDelta: 8
      });
    }

    const output: LogAnomalyOutput = {
      anomalyScore: score.score,
      anomalyType,
      suspectedRootCause,
      affectedService: input.service,
      relatedFingerprints,
      sampleLogs: input.logs.slice(0, 5).map((log) => `[${log.level}] ${log.message}`),
      recommendedInvestigationSteps,
      shouldCreateIncident
    };

    return {
      agentType: "LOG_ANOMALY_DETECTION",
      summary: `${anomalyType} detected for ${input.service} with score ${score.score}.`,
      findings: [...score.reasons, `Suspected root cause: ${suspectedRootCause}`],
      recommendations: [
        ...recommendedInvestigationSteps,
        shouldCreateIncident ? "Create or link a production incident." : "Monitor the fingerprint before opening a new incident."
      ],
      limitations: ["Scores only the selected log window; it does not inspect metrics, deploy history, or traces."],
      confidenceScore: clamp(45 + score.reasons.length * 9 + relatedFingerprints.length * 6, 40, 90),
      output,
      trace
    };
  }
};
