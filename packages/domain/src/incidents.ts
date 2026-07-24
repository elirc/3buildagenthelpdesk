import { z } from "zod";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, type IncidentSeverity, type IncidentStatus } from "@agentdesk/shared";

export const createIncidentSchema = z.object({
  title: z.string().min(5).max(180),
  description: z.string().min(20).max(6000),
  status: z.enum(INCIDENT_STATUSES).default("INVESTIGATING"),
  severity: z.enum(INCIDENT_SEVERITIES),
  affectedService: z.string().min(2).max(80),
  ownerId: z.string().optional().nullable()
});

export const updateIncidentSchema = createIncidentSchema.extend({
  status: z.enum(INCIDENT_STATUSES)
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const allowedIncidentTransitions: Record<IncidentStatus, IncidentStatus[]> = {
  INVESTIGATING: ["IDENTIFIED", "MONITORING", "RESOLVED"],
  IDENTIFIED: ["MONITORING", "RESOLVED", "INVESTIGATING"],
  MONITORING: ["RESOLVED", "IDENTIFIED", "INVESTIGATING"],
  RESOLVED: ["MONITORING"]
};

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return from === to || allowedIncidentTransitions[from].includes(to);
}

export function assertIncidentTransition(from: IncidentStatus, to: IncidentStatus): void {
  if (!canTransitionIncident(from, to)) {
    throw new Error(`Incident status cannot transition from ${from} to ${to}`);
  }
}

export function severityWeight(severity: IncidentSeverity): number {
  switch (severity) {
    case "SEV1":
      return 100;
    case "SEV2":
      return 75;
    case "SEV3":
      return 45;
    case "SEV4":
      return 20;
  }
}
