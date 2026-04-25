/**
 * Slideless MCP — Cloudflare Worker entry.
 *
 * Routes:
 *   POST /mcp         → MCP streamable-HTTP endpoint
 *   GET  /            → small static landing page
 *   *                 → falls through to the landing page
 *
 * Stateless proxy. Every MCP request carries the user's
 * `Authorization: Bearer cko_…` header; the Worker forwards it verbatim
 * to slideless-app's Cloud Functions. No DB, no cached secrets.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";

import { SlidelessClient } from "./slidelessClient.js";
import { registerAllTools } from "./server.js";

interface Env {
  SLIDELESS_API_BASE_URL: string;
  PER_IP: { limit: (args: { key: string }) => Promise<{ success: boolean }> };
  PER_KEY: { limit: (args: { key: string }) => Promise<{ success: boolean }> };
}

const INSTRUCTIONS =
  "Slideless hosts and shares HTML presentations. " +
  "Get your API key at https://app.slideless.ai (Settings → API Keys).";

async function rateLimit(
  env: Env,
  request: Request,
  authHeader: string | null,
): Promise<Response | null> {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const ipResult = await env.PER_IP.limit({ key: ip });
  if (!ipResult.success) {
    return new Response("Too Many Requests (per IP)", {
      status: 429,
      headers: { "Retry-After": "10" },
    });
  }
  if (authHeader) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(authHeader),
    );
    const keyHash = [...new Uint8Array(digest)]
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const keyResult = await env.PER_KEY.limit({ key: keyHash });
    if (!keyResult.success) {
      return new Response("Too Many Requests (per key)", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  }
  return null;
}

function logRequest(
  request: Request,
  authHeader: string | null,
  status: number,
  startedAt: number,
): void {
  const keyPrefix = authHeader
    ? authHeader.replace(/^Bearer\s+/i, "").slice(0, 12) + "…"
    : null;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      route: new URL(request.url).pathname,
      method: request.method,
      status,
      durationMs: Date.now() - startedAt,
      keyPrefix,
    }),
  );
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Slideless MCP</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font: 16px/1.5 system-ui, -apple-system, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  code { background: #f4f4f5; padding: 1px 6px; border-radius: 4px; }
  a { color: #2563eb; }
</style>
</head>
<body>
  <h1>Slideless MCP server</h1>
  <p>
    This is the <strong>Slideless</strong> Model Context Protocol server.
    Add it as a custom connector in Claude or ChatGPT to list, share, and manage your HTML presentations from chat.
  </p>
  <ul>
    <li>Connector URL (POST endpoint): <code>https://mcp.slideless.ai/mcp</code></li>
    <li>Header: <code>Authorization: Bearer cko_…</code></li>
    <li>Get a key at <a href="https://app.slideless.ai">app.slideless.ai</a> (Settings → API Keys)</li>
  </ul>
  <p>Setup guide: <a href="https://docs.slideless.ai/mcp">docs.slideless.ai/mcp</a></p>
</body>
</html>`;

/**
 * RFC 9728 — protected resource metadata. Tells OAuth-aware clients (Claude
 * Desktop, claude.ai) which authorization server to talk to. The MCP Worker
 * doesn't host the OAuth flow itself; it points at slideless-app.
 */
function protectedResourceMetadata(req: Request): Response {
  const reqUrl = new URL(req.url);
  // The "resource" the client should request tokens for. We bind to
  // app.slideless.ai because that's the actual protected resource (Cloud
  // Functions accept tokens with aud=app.slideless.ai). The Worker is a
  // protocol transport, not a separate resource.
  const body = {
    resource: "https://app.slideless.ai",
    authorization_servers: ["https://app.slideless.ai"],
    scopes_supported: ["presentations:read", "presentations:write"],
    bearer_methods_supported: ["header"],
    // Echo the actual MCP host for debug/observability.
    mcp_endpoint: `${reqUrl.origin}/mcp`,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * 401 Unauthorized for the /mcp endpoint when no Bearer is present. Per
 * RFC 9728 §5.1 + the MCP spec, the response MUST include WWW-Authenticate
 * pointing at the protected-resource metadata document so OAuth clients can
 * discover the auth server.
 */
function unauthorizedResponse(req: Request): Response {
  const reqUrl = new URL(req.url);
  const metadataUrl = `${reqUrl.origin}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Authentication required. This connector uses OAuth — your MCP host (Claude Desktop, claude.ai, ChatGPT desktop, mcp-inspector) should follow the WWW-Authenticate header to discover the auth flow. " +
          "If you're using a host that supports static API keys (Claude Code, Cursor), set `Authorization: Bearer cko_…` and reconnect. " +
          "Get a key at https://app.slideless.ai (Settings → API Keys).",
      },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
      },
    },
  );
}

function landingResponse(): Response {
  return new Response(LANDING_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const authHeader = request.headers.get("Authorization");

    // OAuth protected-resource metadata. Required by the MCP spec + RFC 9728
    // for hosts that auto-discover auth (Claude Desktop, claude.ai).
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      const res = protectedResourceMetadata(request);
      logRequest(request, authHeader, res.status, startedAt);
      return res;
    }

    if (url.pathname !== "/mcp") {
      const res = landingResponse();
      logRequest(request, authHeader, res.status, startedAt);
      return res;
    }

    const limited = await rateLimit(env, request, authHeader);
    if (limited) {
      logRequest(request, authHeader, limited.status, startedAt);
      return limited;
    }

    if (!authHeader) {
      const res = unauthorizedResponse(request);
      logRequest(request, authHeader, res.status, startedAt);
      return res;
    }

    // Per-request McpServer, registered once with this session's auth.
    // Cheap to build (no I/O); avoids the Durable Object plumbing of McpAgent.
    const client = new SlidelessClient(env.SLIDELESS_API_BASE_URL, authHeader);
    const server = new McpServer(
      { name: "slideless", version: "0.1.0" },
      { instructions: INSTRUCTIONS },
    );
    registerAllTools(server, client);

    const handler = createMcpHandler(server, { route: "/mcp" });
    const res = await handler(request, env, ctx);
    logRequest(request, authHeader, res.status, startedAt);
    return res;
  },
};
