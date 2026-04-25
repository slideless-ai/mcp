import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { wrapToolErrors } from "../errors.js";
import type { SlidelessClient } from "../slidelessClient.js";

export function registerPresentationTools(
  server: McpServer,
  client: SlidelessClient,
): void {
  server.registerTool(
    "slideless_list_presentations",
    {
      description:
        "Lists all Slideless presentations the user owns or has been invited to collaborate on. Returns titles, share URLs, view counts, and the user's role per deck.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      wrapToolErrors(async () => {
        const result = await client.listMyPresentations();
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_get_presentation",
    {
      description:
        "Fetches full info for a single presentation: tokens, collaborators, version count, view stats, and the primary share URL.",
      inputSchema: {
        presentationId: z
          .string()
          .describe("The presentation ID (UUIDv7) — found in list_presentations or in the share URL."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ presentationId }) =>
      wrapToolErrors(async () => {
        const result = await client.getSharedPresentationInfo(presentationId);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_list_versions",
    {
      description:
        "Lists every version of a presentation in chronological order. Each version is immutable; uploads append a new version.",
      inputSchema: {
        presentationId: z
          .string()
          .describe("The presentation ID (UUIDv7)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ presentationId }) =>
      wrapToolErrors(async () => {
        const result = await client.listPresentationVersions(presentationId);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_get_version",
    {
      description:
        "Fetches the manifest for a specific version of a presentation: title, entry path, and the list of files (path, sha256, size, contentType).",
      inputSchema: {
        presentationId: z
          .string()
          .describe("The presentation ID (UUIDv7)."),
        version: z
          .number()
          .int()
          .min(1)
          .describe("The version number (>= 1). Get current version from list_versions or get_presentation."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ presentationId, version }) =>
      wrapToolErrors(async () => {
        const result = await client.getPresentationVersion(
          presentationId,
          version,
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_download_version",
    {
      description:
        "Downloads a specific version of a presentation. Returns the manifest plus the inline contents of every text file (HTML/CSS/JS/SVG/JSON/etc.) up to 256 KB each — ideal for reading or modifying a deck's HTML in chat. Binary or oversized files are listed as metadata only.",
      inputSchema: {
        presentationId: z
          .string()
          .describe("The presentation ID (UUIDv7)."),
        version: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "Optional version number; defaults to the latest version.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ presentationId, version }) =>
      wrapToolErrors(async () => {
        const versions = await client.listPresentationVersions(presentationId);
        const resolvedVersion = version ?? versions.currentVersion;
        const manifest = await client.getPresentationVersion(
          presentationId,
          resolvedVersion,
        );

        const MAX_INLINE_BYTES = 256 * 1024;
        const TEXT_TYPE_RE = /^(text\/|application\/(json|javascript|xml|xhtml\+xml|svg\+xml))/i;

        const filesOut = await Promise.all(
          manifest.files.map(async (f) => {
            const isText = TEXT_TYPE_RE.test(f.contentType);
            const small = f.size <= MAX_INLINE_BYTES;
            if (!isText || !small) {
              return {
                path: f.path,
                sha256: f.sha256,
                size: f.size,
                contentType: f.contentType,
                inline: false as const,
                reason: !isText
                  ? "binary content; not inlined"
                  : `file is ${f.size} bytes (exceeds 256 KB inline cap)`,
              };
            }
            try {
              const { bytes } = await client.downloadPresentationAsset({
                presentationId,
                sha256: f.sha256,
                version: resolvedVersion,
              });
              const text = new TextDecoder("utf-8").decode(bytes);
              return {
                path: f.path,
                sha256: f.sha256,
                size: f.size,
                contentType: f.contentType,
                inline: true as const,
                content: text,
              };
            } catch (err) {
              return {
                path: f.path,
                sha256: f.sha256,
                size: f.size,
                contentType: f.contentType,
                inline: false as const,
                reason: `download failed: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          }),
        );

        const result = {
          presentationId,
          version: resolvedVersion,
          title: manifest.title,
          entryPath: manifest.entryPath,
          createdAt: manifest.createdAt,
          createdBy: manifest.createdBy,
          createdByRole: manifest.createdByRole,
          files: filesOut,
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_delete_presentation",
    {
      description:
        "Permanently deletes a presentation, including every version and every share token. Cannot be undone. Only the owner can delete.",
      inputSchema: {
        presentationId: z
          .string()
          .describe("The presentation ID (UUIDv7) to delete."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ presentationId }) =>
      wrapToolErrors(async () => {
        const result = await client.deletePresentation(presentationId);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );
}
