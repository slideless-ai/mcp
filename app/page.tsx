/**
 * Landing page served at `/`. Static info page for humans who hit the server
 * URL in a browser — the actual MCP traffic is POSTed to `/mcp`.
 */

const wrap: React.CSSProperties = {
  font: "16px/1.5 system-ui, -apple-system, sans-serif",
  maxWidth: 640,
  margin: "4rem auto",
  padding: "0 1.5rem",
  color: "#111",
};
const code: React.CSSProperties = {
  background: "#f4f4f5",
  padding: "1px 6px",
  borderRadius: 4,
};

export default function Home() {
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        Slideless MCP server
      </h1>
      <p>
        This is the <strong>Slideless</strong> Model Context Protocol server.
        Add it as a connector in Claude or ChatGPT to list, share, and manage
        your HTML presentations from chat.
      </p>
      <ul>
        <li>
          Connector URL (POST endpoint): <code style={code}>https://mcp.slideless.ai/mcp</code>
        </li>
        <li>
          Authentication: OAuth (your host signs you in), or a static{" "}
          <code style={code}>Authorization: Bearer cko_…</code> key for hosts
          that support custom headers
        </li>
        <li>
          Get a key at{" "}
          <a href="https://app.slideless.ai" style={{ color: "#2563eb" }}>
            app.slideless.ai
          </a>{" "}
          (Settings → API Keys)
        </li>
      </ul>
      <p>
        Setup guide:{" "}
        <a href="https://docs.slideless.ai/mcp" style={{ color: "#2563eb" }}>
          docs.slideless.ai/mcp
        </a>
      </p>
    </main>
  );
}
