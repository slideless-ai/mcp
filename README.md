# slideless-mcp

MCP server for Slideless. Wraps the Slideless HTTP API as Model Context Protocol tools so users can list, share, upload, and manage HTML presentations from any MCP host (Claude Desktop, claude.ai, ChatGPT desktop, Cursor, etc.) without installing the `slideless` CLI.

Hosted on **Vercel** (Next.js App Router + [`mcp-handler`](https://www.npmjs.com/package/mcp-handler)) at **`https://mcp.slideless.ai/mcp`**. Listed on the official MCP registry as **`ai.slideless/mcp`**.

## Architecture

Stateless Next.js route handler — streamable-HTTP transport, no session store. A per-request `McpServer` is built on each `/mcp` call and the user's `Authorization` header is forwarded verbatim to the Slideless Cloud Functions in `europe-west1`. No database, no secrets to rotate — the user's token never leaves the request.

```
Claude / ChatGPT  →  mcp.slideless.ai/mcp  (Vercel / Next.js)
                          │
                          ▼
                 europe-west1-slideless-ai.cloudfunctions.net
```

## Authentication

The server is an OAuth 2.1 **resource server**. It does not host the auth flow itself — it advertises `app.slideless.ai` as the authorization server and forwards tokens to the Cloud Functions, which validate them. Two header styles are accepted, both forwarded verbatim:

- **OAuth (recommended)** — hosts that speak OAuth (Claude Desktop, claude.ai) discover the flow automatically: a no-auth request to `/mcp` returns `401` with a `WWW-Authenticate` header pointing at `/.well-known/oauth-protected-resource` (RFC 9728), which points at `app.slideless.ai`. The user signs in / signs up and consents in-browser; no key is ever pasted. New API keys are minted invisibly by the authorization server.
- **Static API key** — hosts that support custom headers (Cursor, Claude Code) can send `Authorization: Bearer cko_…` directly.

### Use as a connector

1. In Claude Desktop / claude.ai / ChatGPT: add a custom connector with URL `https://mcp.slideless.ai/mcp`.
2. The host discovers OAuth and opens the Slideless sign-in. Authorize, and you're connected.
3. (Static-key hosts only) Get a `cko_…` key at https://app.slideless.ai → Settings → API Keys, and set it as the `Authorization` header.

## Tools

| Tool | What it does |
|---|---|
| `slideless_whoami` | Identity check — returns org, key name, scopes |
| `slideless_list_presentations` | List owned + invited presentations |
| `slideless_get_presentation` | Full info for one presentation (tokens, collaborators) |
| `slideless_list_versions` | Version history of a presentation |
| `slideless_get_version` | Manifest of a specific version |
| `slideless_download_version` | Manifest + inline text-file contents (HTML/CSS/JS up to 256 KB each) |
| `slideless_upload_html_presentation` | Upload a single-file HTML deck |
| `slideless_upload_presentation_files` | Upload a multi-file deck (base64 array) |
| `slideless_add_share_token` | Mint a public viewer URL |
| `slideless_set_token_version_mode` | Pin or unpin a token to a version |
| `slideless_unshare_presentation` | Revoke one or all share tokens |
| `slideless_share_via_email` | Send the share URL by email |
| `slideless_invite_collaborator` | Grant another user dev access (sends email) |
| `slideless_uninvite_collaborator` | Revoke a collaborator |
| `slideless_list_collaborators` | List collaborators on a presentation |
| `slideless_delete_presentation` | Permanently delete a presentation |
| `slideless_search_marketplace` | Search the public marketplace for remixable presentations, apps, and plans (no key) |
| `slideless_get_marketplace_listing` | Full detail for one marketplace listing by slug (no key) |
| `slideless_remix_listing` | Remix a listing — returns the manifest plus inline contents of every text file (no key) |
| `slideless_publish_listing` | Publish a pushed presentation to the marketplace (requires `marketplace:publish` scope) |
| `slideless_star_listing` | Star a marketplace listing on behalf of the connected user |
| `slideless_unstar_listing` | Remove the connected user's star from a listing |

## Local development

```bash
pnpm install
pnpm dev            # next dev → http://localhost:8787
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP
# URL: http://localhost:8787/mcp
# Header: Authorization: Bearer cko_<your-key>
```

Or with raw curl (initialize handshake):

```bash
curl -s http://localhost:8787/mcp -X POST \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer cko_<your-key>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

Type checking: `pnpm typecheck`.

## Deploy

Pushed to `main` → Vercel auto-deploys production (project `codika/slideless-mcp`). Manual deploy:

```bash
vercel deploy --prod --scope codika
```

**Rate limiting** uses `@vercel/firewall`. Two custom Firewall rules must exist in the project dashboard (the code references them by ID; until they exist, limiting fails open):

- `mcp-per-ip` → 60 requests / 10s
- `mcp-per-key` → 600 requests / 60s

## Source layout

```
app/
├── layout.tsx                                  # minimal root layout
├── page.tsx                                    # landing page (/)
├── [transport]/route.ts                        # MCP endpoint (/mcp); per-request client + 401 challenge
└── .well-known/oauth-protected-resource/route.ts  # RFC 9728 metadata → app.slideless.ai
src/
├── config.ts             # base URL, server identity (SEP-973 branding), instructions
├── http.ts               # OAuth metadata, CORS, 401 challenge builders
├── rateLimit.ts          # @vercel/firewall per-IP / per-key limits
├── server.ts             # registerAllTools entry point
├── slidelessClient.ts    # typed fetch wrapper around the Cloud Functions
├── types.ts              # wire shapes (mirrors slideless-app types/)
├── errors.ts             # SlidelessApiError + wrapToolErrors
└── tools/
    ├── identity.ts       # slideless_whoami
    ├── presentations.ts  # list / get / versions / download / delete
    ├── upload.ts         # upload_html / upload_files (3-step orchestration)
    ├── sharing.ts        # tokens, version mode, unshare, email
    ├── collaborators.ts  # invite / uninvite / list
    └── marketplace.ts    # search / get / remix / publish / star / unstar
server.json               # MCP registry metadata (ai.slideless/mcp)
```

## Related repos

- [`slideless-app`](https://github.com/slideless-ai/app) — backend Cloud Functions this server proxies (also hosts the OAuth 2.1 authorization server)
- [`slideless-cli`](https://github.com/slideless-ai/cli) — npm CLI that uses the same API
- [`slideless-plugin`](https://github.com/slideless-ai/plugin) — Claude Code plugin (companion authoring + upload skills)
