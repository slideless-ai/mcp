import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { wrapToolErrors } from "../errors.js";
import type { SlidelessClient } from "../slidelessClient.js";
import type { VersionFile } from "../types.js";

// ============================================================================
// Helpers
// ============================================================================

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

interface PreparedFile {
  path: string;
  bytes: Uint8Array;
  sha256: string;
  size: number;
  contentType: string;
}

/**
 * Run the 3-step upload: precheck → uploadPresentationAsset (per missing hash) → commit.
 * Same orchestration as the slideless CLI's `push` command, adapted for inline content.
 */
async function runUpload(
  client: SlidelessClient,
  args: {
    title: string;
    entryPath: string;
    files: PreparedFile[];
    presentationId?: string;
  },
): Promise<{ presentationId: string; version: number; role: "owner" | "dev"; assetsUploaded: number; totalBytes: number }> {
  const hashes = [...new Set(args.files.map((f) => f.sha256))];
  const precheck = await client.precheckAssets({
    presentationId: args.presentationId,
    hashes,
  });

  const sessionId = precheck.sessionId;
  const reservedPresentationId = precheck.presentationId ?? args.presentationId;

  // Upload each missing blob exactly once (dedup across duplicate-content files).
  const missingSet = new Set(precheck.missing);
  const uploadedHashes = new Set<string>();
  let totalBytes = 0;
  for (const file of args.files) {
    if (!missingSet.has(file.sha256) || uploadedHashes.has(file.sha256)) continue;
    await client.uploadPresentationAsset({
      sessionId,
      presentationId: args.presentationId,
      sha256: file.sha256,
      contentType: file.contentType,
      body: file.bytes,
    });
    uploadedHashes.add(file.sha256);
    totalBytes += file.size;
  }

  const manifestFiles: VersionFile[] = args.files.map((f) => ({
    path: f.path,
    sha256: f.sha256,
    size: f.size,
    contentType: f.contentType,
  }));

  const commit = await client.commitPresentationVersion({
    presentationId: args.presentationId,
    sessionId,
    title: args.title,
    entryPath: args.entryPath,
    files: manifestFiles,
  });

  return {
    presentationId: commit.presentationId,
    version: commit.version,
    role: commit.role,
    assetsUploaded: uploadedHashes.size,
    totalBytes,
  };
}

// ============================================================================
// Tools
// ============================================================================

export function registerUploadTools(
  server: McpServer,
  client: SlidelessClient,
): void {
  server.registerTool(
    "slideless_upload_html_presentation",
    {
      description:
        "Uploads a single-file HTML presentation to Slideless. Pass the full HTML as a string. Pass `presentationId` to add a new version to an existing deck; omit it to create a new deck. Returns the presentationId and version. To get a shareable URL, call `slideless_add_share_token` after this.",
      inputSchema: {
        title: z
          .string()
          .min(1)
          .describe("Human-readable title for the presentation."),
        html: z
          .string()
          .min(1)
          .describe(
            "Full HTML content for the presentation (will be uploaded as `index.html`).",
          ),
        presentationId: z
          .string()
          .optional()
          .describe(
            "Optional: existing presentation ID to update with a new version. Omit to create a new presentation.",
          ),
      },
    },
    async ({ title, html, presentationId }) =>
      wrapToolErrors(async () => {
        const bytes = new TextEncoder().encode(html);
        const file: PreparedFile = {
          path: "index.html",
          bytes,
          sha256: await sha256Hex(bytes),
          size: bytes.byteLength,
          contentType: "text/html; charset=utf-8",
        };
        const result = await runUpload(client, {
          title,
          entryPath: "index.html",
          files: [file],
          presentationId,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_upload_presentation_files",
    {
      description:
        "Uploads a multi-file HTML presentation (HTML + CSS + JS + images, etc.). Each file's content is base64-encoded. Total payload should stay under ~1 MB; for larger decks use the slideless CLI. Pass `presentationId` to add a new version to an existing deck. Returns the presentationId and version. Call `slideless_add_share_token` after to get a shareable URL.",
      inputSchema: {
        title: z
          .string()
          .min(1)
          .describe("Human-readable title for the presentation."),
        entryPath: z
          .string()
          .describe(
            "Relative path of the entry HTML inside the deck (e.g. 'index.html'). Must match one of the files.",
          ),
        files: z
          .array(
            z.object({
              path: z
                .string()
                .describe(
                  "Relative path inside the deck (e.g. 'index.html', 'assets/logo.png'). Forward slashes only.",
                ),
              content_b64: z
                .string()
                .describe("File contents, base64-encoded."),
              contentType: z
                .string()
                .describe(
                  "MIME type (e.g. 'text/html; charset=utf-8', 'image/png', 'application/javascript').",
                ),
            }),
          )
          .min(1)
          .describe("Files comprising the deck."),
        presentationId: z
          .string()
          .optional()
          .describe(
            "Optional: existing presentation ID to update with a new version.",
          ),
      },
    },
    async ({ title, entryPath, files, presentationId }) =>
      wrapToolErrors(async () => {
        const prepared: PreparedFile[] = await Promise.all(
          files.map(async (f) => {
            const bytes = decodeBase64(f.content_b64);
            return {
              path: f.path,
              bytes,
              sha256: await sha256Hex(bytes),
              size: bytes.byteLength,
              contentType: f.contentType,
            };
          }),
        );
        const result = await runUpload(client, {
          title,
          entryPath,
          files: prepared,
          presentationId,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }),
  );
}
