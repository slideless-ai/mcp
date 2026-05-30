/**
 * MCP endpoint — `POST /mcp` (streamable HTTP).
 *
 * Stateless proxy. Each request carries `Authorization: Bearer <token>` (a
 * `cko_` static key or an OAuth JWT from app.slideless.ai). We build a fresh
 * `SlidelessClient` from that header and a per-request MCP handler whose
 * initializer closes over it — so `registerAllTools(server, client)` and every
 * tool file are reused unchanged. The header is forwarded verbatim to the
 * Slideless Cloud Functions, which do the real validation. No token logic, no
 * DB, no cached secrets here.
 *
 * The `[transport]` segment resolves to `/mcp` (SSE is disabled, so `/sse` is
 * not served). Auth presence is checked before the handler so a missing key
 * returns the RFC 9728 challenge that drives OAuth discovery.
 */

import { createMcpHandler } from "mcp-handler";

import { SlidelessClient } from "@/slidelessClient";
import { registerAllTools } from "@/server";
import { SERVER_INFO, INSTRUCTIONS, SLIDELESS_API_BASE_URL } from "@/config";
import { rateLimit } from "@/rateLimit";
import { unauthorizedResponse, corsPreflightResponse } from "@/http";

export const runtime = "nodejs";
export const maxDuration = 60;

function handlerFor(client: SlidelessClient) {
  return createMcpHandler(
    (server) => registerAllTools(server, client),
    // mcp-handler's type only declares `serverInfo: { name, version }`, but it
    // passes the object through verbatim to `new McpServer(serverInfo, …)`, so
    // the SEP-973 `title`/`icons` flow through to the initialize response.
    {
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    } as unknown as Parameters<typeof createMcpHandler>[1],
    { basePath: "", disableSse: true, verboseLogs: false },
  );
}

async function handle(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");

  const limited = await rateLimit(req, authHeader);
  if (limited) return limited;

  if (!authHeader) return unauthorizedResponse(req);

  const client = new SlidelessClient(SLIDELESS_API_BASE_URL, authHeader);
  return handlerFor(client)(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS(): Response {
  return corsPreflightResponse();
}
