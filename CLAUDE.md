# Slideless MCP

Next.js app on Vercel that exposes the Slideless HTTP API as Model Context Protocol tools. Lives at `products/slideless/slideless-mcp/` alongside `slideless-app`, `slideless-cli`, and `slideless-plugin`.

## What this is

A thin streamable-HTTP MCP server. Forwards the user's `Authorization` header (an OAuth JWT or a `cko_…` static key) to `europe-west1-slideless-ai.cloudfunctions.net`. No state, no secrets — the auth token arrives per-request and the server proxies it through.

Audience: non-technical users in MCP hosts (Claude Desktop, claude.ai, ChatGPT desktop, Cursor) who can't install the `slideless` CLI but can add a connector by URL.

Live at `https://mcp.slideless.ai/mcp`. Registry name: `ai.slideless/mcp`.

## Architecture

- **Runtime**: Vercel Functions (Node.js), Next.js 15 App Router
- **Framework**: `@modelcontextprotocol/sdk` (server) + `createMcpHandler` from [`mcp-handler`](https://www.npmjs.com/package/mcp-handler) (stateless streamable-HTTP, SSE disabled, no Redis)
- **Auth**: OAuth 2.1 resource server. A no-auth `/mcp` request returns `401` + `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource` (RFC 9728), which advertises `app.slideless.ai` as the authorization server. OAuth-aware hosts auto-discover and run the sign-in/consent flow; static-key hosts send `Authorization: Bearer cko_…`. Either way the header is forwarded verbatim — the server never validates tokens itself; the Cloud Functions do (fail-fast on the first tool call).
- **Rate limiting**: Vercel WAF edge rules (managed via `vercel firewall`), not in-code — `mcp-per-ip` (60/10s, keyed by IP) and `mcp-per-key` (600/60s, keyed by the `Authorization` header), both matching `path` starts-with `/mcp`. Enforced before the function runs; returns `429`.

### Why Vercel (not Cloudflare)

The server was originally a Cloudflare Worker. Cloudflare Workers custom domains require the whole `slideless.ai` zone to move to Cloudflare's nameservers; the zone is on external DNS (Squarespace/Google), so binding `mcp.slideless.ai` there meant a full-zone migration. Vercel binds the subdomain via a single CNAME on external DNS — no migration — and matches the team's existing stack. The tool logic, client, types, and error handling ported over unchanged.

## Source layout

```
app/
├── layout.tsx                                     # root layout
├── page.tsx                                        # landing page (/)
├── [transport]/route.ts                            # MCP endpoint (/mcp): rate limit → 401 challenge → per-request handler
└── .well-known/oauth-protected-resource/route.ts   # RFC 9728 metadata
src/
├── config.ts             # base URL, SERVER_INFO (SEP-973 title/icons), instructions
├── http.ts               # protectedResourceMetadata, unauthorizedResponse, corsPreflightResponse
├── server.ts             # registerAllTools — calls each tools/ register function
├── slidelessClient.ts    # One method per Cloud Function. Typed.
├── types.ts              # Wire shapes — copied from slideless-app, Firestore types stripped
├── errors.ts             # SlidelessApiError + wrapToolErrors (Cloud Functions envelope → MCP error blocks)
└── tools/
    ├── identity.ts       # slideless_whoami
    ├── presentations.ts  # list / get / versions / download / delete
    ├── upload.ts         # upload_html_presentation, upload_presentation_files
    ├── sharing.ts        # tokens, version mode, unshare, email
    ├── collaborators.ts  # invite / uninvite / list
    └── marketplace.ts    # search / get / remix / publish / star / unstar
server.json               # MCP registry metadata (ai.slideless/mcp)
```

The per-request MCP handler is built inside `app/[transport]/route.ts` so its initializer closes over a request-scoped `SlidelessClient` — that keeps `registerAllTools(server, client)` and every `tools/` file platform-agnostic.

## Conventions

### Tool names are prefixed with `slideless_`

All tools start with `slideless_` (e.g. `slideless_list_presentations`). Anthropic Connector Directory guidance + collision avoidance when a host has multiple connectors loaded.

### Annotations follow Anthropic review criteria

| Hint | Applied to |
|---|---|
| `readOnlyHint: true` | All `list_*`, `get_*`, `download_*`, and `whoami` tools |
| `destructiveHint: true` | `unshare_presentation`, `delete_presentation`, `uninvite_collaborator` |
| `openWorldHint: true` | `share_via_email`, `invite_collaborator` (both send real email through Resend) |

### "Sends" wording for email-sending tools

`share_via_email` and `invite_collaborator` descriptions both lead with "Sends an email …" so the host UI surfaces the side effect to the user clearly. Don't soften this to "shares" or "invites" — the model can otherwise assume draft semantics.

### Wire shapes, not Firestore types

`src/types.ts` mirrors the request/response shapes from `slideless-app/functions/src/features/shared-presentations/types/sharedPresentationTypes.ts` and `presentation-collaborators/types/collaboratorTypes.ts`, but with `FieldValue` / `Timestamp` stripped (we only see ISO strings on the wire). When slideless-app changes a wire shape, mirror it here.

### Server identity / branding

`SERVER_INFO` in `src/config.ts` carries SEP-973 `title` + `icons`. `mcp-handler`'s `serverInfo` type only declares `{ name, version }`, but it passes the object through verbatim to `new McpServer(serverInfo, …)`, so the extra fields flow into the `initialize` response. Pass it with a cast.

## Backend dependency

This server has **zero backend changes** of its own. It uses already-deployed slideless-app Cloud Functions, including the OAuth 2.1 authorization server (`oauth*` functions, authorize/token/register routes, `app.slideless.ai`). When slideless-app adds a new endpoint that should be exposed in MCP:

1. Add the request/response types to `src/types.ts`
2. Add a method to `SlidelessClient` in `src/slidelessClient.ts`
3. Register a tool in the appropriate `src/tools/*.ts` file (with proper annotations)

## Local dev

```bash
pnpm install
pnpm dev      # http://localhost:8787/mcp
```

Test with `npx @modelcontextprotocol/inspector` (Streamable HTTP, `http://localhost:8787/mcp`). Use a real `cko_*` key from `app.slideless.ai`; the Cloud Functions fail fast on bad keys.

## Deploy

Push to `main` → Vercel auto-deploys production (`codika/slideless-mcp`). Manual: `vercel deploy --prod --scope codika`.

The custom domain `mcp.slideless.ai` is a CNAME on external DNS → Vercel. Rate limiting is two Vercel WAF rules (`mcp-per-ip`, `mcp-per-key`) managed via `vercel firewall rules add … && vercel firewall publish` (recreate commands in README → Deploy).

## Registry

Published to the official MCP registry as `ai.slideless/mcp` via `server.json` + `mcp-publisher`. The `ai.slideless/*` namespace is DNS-verified on `slideless.ai` (Ed25519 TXT record; the private `key.pem` is gitignored — keep it for re-publishes). To bump: edit `server.json` `version`, then `mcp-publisher login dns --domain slideless.ai --private-key <hex>` + `mcp-publisher publish`.

## Vault

No `.env` required — the Slideless API base URL has a default in `src/config.ts` (overridable via `SLIDELESS_API_BASE_URL`), and the auth token comes from the user per-request. No vault entry needed.
