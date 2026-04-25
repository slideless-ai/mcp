# Slideless MCP

Cloudflare Worker that exposes the Slideless HTTP API as Model Context Protocol tools. Lives at `products/slideless/slideless-mcp/` alongside `slideless-app`, `slideless-cli`, and `slideless-plugin`.

## What this is

A thin streamable-HTTP MCP server. Forwards the user's `Authorization: Bearer cko_…` header to `europe-west1-slideless-ai.cloudfunctions.net`. No state, no secrets — the user pastes their API key into the Custom Connector config and the Worker proxies it through.

Audience: non-technical users in MCP hosts (Claude Desktop, claude.ai, ChatGPT desktop, Cursor) who can't install the `slideless` CLI but can add a connector by URL.

## Architecture

- **Runtime**: Cloudflare Workers, `nodejs_compat` flag
- **Framework**: `@modelcontextprotocol/sdk` (server) + `createMcpHandler` from `agents/mcp` (stateless streamable-HTTP transport — no Durable Object)
- **Auth**: Per-request `Authorization` header passthrough. The Worker doesn't cache or pre-validate keys. Bad keys surface as a 401 from the first tool call (typically `slideless_whoami` or `slideless_list_presentations`); the upstream error message points users to the dashboard.
- **Rate limiting**: Cloudflare-native per-IP (60/10s) and per-key (600/60s) — see `wrangler.jsonc`.

## Source layout

```
src/
├── index.ts              # Worker entry — fetch handler, rate limiting, landing page
├── server.ts             # Calls each tools/ register function
├── slidelessClient.ts    # One method per Cloud Function. Typed.
├── types.ts              # Wire shapes — copied from slideless-app, Firestore types stripped
├── errors.ts             # SlidelessApiError + wrapToolErrors (maps Cloud Functions envelope to MCP error blocks)
└── tools/
    ├── identity.ts       # slideless_whoami
    ├── presentations.ts  # list / get / versions / download / delete
    ├── upload.ts         # upload_html_presentation, upload_presentation_files
    ├── sharing.ts        # tokens, version mode, unshare, email
    └── collaborators.ts  # invite / uninvite / list
```

## Conventions

### Tool names are prefixed with `slideless_`

All sixteen tools start with `slideless_` (e.g. `slideless_list_presentations`). Anthropic Connector Directory guidance + collision avoidance when a host has multiple connectors loaded.

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

## Backend dependency

This server has **zero backend changes** of its own. It uses already-deployed slideless-app Cloud Functions. The fail-fast key validation hits the existing `verifyApiKey` endpoint.

When slideless-app adds a new endpoint that should be exposed in MCP:
1. Add the request/response types to `src/types.ts`
2. Add a method to `SlidelessClient` in `src/slidelessClient.ts`
3. Register a tool in the appropriate `src/tools/*.ts` file (with proper annotations)

## Local dev

```bash
npm install
npm run dev   # http://localhost:8787/mcp
```

Test with `npx @modelcontextprotocol/inspector`. Use a real `cko_*` key from `app.slideless.ai`; the Worker fails fast on bad keys via `verifyApiKey`.

## Deploy

```bash
npm run deploy
```

First deploy → `https://slideless-mcp.<account>.workers.dev/mcp`. Custom domain `mcp.slideless.ai` is bound via the `routes` block in `wrangler.jsonc` once DNS is configured.

## Vault

No `.env` required — the Slideless API base URL is in `wrangler.jsonc` under `vars` (non-secret), and the auth key comes from the user via the connector header. No vault entry needed.
