import { describe, expect, it } from "vitest";
import { NOTIFICATION_RULES, describeNotification, resolveRecipients } from "@agentdesk/domain";

const rule = NOTIFICATION_RULES.TICKET_STATUS_CHANGED;

describe("resolveRecipients", () => {
  it("notifies watchers and the assignee", () => {
    const result = resolveRecipients({
      actorUserId: "actor",
      watcherIds: ["w1", "w2"],
      assigneeId: "assignee",
      rule
    });
    expect(result.sort()).toEqual(["assignee", "w1", "w2"]);
  });

  it("never notifies the actor about their own action", () => {
    // Nobody needs telling what they just did, and an inbox that does it
    // is one people mute.
    const result = resolveRecipients({
      actorUserId: "actor",
      watcherIds: ["actor", "w1"],
      assigneeId: "actor",
      rule
    });
    expect(result).toEqual(["w1"]);
  });

  it("collapses someone who is both a watcher and the assignee", () => {
    const result = resolveRecipients({
      actorUserId: "actor",
      watcherIds: ["dup"],
      assigneeId: "dup",
      rule
    });
    expect(result).toEqual(["dup"]);
  });

  it("copes with no watchers and no assignee", () => {
    expect(resolveRecipients({ actorUserId: "actor", watcherIds: [], assigneeId: null, rule })).toEqual([]);
  });

  it("ignores the assignee when the rule excludes them", () => {
    const watchersOnly = { includeWatchers: true, includeAssignee: false, includeOwner: false };
    expect(
      resolveRecipients({ actorUserId: "actor", watcherIds: ["w1"], assigneeId: "assignee", rule: watchersOnly })
    ).toEqual(["w1"]);
  });

  it("notifies only the assignee for an assignment", () => {
    // Being handed something is news to the assignee and nobody else.
    const result = resolveRecipients({
      actorUserId: "actor",
      watcherIds: ["w1", "w2"],
      assigneeId: "assignee",
      rule: NOTIFICATION_RULES.TICKET_ASSIGNED
    });
    expect(result).toEqual(["assignee"]);
  });

  it("includes the owner for incident changes", () => {
    const result = resolveRecipients({
      actorUserId: "actor",
      watcherIds: [],
      ownerId: "owner",
      rule: NOTIFICATION_RULES.INCIDENT_STATUS_CHANGED
    });
    expect(result).toEqual(["owner"]);
  });

  it("returns nothing when the only candidate is the actor", () => {
    expect(
      resolveRecipients({
        actorUserId: "actor",
        watcherIds: [],
        assigneeId: "actor",
        rule: NOTIFICATION_RULES.TICKET_ASSIGNED
      })
    ).toEqual([]);
  });
});

describe("describeNotification", () => {
  it("names the entity and the actor for every kind", () => {
    for (const kind of Object.keys(NOTIFICATION_RULES) as Array<keyof typeof NOTIFICATION_RULES>) {
      const message = describeNotification(kind, { entityTitle: "SSO login failing", actorName: "Maya" });
      expect(message.title).toContain("SSO login failing");
      expect(message.body.length).toBeGreaterThan(0);
    }
  });

  it("includes the detail when one is supplied", () => {
    const message = describeNotification("TICKET_STATUS_CHANGED", {
      entityTitle: "SSO login failing",
      actorName: "Maya",
      detail: "ESCALATED"
    });
    expect(message.body).toContain("ESCALATED");
  });

  it("reads correctly without a detail", () => {
    const message = describeNotification("TICKET_COMMENT_ADDED", { entityTitle: "T", actorName: "Maya" });
    expect(message.body).toBe("Maya added a note.");
  });
});
