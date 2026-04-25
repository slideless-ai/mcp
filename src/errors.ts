import type { ApiErrorBody } from "./types.js";

/**
 * Error thrown when the Slideless HTTP API returns a non-2xx response or a
 * `{success: false, error}` envelope. Carries the canonical error code so
 * tool handlers can short-circuit with a clean message.
 */
export class SlidelessApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly nextAction?: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "SlidelessApiError";
    this.status = status;
    this.code = body.code;
    this.nextAction = body.nextAction;
    this.details = body.details;
  }

  toUserFacingText(): string {
    const lines = [`${this.code}: ${this.message}`];
    if (this.nextAction) lines.push(`Next: ${this.nextAction}`);
    return lines.join("\n");
  }
}

/**
 * Wrap a tool body so any thrown SlidelessApiError surfaces as a structured
 * MCP tool error response (`isError: true` + a text block) rather than a
 * protocol-level exception. Other errors propagate.
 */
export async function wrapToolErrors<T>(
  fn: () => Promise<T>,
): Promise<
  | { content: Array<{ type: "text"; text: string }>; isError: true }
  | T
> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SlidelessApiError) {
      return {
        content: [{ type: "text", text: err.toUserFacingText() }],
        isError: true,
      };
    }
    throw err;
  }
}
