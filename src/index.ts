/**
 * Slideless MCP — Cloudflare Worker entry.
 *
 * Routes:
 *   POST    /mcp                                     → MCP streamable-HTTP endpoint
 *   GET     /.well-known/oauth-protected-resource    → RFC 9728 metadata for OAuth discovery
 *   OPTIONS /mcp, /.well-known/oauth-protected-resource → CORS preflight
 *   GET     /                                        → small static landing page
 *   *                                                → falls through to the landing page
 *
 * Stateless proxy. Each MCP request carries an `Authorization: Bearer <token>`
 * header (either a `cko_` static org key for hosts that allow custom headers, or
 * a JWT issued by the slideless-app OAuth platform for hosts that speak OAuth
 * discovery — Claude Desktop, claude.ai). The Worker forwards the header
 * verbatim to slideless-app's Cloud Functions, which validate. No JWT logic
 * here. No DB, no cached secrets.
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
<link rel="icon" type="image/svg+xml" href="https://app.slideless.ai/favicon.svg" />
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
  // Per RFC 9728, `resource` MUST identify this resource server. Claude
  // Desktop validates that the metadata's `resource` matches the URL it
  // connected to — otherwise it bails with "Couldn't reach the MCP server".
  // The token issued via OAuth will be audience-bound to this URL; Cloud
  // Functions' middleware accepts both this aud and app.slideless.ai.
  const body = {
    resource: reqUrl.origin,
    authorization_servers: ["https://app.slideless.ai"],
    scopes_supported: ["presentations:read", "presentations:write"],
    bearer_methods_supported: ["header"],
    // Non-standard hint for hosts that surface a logo for the connector.
    // Claude Desktop's behavior here isn't documented; advertising it can
    // only help.
    resource_logo_uri: "https://app.slideless.ai/favicon.svg",
    resource_documentation: "https://docs.slideless.ai/mcp",
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      // claude.ai discovers OAuth via cross-origin fetch from the browser;
      // without CORS the discovery silently fails.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Session-Id",
      "Access-Control-Max-Age": "86400",
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
        // claude.ai is browser-based; without CORS it can't even read the
        // WWW-Authenticate header to discover the auth flow.
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "WWW-Authenticate",
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

    // CORS preflight for cross-origin discovery (claude.ai is browser-based).
    if (
      request.method === "OPTIONS" &&
      (url.pathname === "/mcp" ||
        url.pathname === "/.well-known/oauth-protected-resource")
    ) {
      const res = corsPreflightResponse();
      logRequest(request, authHeader, res.status, startedAt);
      return res;
    }

    // OAuth protected-resource metadata. Required by the MCP spec + RFC 9728
    // for hosts that auto-discover auth (Claude Desktop, claude.ai).
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      const res = protectedResourceMetadata(request);
      logRequest(request, authHeader, res.status, startedAt);
      return res;
    }

    // Favicon — redirect any `/favicon.*` (or `/<anything>/favicon.*`) probe
    // to the canonical Slideless icon. Browsers probe `/favicon.ico` from
    // the origin, but some MCP hosts probe relative to the connector URL
    // (e.g. `/mcp/favicon.ico`). The trailing-segment match covers both.
    if (/\/favicon\.(ico|svg|png)$/.test(url.pathname)) {
      const res = Response.redirect(
        "https://app.slideless.ai/favicon.svg",
        301,
      );
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
