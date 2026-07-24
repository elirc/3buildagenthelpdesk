import { createHash } from "node:crypto";
import { z } from "zod";
import { LOG_ENVIRONMENTS, LOG_LEVELS, type LogEnvironment, type LogLevel } from "@agentdesk/shared";

export const logFilterSchema = z.object({
  level: z.enum(LOG_LEVELS).optional(),
  service: z.string().optional(),
  environment: z.enum(LOG_ENVIRONMENTS).optional(),
  ticketId: z.string().optional(),
  incidentId: z.string().optional(),
  fingerprint: z.string().optional()
});

export function createLogFingerprint(params: { service: string; level: LogLevel; message: string }): string {
  const normalizedMessage = params.message
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();

  return createHash("sha1").update(`${params.service}:${params.level}:${normalizedMessage}`).digest("hex").slice(0, 12);
}

export function logLevelWeight(level: LogLevel): number {
  switch (level) {
    case "debug":
      return 1;
    case "info":
      return 2;
    case "warn":
      return 8;
    case "error":
      return 18;
    case "fatal":
      return 30;
  }
}

export function environmentWeight(environment: LogEnvironment): number {
  switch (environment) {
    case "development":
      return 0.5;
    case "staging":
      return 0.8;
    case "production":
      return 1.4;
  }
}
