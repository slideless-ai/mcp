/**
 * HTTP helpers — OAuth discovery, CORS, and the unauthenticated challenge.
 *
 * Ported from the original Cloudflare Worker entry. These build Web `Response`
 * objects directly so they work unchanged inside Next.js route handlers.
 *
 * The public origin is resolved via `getPublicOrigin` (mcp-handler), which
 * honours `x-forwarded-host`/`x-forwarded-proto` — important behind Vercel's
 * proxy so the RFC 9728 `resource` value matches the URL the host connected to
 * (Claude Desktop validates this exactly, otherwise it bails with "Couldn't
 * reach the MCP server").
 */

import { getPublicOrigin } from "mcp-handler";

import { AUTH_SERVER_URL } from "./config";

/**
 * RFC 9728 — protected resource metadata. Tells OAuth-aware clients (Claude
 * Desktop, claude.ai) which authorization server to talk to. This server
 * doesn't host the OAuth flow itself; it points at app.slideless.ai.
 */
export function protectedResourceMetadata(req: Request): Response {
  const origin = getPublicOrigin(req);
  const body = {
    // Per RFC 9728, `resource` MUST identify this resource server. The token
    // issued via OAuth is audience-bound to this URL; Cloud Functions accept
    // both this aud and app.slideless.ai.
    resource: origin,
    authorization_servers: [AUTH_SERVER_URL],
    scopes_supported: ["presentations:read", "presentations:write"],
    bearer_methods_supported: ["header"],
    // Non-standard hints for hosts that surface connector branding.
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

export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, MCP-Session-Id",
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
export function unauthorizedResponse(req: Request): Response {
  const metadataUrl = `${getPublicOrigin(req)}/.well-known/oauth-protected-resource`;
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
