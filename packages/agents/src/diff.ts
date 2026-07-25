import type { AgentRunResult } from "./types";

/**
 * Comparing two runs of the same input across agent versions.
 *
 * The material fact this enables: "I changed a heuristic and the tests
 * still pass" becomes "here is what my change did to forty real historical
 * inputs". AgentRun already stores inputSnapshot and agentVersion, so the
 * raw material has been sitting in the database unused.
 */

export type FieldChange = {
  path: string;
  before: unknown;
  after: unknown;
};

export type AgentOutputDiff = {
  confidenceDelta: number;
  changedFields: FieldChange[];
  addedFindings: string[];
  removedFindings: string[];
  addedRecommendations: string[];
  removedRecommendations: string[];
  traceStepsBefore: number;
  traceStepsAfter: number;
  verdict: "identical" | "cosmetic" | "material";
};

/** Confidence movement below this is noise rather than a behaviour change. */
export const MATERIAL_CONFIDENCE_DELTA = 5;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Walk two output objects and report the leaves that differ.
 *
 * Recurses into nested objects so a change buried in `output.matches[0]`
 * is reported at its path rather than as "the whole output changed", which
 * would be true and useless.
 */
function collectChanges(before: unknown, after: unknown, path: string, into: FieldChange[]): void {
  if (stableStringify(before) === stableStringify(after)) return;

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    for (const key of keys) {
      collectChanges(before[key], after[key], path ? `${path}.${key}` : key, into);
    }
    return;
  }

  into.push({ path: path || "(root)", before, after });
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * The verdict is a judgement call and worth stating plainly:
 *
 * - identical: deep-equal output and confidence. The change did nothing here.
 * - material: confidence moved more than the threshold, OR any finding or
 *   recommendation appeared or disappeared. Those are the parts a human
 *   acts on, so a change to them is a change in behaviour.
 * - cosmetic: something moved, but nothing anyone reads did.
 */
export function diffAgentOutputs(before: AgentRunResult, after: AgentRunResult): AgentOutputDiff {
  const changedFields: FieldChange[] = [];
  collectChanges(before.output, after.output, "", changedFields);

  const beforeFindings = asStrings(before.findings);
  const afterFindings = asStrings(after.findings);
  const beforeRecs = asStrings(before.recommendations);
  const afterRecs = asStrings(after.recommendations);

  const addedFindings = afterFindings.filter((item) => !beforeFindings.includes(item));
  const removedFindings = beforeFindings.filter((item) => !afterFindings.includes(item));
  const addedRecommendations = afterRecs.filter((item) => !beforeRecs.includes(item));
  const removedRecommendations = beforeRecs.filter((item) => !afterRecs.includes(item));

  const confidenceDelta = (after.confidenceScore ?? 0) - (before.confidenceScore ?? 0);

  const narrativeChanged =
    addedFindings.length > 0 ||
    removedFindings.length > 0 ||
    addedRecommendations.length > 0 ||
    removedRecommendations.length > 0;

  const anythingChanged = changedFields.length > 0 || narrativeChanged || confidenceDelta !== 0;

  const verdict: AgentOutputDiff["verdict"] = !anythingChanged
    ? "identical"
    : narrativeChanged || Math.abs(confidenceDelta) > MATERIAL_CONFIDENCE_DELTA
      ? "material"
      : "cosmetic";

  return {
    confidenceDelta,
    changedFields,
    addedFindings,
    removedFindings,
    addedRecommendations,
    removedRecommendations,
    traceStepsBefore: Array.isArray(before.trace) ? before.trace.length : 0,
    traceStepsAfter: Array.isArray(after.trace) ? after.trace.length : 0,
    verdict
  };
}
