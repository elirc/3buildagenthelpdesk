import { z } from "zod";
import { JOB_STATUSES, JOB_TYPES, type JobStatus } from "@agentdesk/shared";

export const createJobSchema = z.object({
  type: z.enum(JOB_TYPES),
  status: z.enum(JOB_STATUSES).default("QUEUED"),
  attempts: z.coerce.number().int().min(0).default(0),
  maxAttempts: z.coerce.number().int().min(1).max(20).default(3),
  payload: z.record(z.unknown()).default({}),
  relatedTicketId: z.string().optional().nullable(),
  relatedIncidentId: z.string().optional().nullable()
});

export function canRetryJob(status: JobStatus, attempts: number, maxAttempts: number): boolean {
  return ["FAILED", "RETRYING"].includes(status) && attempts < maxAttempts;
}

export function shouldDeadLetterJob(status: JobStatus, attempts: number, maxAttempts: number): boolean {
  return status === "FAILED" && attempts >= maxAttempts;
}
