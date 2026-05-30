import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Slideless MCP server",
  description:
    "Model Context Protocol server for Slideless — list, share, and manage HTML presentations from Claude, ChatGPT, and any MCP host.",
  icons: { icon: "https://app.slideless.ai/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
