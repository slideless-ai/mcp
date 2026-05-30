import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { SlidelessClient } from "./slidelessClient";
import { registerCollaboratorTools } from "./tools/collaborators";
import { registerIdentityTools } from "./tools/identity";
import { registerMarketplaceTools } from "./tools/marketplace";
import { registerPresentationTools } from "./tools/presentations";
import { registerSharingTools } from "./tools/sharing";
import { registerUploadTools } from "./tools/upload";

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
  registerMarketplaceTools(server, client);
}
