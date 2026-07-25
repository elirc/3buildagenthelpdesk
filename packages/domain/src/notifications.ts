import type { NotificationKind } from "@agentdesk/shared";

/**
 * Who should hear about a change.
 *
 * Pure: it is handed the candidate ids and returns the recipients. The
 * fan-out itself is the action's job.
 */
export type RecipientRule = {
  includeWatchers: boolean;
  includeAssignee: boolean;
  includeOwner: boolean;
};

export const NOTIFICATION_RULES: Record<NotificationKind, RecipientRule> = {
  TICKET_STATUS_CHANGED: { includeWatchers: true, includeAssignee: true, includeOwner: false },
  TICKET_COMMENT_ADDED: { includeWatchers: true, includeAssignee: true, includeOwner: false },
  // Being assigned something is news to the assignee and nobody else.
  TICKET_ASSIGNED: { includeWatchers: false, includeAssignee: true, includeOwner: false },
  INCIDENT_STATUS_CHANGED: { includeWatchers: true, includeAssignee: false, includeOwner: true }
};

/**
 * Resolve the recipient list.
 *
 * Two invariants, both of which are the difference between a useful inbox
 * and one people mute:
 *
 * - The actor never hears about their own action. Nobody needs telling
 *   what they just did.
 * - Duplicates collapse. Someone who both watches a ticket and is assigned
 *   to it gets one notification, not two.
 */
export function resolveRecipients(params: {
  actorUserId: string;
  watcherIds: string[];
  assigneeId?: string | null;
  ownerId?: string | null;
  rule: RecipientRule;
}): string[] {
  const recipients = new Set<string>();

  if (params.rule.includeWatchers) {
    for (const watcherId of params.watcherIds) recipients.add(watcherId);
  }
  if (params.rule.includeAssignee && params.assigneeId) {
    recipients.add(params.assigneeId);
  }
  if (params.rule.includeOwner && params.ownerId) {
    recipients.add(params.ownerId);
  }

  recipients.delete(params.actorUserId);
  return Array.from(recipients);
}

/** The text of a notification. Kept here so it is testable without React. */
export function describeNotification(
  kind: NotificationKind,
  context: { entityTitle: string; actorName: string; detail?: string }
): { title: string; body: string } {
  switch (kind) {
    case "TICKET_STATUS_CHANGED":
      return {
        title: `Status changed: ${context.entityTitle}`,
        body: `${context.actorName} changed the status${context.detail ? ` to ${context.detail}` : ""}.`
      };
    case "TICKET_COMMENT_ADDED":
      return {
        title: `New comment: ${context.entityTitle}`,
        body: `${context.actorName} added a note${context.detail ? `: ${context.detail}` : "."}`
      };
    case "TICKET_ASSIGNED":
      return {
        title: `Assigned to you: ${context.entityTitle}`,
        body: `${context.actorName} assigned this ticket to you.`
      };
    case "INCIDENT_STATUS_CHANGED":
      return {
        title: `Incident ${context.detail ?? "updated"}: ${context.entityTitle}`,
        body: `${context.actorName} moved the incident${context.detail ? ` to ${context.detail}` : ""}.`
      };
  }
}
