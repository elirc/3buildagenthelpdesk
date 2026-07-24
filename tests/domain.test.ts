import { describe, expect, it } from "vitest";
import {
  assertIncidentTransition,
  assertTicketTransition,
  calculateSlaDueAt,
  canTransitionIncident,
  canTransitionTicket,
  createTicketSchema,
  getSlaState,
  normalizeTags
} from "@agentdesk/domain";

describe("ticket domain rules", () => {
  it("allows expected status transitions and rejects invalid jumps", () => {
    expect(canTransitionTicket("NEW", "TRIAGE")).toBe(true);
    expect(canTransitionTicket("NEW", "RESOLVED")).toBe(false);
    expect(() => assertTicketTransition("CLOSED", "IN_PROGRESS")).toThrow();
  });

  it("calculates SLA due dates by priority", () => {
    const createdAt = new Date("2026-05-21T10:00:00.000Z");
    expect(calculateSlaDueAt("CRITICAL", createdAt).toISOString()).toBe("2026-05-21T12:00:00.000Z");
    expect(calculateSlaDueAt("HIGH", createdAt).toISOString()).toBe("2026-05-21T18:00:00.000Z");
  });

  it("flags approaching and breached SLA states", () => {
    expect(
      getSlaState({
        status: "IN_PROGRESS",
        slaDueAt: new Date("2026-05-21T12:00:00.000Z"),
        now: new Date("2026-05-21T09:00:00.000Z")
      })
    ).toBe("approaching");

    expect(
      getSlaState({
        status: "TRIAGE",
        slaDueAt: new Date("2026-05-21T12:00:00.000Z"),
        now: new Date("2026-05-21T13:00:00.000Z")
      })
    ).toBe("breached");
  });

  it("validates ticket creation input and normalizes tags", () => {
    const parsed = createTicketSchema.parse({
      title: "Production login issue",
      description: "Several users cannot log in through SSO and see timeout errors.",
      customerName: "Acme",
      requesterEmail: "it@acme.example",
      priority: "HIGH",
      category: "ACCESS",
      tags: normalizeTags("SSO, production, SSO")
    });

    expect(parsed.tags).toEqual(["sso", "production"]);
  });
});

describe("incident domain rules", () => {
  it("allows expected incident lifecycle transitions and rejects invalid jumps", () => {
    expect(canTransitionIncident("INVESTIGATING", "IDENTIFIED")).toBe(true);
    expect(canTransitionIncident("IDENTIFIED", "RESOLVED")).toBe(true);
    expect(canTransitionIncident("RESOLVED", "INVESTIGATING")).toBe(false);
    expect(() => assertIncidentTransition("RESOLVED", "INVESTIGATING")).toThrow();
  });
});
