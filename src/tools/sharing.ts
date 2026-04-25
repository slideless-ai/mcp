import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { wrapToolErrors } from "../errors.js";
import type { SlidelessClient } from "../slidelessClient.js";
import type { TokenVersionMode } from "../types.js";

const versionModeSchema = z
  .union([
    z.object({ type: z.literal("latest") }),
    z.object({
      type: z.literal("pinned"),
      version: z.number().int().min(1),
    }),
  ])
  .describe(
    "How the share token resolves to a version. {type:'latest'} follows new uploads; {type:'pinned', version:N} freezes recipients on version N.",
  );

export function registerSharingTools(
  server: McpServer,
  client: SlidelessClient,
): void {
  server.registerTool(
    "slideless_add_share_token",
    {
      description:
        "Mints a new public share token for a presentation and returns the share URL. Each token can be revoked independently. Optionally pin the token to a specific version.",
      inputSchema: {
        presentationId: z
          .string()
          .describe("The presentation ID (UUIDv7)."),
        tokenName: z
          .string()
          .min(1)
          .describe(
            "Human-readable label for the token (e.g. 'Acme demo', 'public link'). Helps the owner identify it in the dashboard.",
          ),
        versionMode: versionModeSchema.optional(),
      },
    },
    async ({ presentationId, tokenName, versionMode }) =>
      wrapToolErrors(async () => {
        const result = await client.addPresentationToken({
          presentationId,
          tokenName,
          versionMode: versionMode as TokenVersionMode | undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: `Share URL: ${result.shareUrl}\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_set_token_version_mode",
    {
      description:
        "Pins or unpins an existing share token to a specific version. Use {type:'pinned',version:N} to freeze recipients, or {type:'latest'} to make the token follow future uploads.",
      inputSchema: {
        presentationId: z.string().describe("The presentation ID (UUIDv7)."),
        tokenId: z
          .string()
          .describe("The share token ID (from get_presentation.tokens[].tokenId)."),
        versionMode: versionModeSchema,
      },
    },
    async ({ presentationId, tokenId, versionMode }) =>
      wrapToolErrors(async () => {
        const result = await client.setTokenVersionMode({
          presentationId,
          tokenId,
          versionMode: versionMode as TokenVersionMode,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_unshare_presentation",
    {
      description:
        "Revokes share tokens. Pass `tokenId` to revoke a single token; omit it to revoke every active token on the presentation. Anyone holding a revoked link will lose access immediately.",
      inputSchema: {
        presentationId: z.string().describe("The presentation ID (UUIDv7)."),
        tokenId: z
          .string()
          .optional()
          .describe(
            "Optional: the specific share token ID to revoke. Omit to revoke every active token on the presentation.",
          ),
      },
      annotations: { destructiveHint: true },
    },
    async ({ presentationId, tokenId }) =>
      wrapToolErrors(async () => {
        const result = await client.unsharePresentation({
          presentationId,
          tokenId,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_share_via_email",
    {
      description:
        "Sends an invitation email to one or more recipients with a viewer link to the presentation. This actually sends real email — it does not draft. Each recipient receives a separate email with the share URL embedded.",
      inputSchema: {
        presentationId: z.string().describe("The presentation ID (UUIDv7)."),
        emails: z
          .array(z.string().email())
          .min(1)
          .max(20)
          .describe("Recipient email addresses (1-20)."),
        message: z
          .string()
          .optional()
          .describe("Optional personal message included in the email body."),
        subject: z
          .string()
          .optional()
          .describe("Optional custom subject line. Defaults to a Slideless-branded subject."),
        tokenId: z
          .string()
          .optional()
          .describe(
            "Optional: send via a specific existing share token. Omit to use (or auto-create) the default token.",
          ),
      },
      annotations: { openWorldHint: true },
    },
    async ({ presentationId, emails, message, subject, tokenId }) =>
      wrapToolErrors(async () => {
        const result = await client.sharePresentationViaEmail({
          presentationId,
          emails,
          message,
          subject,
          tokenId,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );
}
