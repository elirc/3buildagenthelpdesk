import { describe, expect, it } from "vitest";
import {
  API_SCOPES,
  apiKeyHashMatches,
  apiKeyPrefix,
  generateApiKey,
  hasScope,
  hashApiKey,
  isApiKeyUsable,
  parseBearerToken
} from "@agentdesk/domain";

describe("generateApiKey", () => {
  it("produces a prefix that is the start of the key", () => {
    const generated = generateApiKey();
    expect(generated.key.startsWith(generated.prefix)).toBe(true);
    expect(apiKeyPrefix(generated.key)).toBe(generated.prefix);
  });

  it("produces a hash that hashApiKey reproduces", () => {
    const generated = generateApiKey();
    expect(hashApiKey(generated.key)).toBe(generated.hash);
  });

  it("never returns the same key twice", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().key));
    expect(keys.size).toBe(50);
  });

  it("does not leak the key inside its own hash", () => {
    // Stating the obvious as a test, because the whole security story is
    // that a database dump contains only the hash.
    const generated = generateApiKey();
    expect(generated.hash).not.toContain(generated.key);
    expect(generated.hash).toHaveLength(64);
  });
});

describe("apiKeyHashMatches", () => {
  it("matches an identical hash and rejects a different one", () => {
    const hash = hashApiKey("adk_example");
    expect(apiKeyHashMatches(hash, hash)).toBe(true);
    expect(apiKeyHashMatches(hashApiKey("adk_other"), hash)).toBe(false);
  });

  it("rejects a length mismatch without throwing", () => {
    // timingSafeEqual throws on unequal lengths, so this guard is required
    // rather than defensive.
    expect(apiKeyHashMatches("short", hashApiKey("adk_example"))).toBe(false);
  });
});

describe("isApiKeyUsable", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");

  it("accepts an active key", () => {
    expect(isApiKeyUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
  });

  it("rejects a revoked key even if it has not expired", () => {
    expect(isApiKeyUsable({ revokedAt: now, expiresAt: null }, now)).toBe(false);
  });

  it("rejects an expired key, inclusive of the exact moment", () => {
    expect(isApiKeyUsable({ revokedAt: null, expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(isApiKeyUsable({ revokedAt: null, expiresAt: now }, now)).toBe(false);
  });

  it("accepts a key expiring in the future", () => {
    expect(isApiKeyUsable({ revokedAt: null, expiresAt: new Date(now.getTime() + 1000) }, now)).toBe(true);
  });
});

describe("hasScope", () => {
  it("checks membership", () => {
    expect(hasScope(["read:tickets"], "read:tickets")).toBe(true);
    expect(hasScope(["read:tickets"], "read:incidents")).toBe(false);
    expect(hasScope([], "read:tickets")).toBe(false);
  });

  it("covers every documented scope", () => {
    expect(hasScope([...API_SCOPES], "read:jobs")).toBe(true);
  });
});

describe("parseBearerToken", () => {
  it("extracts the token", () => {
    expect(parseBearerToken("Bearer adk_abc123")).toBe("adk_abc123");
    expect(parseBearerToken("bearer adk_abc123")).toBe("adk_abc123");
  });

  it("returns null for anything else", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("adk_abc123")).toBeNull();
    expect(parseBearerToken("Basic abc")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
  });
});
