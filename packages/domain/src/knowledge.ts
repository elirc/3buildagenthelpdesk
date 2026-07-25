import { z } from "zod";
import { ARTICLE_STATUSES, TICKET_CATEGORIES, type ArticleStatus, type TicketCategory } from "@agentdesk/shared";

export const articleSchema = z.object({
  title: z.string().min(5).max(160),
  summary: z.string().min(20).max(400),
  body: z.string().min(50).max(20_000),
  category: z.enum(TICKET_CATEGORIES).nullable().optional(),
  tags: z.array(z.string().min(1).max(32)).max(10).default([]),
  status: z.enum(ARTICLE_STATUSES).default("DRAFT")
});

export type ArticleInput = z.infer<typeof articleSchema>;

/**
 * Article lifecycle, modelled on allowedTicketTransitions so the two read
 * the same way.
 *
 * ARCHIVED returns only to DRAFT, never straight to PUBLISHED: bringing
 * back an article that was retired for being wrong should require a
 * deliberate second step.
 */
export const allowedArticleTransitions: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED", "DRAFT"],
  ARCHIVED: ["DRAFT"]
};

export function canTransitionArticle(from: ArticleStatus, to: ArticleStatus): boolean {
  return from === to || allowedArticleTransitions[from].includes(to);
}

export function assertArticleTransition(from: ArticleStatus, to: ArticleStatus): void {
  if (!canTransitionArticle(from, to)) {
    throw new Error(`Article cannot transition from ${from} to ${to}`);
  }
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "is", "are", "was", "to", "of", "in", "on", "for", "with",
  "it", "this", "that", "we", "you", "your", "not", "can", "cannot", "how", "what", "when",
  "issue", "problem", "error", "help", "please", "user", "users", "ticket"
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );
}

/**
 * Score how relevant an article is to a ticket.
 *
 * Same shape as the duplicate detection agent: additive, and every
 * contribution named, so a suggestion can justify itself. A suggestion an
 * agent cannot evaluate at a glance is one they will scroll past.
 */
export function scoreArticleRelevance(
  ticket: { title: string; description: string; category: TicketCategory; tags: string[] },
  article: { title: string; summary: string; tags: string[]; category: TicketCategory | null }
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const ticketTokens = tokenize(`${ticket.title} ${ticket.description}`);
  const articleTokens = tokenize(`${article.title} ${article.summary}`);

  let shared = 0;
  for (const token of articleTokens) {
    if (ticketTokens.has(token)) shared += 1;
  }
  if (shared > 0 && articleTokens.size > 0) {
    const overlap = shared / articleTokens.size;
    const points = Math.round(overlap * 55);
    if (points > 0) {
      score += points;
      reasons.push(`Wording overlap ${Math.round(overlap * 100)}% (+${points})`);
    }
  }

  if (article.category && article.category === ticket.category) {
    score += 20;
    reasons.push(`Same category ${article.category} (+20)`);
  }

  const sharedTags = ticket.tags.filter((tag) => article.tags.includes(tag));
  if (sharedTags.length > 0) {
    const points = Math.min(sharedTags.length * 5, 15);
    score += points;
    reasons.push(`Shared tags ${sharedTags.join(", ")} (+${points})`);
  }

  return { score: Math.min(score, 100), reasons };
}

/** Published articles only, best first, capped. */
export function suggestArticles<
  T extends { id: string; title: string; summary: string; tags: string[]; category: TicketCategory | null; status: ArticleStatus }
>(
  ticket: { title: string; description: string; category: TicketCategory; tags: string[] },
  articles: T[],
  limit = 3
): Array<{ article: T; score: number; reasons: string[] }> {
  return articles
    .filter((article) => article.status === "PUBLISHED")
    .map((article) => ({ article, ...scoreArticleRelevance(ticket, article) }))
    .filter((entry) => entry.score > 0)
    // Ties broken by id so the order is stable between renders.
    .sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, limit);
}
