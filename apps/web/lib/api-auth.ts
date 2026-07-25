import { prisma } from "@agentdesk/db";
import {
  apiKeyHashMatches,
  apiKeyPrefix,
  hasScope,
  hashApiKey,
  isApiKeyUsable,
  parseBearerToken,
  type ApiScope
} from "@agentdesk/domain";
import { logOperationalEvent } from "./request-context";

export type ApiCaller = {
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
};

export type ApiAuthResult = { caller: ApiCaller } | { error: Response };

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/**
 * Authenticate a request and check its scope.
 *
 * Deliberately returns the same 401 body for a missing, malformed,
 * unknown, revoked and expired key. Distinguishing them tells an attacker
 * which of those they achieved, and none of the distinctions help a
 * legitimate caller who simply has a bad key.
 */
export async function authenticateApiRequest(request: Request, required: ApiScope): Promise<ApiAuthResult> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { error: jsonError(401, "unauthorized", "Provide a bearer token in the Authorization header.") };
  }

  // Looked up by prefix, not by hash: the prefix is indexed, and the hash
  // still has to be compared in constant time afterwards regardless.
  const record = await prisma.apiKey.findUnique({ where: { keyPrefix: apiKeyPrefix(token) } });
  if (!record || !apiKeyHashMatches(hashApiKey(token), record.keyHash) || !isApiKeyUsable(record)) {
    return { error: jsonError(401, "unauthorized", "Invalid API key.") };
  }

  if (!hasScope(record.scopes, required)) {
    // 403 rather than 401: the key is real, it simply may not do this.
    return { error: jsonError(403, "forbidden", `This key does not have the ${required} scope.`) };
  }

  // Fire-and-forget usage tracking. A failure to record a statistic must
  // not fail the request it was recording.
  void prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date(), requestCount: { increment: 1 } } })
    .catch(() => undefined);

  logOperationalEvent({
    event: "api.request",
    apiKeyId: record.id,
    organizationId: record.organizationId,
    scope: required,
    path: new URL(request.url).pathname
  });

  return { caller: { organizationId: record.organizationId, apiKeyId: record.id, scopes: record.scopes } };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function notFoundResponse(): Response {
  // 404, never 403, for a record in another organization. A 403 would
  // confirm the id exists, which turns the API into an oracle for probing
  // other tenants' identifiers.
  return jsonError(404, "not_found", "Not found.");
}

export function methodNotAllowed(): Response {
  return jsonError(405, "method_not_allowed", "This API is read-only.");
}

/** Shared pagination parsing for list endpoints. */
export function parseApiPagination(url: URL): { page: number; pageSize: number; skip: number; take: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const requested = Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50;
  const pageSize = Math.min(Math.max(requested, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
