import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { wrapToolErrors } from "../errors.js";
import type { SlidelessClient } from "../slidelessClient.js";

export function registerIdentityTools(
  server: McpServer,
  client: SlidelessClient,
): void {
  server.registerTool(
    "slideless_whoami",
    {
      description:
        "Returns the identity associated with the connected API key: organization, key name, scopes, and timestamps. Useful as a sanity check that the connector is configured correctly.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      wrapToolErrors(async () => {
        const result = await client.whoami();
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );
}
