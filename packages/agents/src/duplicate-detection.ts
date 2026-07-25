import { clamp, type JsonRecord, type TicketCategory, type TicketStatus } from "@agentdesk/shared";
import type { AgentDefinition, AgentTraceStep } from "./types";

export type DuplicateCandidate = {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  customerName: string;
  status: TicketStatus;
  createdAt: string;
  incidentId?: string | null;
  tags?: string[];
};

export type DuplicateDetectionInput = JsonRecord & {
  ticket: {
    id: string;
    title: string;
    description: string;
    category: TicketCategory;
    customerName: string;
    createdAt: string;
    incidentId?: string | null;
    tags?: string[];
  };
  candidates: DuplicateCandidate[];
};

export type DuplicateMatch = {
  ticketId: string;
  title: string;
  similarity: number;
  reasons: string[];
};

export type DuplicateDetectionOutput = JsonRecord & {
  matches: DuplicateMatch[];
  bestMatchId: string | null;
  shouldRecommendMerge: boolean;
};

/**
 * Words that appear in so many support tickets that matching on them says
 * nothing. Without this list "Issue with login" and "Issue with billing"
 * score a shared token and look related.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "to", "of", "in", "on", "for", "with", "at", "by", "from", "as", "it", "its",
  "this", "that", "these", "those", "we", "our", "us", "i", "my", "me", "you", "your",
  "not", "no", "can", "cannot", "cant", "will", "would", "should", "could",
  "issue", "problem", "error", "help", "please", "when", "after", "before", "some",
  "ticket", "customer", "user", "users", "there", "have", "has", "had", "do", "does"
]);

const MERGE_THRESHOLD = 70;
const OPEN_STATUSES: TicketStatus[] = ["NEW", "TRIAGE", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "ESCALATED"];

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );
}

/** Jaccard similarity: shared tokens over total distinct tokens, 0..1. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Score one candidate against the ticket.
 *
 * Every contribution is additive and named, so the total can be
 * reconstructed by hand from the reasons. That is deliberate: an opaque
 * similarity number is not actionable, and an agent that cannot explain
 * itself will not be trusted enough to be used.
 */
export function scoreDuplicateCandidate(
  ticket: DuplicateDetectionInput["ticket"],
  candidate: DuplicateCandidate
): { similarity: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const titleOverlap = jaccardSimilarity(tokenize(ticket.title), tokenize(candidate.title));
  const titlePoints = Math.round(titleOverlap * 50);
  if (titlePoints > 0) {
    score += titlePoints;
    reasons.push(`Title overlap ${Math.round(titleOverlap * 100)}% (+${titlePoints})`);
  }

  if (ticket.category === candidate.category) {
    score += 10;
    reasons.push(`Same category ${candidate.category} (+10)`);
  }

  if (ticket.customerName && ticket.customerName === candidate.customerName) {
    score += 15;
    reasons.push(`Same customer ${candidate.customerName} (+15)`);
  }

  if (ticket.incidentId && ticket.incidentId === candidate.incidentId) {
    score += 20;
    reasons.push("Both linked to the same incident (+20)");
  }

  const ageMs = Math.abs(new Date(ticket.createdAt).getTime() - new Date(candidate.createdAt).getTime());
  if (Number.isFinite(ageMs)) {
    if (ageMs <= HOUR_MS) {
      score += 15;
      reasons.push("Raised within an hour of each other (+15)");
    } else if (ageMs <= 24 * HOUR_MS) {
      score += 10;
      reasons.push("Raised within a day of each other (+10)");
    }
  }

  const sharedTags = (ticket.tags ?? []).filter((tag) => (candidate.tags ?? []).includes(tag));
  if (sharedTags.length > 0) {
    const tagPoints = Math.min(sharedTags.length * 3, 9);
    score += tagPoints;
    reasons.push(`Shared tags ${sharedTags.join(", ")} (+${tagPoints})`);
  }

  return { similarity: clamp(score, 0, 100), reasons };
}

export const duplicateDetectionAgent: AgentDefinition<DuplicateDetectionInput, DuplicateDetectionOutput> = {
  type: "DUPLICATE_DETECTION",
  displayName: "Duplicate Detection Agent",
  description: "Finds open tickets that look like the same underlying problem, using lexical and relational signals.",
  version: "1",
  supportedTargets: ["TICKET"],
  run(request) {
    const { ticket, candidates } = request.input;
    const trace: AgentTraceStep[] = [];

    trace.push({
      step: "candidate_pool",
      observation: `Scoring ${candidates.length} candidate ticket(s) against "${ticket.title}".`
    });

    const matches: DuplicateMatch[] = candidates
      .map((candidate) => {
        const { similarity, reasons } = scoreDuplicateCandidate(ticket, candidate);
        return { ticketId: candidate.id, title: candidate.title, similarity, reasons };
      })
      .filter((match) => match.similarity > 0)
      // Ties broken by id so the output is byte-identical across runs, which
      // is what makes replay and regression comparison meaningful.
      .sort((a, b) => b.similarity - a.similarity || a.ticketId.localeCompare(b.ticketId))
      .slice(0, 5);

    for (const match of matches.slice(0, 3)) {
      trace.push({
        step: "candidate_scored",
        observation: `${match.title} scored ${match.similarity}: ${match.reasons.join("; ")}`,
        scoreDelta: match.similarity
      });
    }

    const best = matches[0] ?? null;
    const bestCandidate = best ? candidates.find((candidate) => candidate.id === best.ticketId) : undefined;
    const bestIsOpen = bestCandidate ? OPEN_STATUSES.includes(bestCandidate.status) : false;
    const shouldRecommendMerge = Boolean(best && best.similarity >= MERGE_THRESHOLD && bestIsOpen);

    if (best && best.similarity >= MERGE_THRESHOLD && !bestIsOpen) {
      trace.push({
        step: "closed_best_match",
        observation: "Strongest match is already resolved or closed, so merging is not recommended."
      });
    }

    const output: DuplicateDetectionOutput = {
      matches,
      bestMatchId: best?.ticketId ?? null,
      shouldRecommendMerge
    };

    return {
      agentType: "DUPLICATE_DETECTION",
      summary: best
        ? `Closest match "${best.title}" at ${best.similarity}% similarity.`
        : "No similar open tickets found.",
      findings: best
        ? [`Best match: ${best.title} (${best.similarity}%)`, ...best.reasons]
        : ["No candidate scored above zero."],
      recommendations: shouldRecommendMerge
        ? ["Link the tickets as duplicates and merge into whichever was raised first."]
        : best
          ? ["Review the closest match before working this ticket separately."]
          : ["Continue triage; nothing in the recent queue resembles this ticket."],
      limitations: [
        "Compares word overlap, not meaning. Two tickets describing the same fault in different words will not match, and a shared vocabulary is not proof of a shared cause."
      ],
      confidenceScore: clamp(40 + (best?.similarity ?? 0) / 2 + matches.length * 2, 35, 90),
      output,
      trace
    };
  }
};
