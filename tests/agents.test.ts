import { describe, expect, it } from "vitest";
import { failedJobInvestigationAgent, logAnomalyDetectionAgent, ticketSummarizationAgent } from "@agentdesk/agents";

describe("mock agent heuristics", () => {
  it("escalates critical production outage tickets", () => {
    const result = ticketSummarizationAgent.run({
      targetType: "TICKET",
      targetId: "ticket-1",
      input: {
        title: "Production outage for login",
        description: "All users are down and cannot access production through SSO.",
        priority: "CRITICAL",
        category: "ACCESS",
        comments: [],
        linkedLogs: [
          { level: "error", message: "Auth provider timeout", service: "auth-service" },
          { level: "fatal", message: "Auth provider timeout", service: "auth-service" }
        ]
      }
    });

    expect(result.output.urgencyScore).toBeGreaterThanOrEqual(90);
    expect(result.output.recommendedOwnerTeam).toBe("Engineering");
    expect(result.recommendations.join(" ")).toContain("Escalate");
  });

  it("scores repeated production errors as an anomaly", () => {
    const result = logAnomalyDetectionAgent.run({
      targetType: "LOG_GROUP",
      targetId: "auth-service:production",
      input: {
        service: "auth-service",
        logs: Array.from({ length: 6 }).map((_, index) => ({
          id: `log-${index}`,
          service: "auth-service",
          environment: "production",
          level: index === 5 ? "fatal" : "error",
          message: "Auth provider timeout while validating SAML assertion",
          fingerprint: "auth-timeout"
        }))
      }
    });

    expect(result.output.anomalyScore).toBeGreaterThanOrEqual(70);
    expect(result.output.shouldCreateIncident).toBe(true);
    expect(result.output.anomalyType).toBe("Authentication degradation");
  });

  it("does not recommend blind retries for malformed payload jobs", () => {
    const result = failedJobInvestigationAgent.run({
      targetType: "JOB",
      targetId: "job-1",
      input: {
        id: "job-1",
        type: "DATA_SYNC",
        status: "FAILED",
        attempts: 3,
        maxAttempts: 3,
        payload: { exportId: null },
        errorMessage: "Malformed JSON payload for export sync",
        relatedLogs: []
      }
    });

    expect(result.output.retryRecommendation).toContain("Do not retry");
    expect(result.output.riskLevel).toBe("high");
    expect(result.output.payloadIssuesDetected.length).toBeGreaterThan(0);
  });
});
