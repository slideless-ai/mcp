/**
 * Static configuration for the Slideless MCP server.
 *
 * The Slideless API base URL is non-secret and overridable via env. The auth
 * key itself never lives here — it arrives per-request in the `Authorization`
 * header (a `cko_` static key or an OAuth JWT issued by app.slideless.ai) and
 * is forwarded verbatim to the Cloud Functions.
 */

export const SLIDELESS_API_BASE_URL =
  process.env.SLIDELESS_API_BASE_URL ??
  "https://europe-west1-slideless-ai.cloudfunctions.net";

/** OAuth 2.1 authorization server that issues tokens for this resource. */
export const AUTH_SERVER_URL = "https://app.slideless.ai";

/**
 * Server identity advertised in the MCP `initialize` response. Includes
 * SEP-973 display metadata (`title`, `icons`) for hosts that surface server
 * branding (Claude Desktop's connector list, ChatGPT's app surface). Rendering
 * is client-dependent and rolling out — advertising it costs nothing.
 */
export const SERVER_INFO = {
  name: "slideless",
  version: "0.1.0",
  title: "Slideless",
  icons: [
    {
      src: "https://app.slideless.ai/apple-touch-icon.png",
      mimeType: "image/png",
      sizes: ["180x180"],
    },
    {
      src: "https://app.slideless.ai/favicon.svg",
      mimeType: "image/svg+xml",
    },
  ],
} as const;

export const INSTRUCTIONS =
  "Slideless hosts and shares HTML presentations. " +
  "Get your API key at https://app.slideless.ai (Settings → API Keys).";
