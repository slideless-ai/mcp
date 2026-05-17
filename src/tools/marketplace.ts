import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { wrapToolErrors } from "../errors.js";
import type { SlidelessClient } from "../slidelessClient.js";

const kindSchema = z
  .enum(["presentation", "app", "plan"])
  .describe(
    "Listing kind, categorized by purpose. `presentation` is the message — a deck you view (static or interactive). `app` is the machine — a self-contained HTML app you operate (always interactive). `plan` is the blueprint — an agent-executable build plan.",
  );

const interactiveSchema = z
  .boolean()
  .describe(
    "Whether the listing is interactive. Interactivity is a badge, not a category — a `presentation` can be static or interactive. The backend forces `true` for `app`; defaults to `false` for `presentation`.",
  );

export function registerMarketplaceTools(
  server: McpServer,
  client: SlidelessClient,
): void {
  server.registerTool(
    "slideless_search_marketplace",
    {
      description:
        "Searches the public Slideless marketplace for remixable presentations, apps, and plans. Public — works without an API key. Returns listings with slug, title, kind, interactive flag, tags, and popularity counts. Use the returned `slug` with slideless_remix_listing to copy a listing.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Free-text search term. Omit to list everything (subject to filters)."),
        kind: kindSchema.optional(),
        tag: z
          .string()
          .optional()
          .describe("Filter to listings carrying this tag."),
        category: z
          .string()
          .optional()
          .describe("Filter to a single category bucket."),
        sort: z
          .enum(["recent", "popular", "stars"])
          .optional()
          .describe(
            "Sort order: `recent` (newest first), `popular` (most remixed/viewed), or `stars` (most starred).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of listings to return (1-100)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, kind, tag, category, sort, limit }) =>
      wrapToolErrors(async () => {
        const result = await client.listMarketplaceListings({
          query,
          kind,
          tag,
          category,
          sort,
          limit,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "slideless_get_marketplace_listing",
    {
      description:
        "Fetches full detail for a single marketplace listing by slug: description, README, tags, entry path, file count, and popularity stats. Public — works without an API key.",
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe("The marketplace listing slug (from slideless_search_marketplace or a marketplace URL)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) =>
      wrapToolErrors(async () => {
        const result = await client.getMarketplaceListing(slug);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "slideless_remix_listing",
    {
      description:
        "Remixes a public marketplace listing: returns the listing manifest plus the inline contents of every text file (HTML/CSS/JS/SVG/JSON/etc.) up to 256 KB each — ideal for copying a deck into chat to customize. Binary or oversized files are listed as metadata only. Public — works without an API key. The returned files are an unlinked copy; upload them with the upload tools to create your own deck.",
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe("The marketplace listing slug to remix."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) =>
      wrapToolErrors(async () => {
        const listing = await client.getMarketplaceListing(slug);
        const fileSet = await client.getMarketplaceListingFiles(slug);

        const MAX_INLINE_BYTES = 256 * 1024;
        const TEXT_TYPE_RE =
          /^(text\/|application\/(json|javascript|xml|xhtml\+xml|svg\+xml))/i;

        const filesOut = await Promise.all(
          fileSet.files.map(async (f) => {
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
              const { bytes } = await client.downloadMarketplaceAsset({
                slug,
                sha256: f.sha256,
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
                reason: `download failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              };
            }
          }),
        );

        // Fire-and-forget remix counter — never block or fail the remix on it.
        void client.recordMarketplaceRemix(slug).catch(() => {});

        const result = {
          slug: listing.slug,
          kind: listing.kind,
          title: listing.title,
          description: listing.description,
          entryPath: fileSet.entryPath,
          publishedVersion: listing.publishedVersion,
          linked: false,
          files: filesOut,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "slideless_publish_listing",
    {
      description:
        "Publishes an existing pushed presentation to the public Slideless marketplace as a `presentation`, `app`, or `plan`. Requires an API key with the `marketplace:publish` scope. The `kind` is fixed at publish time and cannot be changed afterward.",
      inputSchema: {
        presentationId: z
          .string()
          .describe("The presentation ID (UUIDv7) of an already-pushed deck."),
        kind: kindSchema,
        interactive: interactiveSchema.optional(),
        description: z
          .string()
          .min(1)
          .describe("Short marketplace blurb describing the listing and who it's for."),
        slug: z
          .string()
          .optional()
          .describe("URL slug under slideless.ai/marketplace/. Auto-derived from the title if omitted; must be unique."),
        title: z
          .string()
          .optional()
          .describe("Display title for the listing. Defaults to the deck's title."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for search and filtering (e.g. ['pitch','saas','dark'])."),
        category: z
          .string()
          .optional()
          .describe("Single category bucket (e.g. 'pitch-decks', 'utilities')."),
        version: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Which pushed version to publish. Defaults to the deck's latest version."),
      },
    },
    async ({ presentationId, kind, interactive, description, slug, title, tags, category, version }) =>
      wrapToolErrors(async () => {
        const result = await client.publishMarketplaceListing({
          presentationId,
          kind,
          interactive,
          description,
          slug,
          title,
          tags,
          category,
          version,
        });
        return {
          content: [
            {
              type: "text",
              text: `Marketplace URL: ${result.marketplaceUrl}\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }),
  );

  server.registerTool(
    "slideless_star_listing",
    {
      description:
        "Stars a marketplace listing on behalf of the connected user, bumping its star count. Requires an API key.",
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe("The marketplace listing slug to star."),
      },
    },
    async ({ slug }) =>
      wrapToolErrors(async () => {
        const result = await client.starMarketplaceListing(slug);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "slideless_unstar_listing",
    {
      description:
        "Removes the connected user's star from a marketplace listing. Requires an API key.",
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe("The marketplace listing slug to unstar."),
      },
    },
    async ({ slug }) =>
      wrapToolErrors(async () => {
        const result = await client.unstarMarketplaceListing(slug);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }),
  );
}
