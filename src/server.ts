import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { SlidelessClient } from "./slidelessClient.js";
import { registerCollaboratorTools } from "./tools/collaborators.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerPresentationTools } from "./tools/presentations.js";
import { registerSharingTools } from "./tools/sharing.js";
import { registerUploadTools } from "./tools/upload.js";

/**
 * Register every MCP tool on the given server. Called once per request in the
 * Worker fetch handler. Cheap — no I/O during registration.
 */
export function registerAllTools(
  server: McpServer,
  client: SlidelessClient,
): void {
  registerIdentityTools(server, client);
  registerPresentationTools(server, client);
  registerSharingTools(server, client);
  registerCollaboratorTools(server, client);
  registerUploadTools(server, client);
}
