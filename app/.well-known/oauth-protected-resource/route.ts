/**
 * RFC 9728 protected-resource metadata — `GET /.well-known/oauth-protected-resource`.
 *
 * Required by the MCP spec for hosts that auto-discover auth (Claude Desktop,
 * claude.ai). Points OAuth-aware clients at app.slideless.ai as the
 * authorization server.
 */

import { protectedResourceMetadata, corsPreflightResponse } from "@/http";

export const runtime = "nodejs";

export function GET(req: Request): Response {
  return protectedResourceMetadata(req);
}

export function OPTIONS(): Response {
  return corsPreflightResponse();
}
