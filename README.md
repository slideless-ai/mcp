# slideless-mcp

MCP server for Slideless. Wraps the Slideless HTTP API as Model Context Protocol tools so users can list, share, upload, and manage HTML presentations from any MCP host (Claude Desktop, claude.ai, ChatGPT desktop, Cursor, etc.) without installing the `slideless` CLI.

## Architecture

Stateless Cloudflare Worker (Durable Object per session for MCP state). The Worker forwards the user's `Authorization: Bearer cko_…` header to the Slideless Cloud Functions in `europe-west1`. No database, no secrets to rotate — the user's API key never leaves the connector header.

```
Claude / ChatGPT  →  mcp.slideless.ai/mcp  (Cloudflare Worker)
                          │
                          ▼
                 europe-west1-slideless-ai.cloudfunctions.net
```

## Use as a connector

1. Sign in at https://app.slideless.ai → Settings → API Keys → Create
2. Copy the `cko_…` key (shown once)
3. In Claude Desktop: Settings → Connectors → Add custom connector
   - URL: `https://mcp.slideless.ai/mcp`
   - Header: `Authorization: Bearer cko_…`
4. Connect. The server validates the key on connect; bad keys fail fast.

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

## Local development

```bash
npm install
npm run dev           # wrangler dev → http://localhost:8787
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Set transport: HTTP (streamable)
# URL: http://localhost:8787/mcp
# Header: Authorization: Bearer cko_<your-key>
```

## Deploy

```bash
npm run deploy
```

The first deploy creates the Worker at `https://slideless-mcp.<account>.workers.dev/mcp`. Bind the custom domain `mcp.slideless.ai` via Cloudflare dashboard or `wrangler deploy --routes` once DNS is in place.

Type checking:
```bash
npm run typecheck
```

## Source layout

```
src/
├── index.ts              # Worker entry: routing, rate limiting, McpAgent
├── server.ts             # Tool registration entry point
├── slidelessClient.ts    # Typed fetch wrapper around Cloud Functions
├── types.ts              # Wire shapes (mirrors slideless-app types/)
├── errors.ts             # SlidelessApiError + wrapToolErrors helper
└── tools/
    ├── identity.ts       # slideless_whoami
    ├── presentations.ts  # list / get / versions / download / delete
    ├── upload.ts         # upload_html / upload_files (3-step orchestration)
    ├── sharing.ts        # tokens, version mode, unshare, email
    └── collaborators.ts  # invite / uninvite / list
```

## Related repos

- [`slideless-app`](https://github.com/slideless-ai/app) — backend Cloud Functions this server proxies
- [`slideless-cli`](https://github.com/slideless-ai/cli) — npm CLI that uses the same API
- [`slideless-plugin`](https://github.com/slideless-ai/plugin) — Claude Code plugin (companion authoring + upload skills)
