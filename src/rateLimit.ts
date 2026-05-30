/**
 * Rate limiting — Vercel-native replacement for the Cloudflare `unsafe`
 * ratelimit bindings the Worker used.
 *
 * Two custom rules must exist in the Vercel project's Firewall dashboard (the
 * limits live on the rule, the code only references the rule ID + a key):
 *
 *   - `mcp-per-ip`   → 60 requests / 10s   (default key = source IP)
 *   - `mcp-per-key`  → 600 requests / 60s  (key = hash of the Authorization header)
 *
 * If the rules don't exist (or in local dev), `checkRateLimit` is a no-op and
 * returns `{ rateLimited: false }`, so this fails open — never blocks a
 * legitimate request because of missing config.
 */

import { checkRateLimit } from "@vercel/firewall";

function tooMany(scope: string, retryAfterSeconds: number): Response {
  return new Response(`Too Many Requests (${scope})`, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

/** Short, stable hash of the auth header — buckets per key without storing it. */
async function hashAuthHeader(authHeader: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(authHeader),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns a 429 `Response` if either limit is exceeded, otherwise `null`.
 * Per-IP catches one runaway agent; per-key catches an abusive key without
 * blocking legitimate spikes from a single org sharing an IP.
 */
export async function rateLimit(
  req: Request,
  authHeader: string | null,
): Promise<Response | null> {
  const ipResult = await checkRateLimit("mcp-per-ip", { request: req });
  if (ipResult.rateLimited) return tooMany("per IP", 10);

  if (authHeader) {
    const keyHash = await hashAuthHeader(authHeader);
    const keyResult = await checkRateLimit("mcp-per-key", {
      request: req,
      rateLimitKey: keyHash,
    });
    if (keyResult.rateLimited) return tooMany("per key", 60);
  }

  return null;
}
