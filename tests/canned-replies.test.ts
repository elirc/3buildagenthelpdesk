import { describe, expect, it } from "vitest";
import {
  CANNED_REPLY_VARIABLES,
  cannedReplySchema,
  extractVariables,
  renderCannedReply,
  selectRepliesForTicket
} from "@agentdesk/domain";

describe("renderCannedReply", () => {
  const values = {
    customerName: "Acme Corp",
    ticketTitle: "SSO login failing",
    ticketId: "tkt_123",
    agentName: "Maya",
    slaDueAt: "May 21, 5:00 PM"
  };

  it("substitutes every known placeholder", () => {
    expect(renderCannedReply("Hi {{customerName}}, this is {{agentName}}.", values)).toBe(
      "Hi Acme Corp, this is Maya."
    );
  });

  it("substitutes the same placeholder more than once", () => {
    expect(renderCannedReply("{{customerName}} — {{customerName}}", values)).toBe("Acme Corp — Acme Corp");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderCannedReply("Hi {{ customerName }}.", values)).toBe("Hi Acme Corp.");
  });

  it("leaves an unknown placeholder exactly as written", () => {
    // A typo must stay visible. Blanking it would send the customer a
    // sentence with a hole in it and nobody would find out why.
    expect(renderCannedReply("Hi {{customerNmae}}.", values)).toBe("Hi {{customerNmae}}.");
  });

  it("leaves a known placeholder alone when no value was supplied", () => {
    expect(renderCannedReply("Due {{slaDueAt}}.", { customerName: "Acme" })).toBe("Due {{slaDueAt}}.");
  });

  it("returns a body with no placeholders unchanged", () => {
    expect(renderCannedReply("We are looking into it.", values)).toBe("We are looking into it.");
  });

  it("ignores unclosed or malformed braces", () => {
    expect(renderCannedReply("Hi {{customerName", values)).toBe("Hi {{customerName");
    expect(renderCannedReply("Hi {customerName}", values)).toBe("Hi {customerName}");
    expect(renderCannedReply("Hi {{}}", values)).toBe("Hi {{}}");
  });

  it("does not interpret the substituted value as a template", () => {
    // A customer literally named "{{agentName}}" must not cause a second
    // pass of substitution. String.replace does this correctly because it
    // never revisits inserted text — this test pins that behaviour so a
    // future rewrite to a loop cannot quietly reintroduce it.
    expect(renderCannedReply("Hi {{customerName}}.", { customerName: "{{agentName}}", agentName: "Maya" })).toBe(
      "Hi {{agentName}}."
    );
  });

  it("handles an empty body", () => {
    expect(renderCannedReply("", values)).toBe("");
  });
});

describe("extractVariables", () => {
  it("lists the known placeholders a body uses, without duplicates", () => {
    expect(extractVariables("Hi {{customerName}}, re {{ticketTitle}} — {{customerName}} again")).toEqual([
      "customerName",
      "ticketTitle"
    ]);
  });

  it("ignores unknown placeholders", () => {
    expect(extractVariables("{{customerName}} {{nonsense}}")).toEqual(["customerName"]);
  });

  it("returns nothing for a plain body", () => {
    expect(extractVariables("No placeholders here")).toEqual([]);
  });

  it("recognises every documented variable", () => {
    const body = CANNED_REPLY_VARIABLES.map((v) => `{{${v}}}`).join(" ");
    expect(extractVariables(body)).toEqual([...CANNED_REPLY_VARIABLES]);
  });
});

describe("selectRepliesForTicket", () => {
  const replies = [
    { id: "a", category: "BILLING", isActive: true },
    { id: "b", category: null, isActive: true },
    { id: "c", category: "ACCESS", isActive: true },
    { id: "d", category: "BILLING", isActive: false }
  ];

  it("offers category matches plus uncategorised templates", () => {
    expect(selectRepliesForTicket(replies, "BILLING").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("offers only uncategorised templates when nothing matches", () => {
    expect(selectRepliesForTicket(replies, "PERFORMANCE").map((r) => r.id)).toEqual(["b"]);
  });

  it("never offers a deactivated template", () => {
    expect(selectRepliesForTicket(replies, "BILLING").map((r) => r.id)).not.toContain("d");
  });
});

describe("cannedReplySchema", () => {
  it("accepts a well-formed template", () => {
    const parsed = cannedReplySchema.parse({
      title: "Acknowledge and ask for repro",
      body: "Hi {{customerName}}, thanks for the report. Could you share the steps?",
      category: "BUG"
    });
    expect(parsed.isActive).toBe(true);
    expect(parsed.category).toBe("BUG");
  });

  it("allows an uncategorised template", () => {
    expect(cannedReplySchema.parse({ title: "General", body: "Thanks for getting in touch." }).category).toBeUndefined();
  });

  it("rejects a title or body that is too short to be useful", () => {
    expect(() => cannedReplySchema.parse({ title: "Hi", body: "Thanks for getting in touch." })).toThrow();
    expect(() => cannedReplySchema.parse({ title: "Reasonable", body: "Too short" })).toThrow();
  });

  it("rejects a category that is not a ticket category", () => {
    expect(() =>
      cannedReplySchema.parse({ title: "Reasonable", body: "Thanks for getting in touch.", category: "NONSENSE" })
    ).toThrow();
  });
});
