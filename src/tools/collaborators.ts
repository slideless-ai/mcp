import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { wrapToolErrors } from "../errors.js";
import type { SlidelessClient } from "../slidelessClient.js";

export function registerCollaboratorTools(
  server: McpServer,
  client: SlidelessClient,
): void {
  server.registerTool(
    "slideless_invite_collaborator",
    {
      description:
        "Sends an invitation email granting another user dev (edit) access to a presentation. This actually sends real email. If the invitee already has a Slideless account the access is granted immediately; otherwise it lands as pending and is claimed on signup.",
      inputSchema: {
        presentationId: z.string().describe("The presentation ID (UUIDv7)."),
        email: z.string().email().describe("Email address of the user to invite."),
        message: z
          .string()
          .optional()
          .describe("Optional personal message included in the invitation email."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ presentationId, email, message }) =>
      wrapToolErrors(async () => {
        const result = await client.inviteCollaborator({
          presentationId,
          email,
          message,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_uninvite_collaborator",
    {
      description:
        "Revokes a collaborator's access to a presentation. The collaborator loses dev (edit) access immediately and can no longer view past versions through their account. Cannot be undone — re-inviting is a new invitation.",
      inputSchema: {
        presentationId: z.string().describe("The presentation ID (UUIDv7)."),
        collaboratorId: z
          .string()
          .describe("Collaborator ID (from list_collaborators or get_presentation.collaborators[].collaboratorId)."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ presentationId, collaboratorId }) =>
      wrapToolErrors(async () => {
        const result = await client.uninviteCollaborator({
          presentationId,
          collaboratorId,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_list_collaborators",
    {
      description:
        "Lists every collaborator on a presentation: pending, active, and revoked. Returns email, role, status, and timestamps.",
      inputSchema: {
        presentationId: z.string().describe("The presentation ID (UUIDv7)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ presentationId }) =>
      wrapToolErrors(async () => {
        const result = await client.listCollaborators(presentationId);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );
}
