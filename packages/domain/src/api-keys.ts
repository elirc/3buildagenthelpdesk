import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_SCOPES = ["read:tickets", "read:incidents", "read:logs", "read:jobs"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const KEY_PREFIX = "adk_";
const PREFIX_LENGTH = 12;

export type GeneratedApiKey = {
  /** The full secret. Shown to the user exactly once, never stored. */
  key: string;
  /** Leading characters, stored in the clear so a human can identify a key. */
  prefix: string;
  hash: string;
};

/**
 * Mint a key.
 *
 * 32 random bytes from a CSPRNG — not Math.random(), which is seeded from
 * something guessable and is not designed to resist anyone trying.
 *
 * Only the hash and the prefix are ever persisted. A database dump
 * therefore does not hand over working credentials, which is the entire
 * reason for hashing something we generated ourselves.
 */
export function generateApiKey(): GeneratedApiKey {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("hex")}`;
  return { key, prefix: key.slice(0, PREFIX_LENGTH), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, PREFIX_LENGTH);
}

/**
 * Constant-time hash comparison.
 *
 * `a === b` on strings short-circuits at the first differing character, so
 * how long it takes leaks how much of the value was correct. Over enough
 * requests that is enough to reconstruct a secret one character at a time.
 * These are hex digests of known length, so the length check below is not
 * itself a leak.
 */
export function apiKeyHashMatches(candidateHash: string, storedHash: string): boolean {
  if (candidateHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(candidateHash, "utf8"), Buffer.from(storedHash, "utf8"));
}

export function isApiKeyUsable(
  key: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date()
): boolean {
  if (key.revokedAt) return false;
  if (key.expiresAt && key.expiresAt <= now) return false;
  return true;
}

export function hasScope(scopes: string[], required: ApiScope): boolean {
  return scopes.includes(required);
}

/** Extract the bearer token from an Authorization header. */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
