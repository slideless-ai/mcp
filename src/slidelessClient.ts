import { SlidelessApiError } from "./errors.js";
import type {
  AddPresentationTokenInput,
  AddPresentationTokenOutput,
  ApiResponse,
  CommitPresentationVersionInput,
  CommitPresentationVersionOutput,
  DeletePresentationOutput,
  GetPresentationVersionOutput,
  InviteCollaboratorInput,
  InviteCollaboratorOutput,
  ListCollaboratorsOutput,
  ListMyPresentationsOutput,
  ListPresentationVersionsOutput,
  PrecheckAssetsInput,
  PrecheckAssetsOutput,
  PresentationInfo,
  SetTokenVersionModeInput,
  SetTokenVersionModeOutput,
  SharePresentationViaEmailInput,
  SharePresentationViaEmailOutput,
  UninviteCollaboratorInput,
  UninviteCollaboratorOutput,
  UnsharePresentationInput,
  UnsharePresentationOutput,
  UploadPresentationAssetOutput,
  VerifyApiKeyOutput,
} from "./types.js";

/**
 * Typed thin wrapper around the Slideless HTTP Cloud Functions.
 *
 * One instance per MCP session. Holds the user's `Authorization` header value
 * (forwarded verbatim) and the Cloud Functions base URL.
 */
export class SlidelessClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authHeader: string,
  ) {}

  // --------------------------------------------------------------------------
  // Identity
  // --------------------------------------------------------------------------

  whoami(): Promise<VerifyApiKeyOutput> {
    return this.post<VerifyApiKeyOutput>("/verifyApiKey");
  }

  // --------------------------------------------------------------------------
  // Presentations
  // --------------------------------------------------------------------------

  listMyPresentations(): Promise<ListMyPresentationsOutput> {
    return this.get<ListMyPresentationsOutput>("/listMyPresentations");
  }

  getSharedPresentationInfo(presentationId: string): Promise<PresentationInfo> {
    const url = `/getSharedPresentationInfo?presentationId=${encodeURIComponent(presentationId)}`;
    return this.get<PresentationInfo>(url);
  }

  listPresentationVersions(
    presentationId: string,
  ): Promise<ListPresentationVersionsOutput> {
    const url = `/listPresentationVersions?presentationId=${encodeURIComponent(presentationId)}`;
    return this.get<ListPresentationVersionsOutput>(url);
  }

  getPresentationVersion(
    presentationId: string,
    version: number,
  ): Promise<GetPresentationVersionOutput> {
    const url =
      `/getPresentationVersion?presentationId=${encodeURIComponent(presentationId)}` +
      `&version=${encodeURIComponent(String(version))}`;
    return this.get<GetPresentationVersionOutput>(url);
  }

  deletePresentation(presentationId: string): Promise<DeletePresentationOutput> {
    return this.post<DeletePresentationOutput>("/deletePresentation", {
      presentationId,
    });
  }

  /**
   * Stream a single content-addressed blob. Returns the raw bytes + the
   * server's reported content-type. Caller decides what to do with it
   * (decode as text, return as base64, etc.).
   */
  async downloadPresentationAsset(args: {
    presentationId: string;
    sha256: string;
    version?: number;
  }): Promise<{ bytes: Uint8Array; contentType: string }> {
    const params = new URLSearchParams();
    params.set("presentationId", args.presentationId);
    params.set("sha256", args.sha256);
    if (args.version !== undefined) {
      params.set("version", String(args.version));
    }
    const url = `${this.baseUrl}/downloadPresentationAsset?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      // Asset endpoints don't always return the success/data envelope on
      // streaming success, but errors do — try to parse one.
      try {
        const body = (await res.json()) as {
          success: false;
          error: { code: string; message: string };
        };
        if (body.success === false) {
          throw new SlidelessApiError(res.status, body.error);
        }
      } catch {
        // Fall through to the generic error below.
      }
      throw new SlidelessApiError(res.status, {
        code: `http-${res.status}`,
        message: `Slideless returned HTTP ${res.status} for asset download.`,
      });
    }
    const buf = await res.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
    };
  }

  // --------------------------------------------------------------------------
  // Upload (raw 3-step flow — orchestrated by the upload tools)
  // --------------------------------------------------------------------------

  precheckAssets(input: PrecheckAssetsInput): Promise<PrecheckAssetsOutput> {
    return this.post<PrecheckAssetsOutput>("/precheckAssets", input);
  }

  /**
   * Upload a single asset blob. The Cloud Function expects the raw bytes as
   * the request body and the metadata in query params.
   */
  async uploadPresentationAsset(args: {
    sessionId?: string;
    presentationId?: string;
    sha256: string;
    contentType: string;
    body: ArrayBuffer | Uint8Array;
  }): Promise<UploadPresentationAssetOutput> {
    const params = new URLSearchParams();
    if (args.sessionId) params.set("sessionId", args.sessionId);
    if (args.presentationId) params.set("presentationId", args.presentationId);
    params.set("sha256", args.sha256);
    const url = `${this.baseUrl}/uploadPresentationAsset?${params.toString()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": args.contentType || "application/octet-stream",
      },
      body: args.body,
    });
    return this.unwrap<UploadPresentationAssetOutput>(res);
  }

  commitPresentationVersion(
    input: CommitPresentationVersionInput,
  ): Promise<CommitPresentationVersionOutput> {
    return this.post<CommitPresentationVersionOutput>(
      "/commitPresentationVersion",
      input,
    );
  }

  // --------------------------------------------------------------------------
  // Sharing
  // --------------------------------------------------------------------------

  addPresentationToken(
    input: AddPresentationTokenInput,
  ): Promise<AddPresentationTokenOutput> {
    return this.post<AddPresentationTokenOutput>("/addPresentationToken", input);
  }

  setTokenVersionMode(
    input: SetTokenVersionModeInput,
  ): Promise<SetTokenVersionModeOutput> {
    return this.post<SetTokenVersionModeOutput>("/setTokenVersionMode", input);
  }

  unsharePresentation(
    input: UnsharePresentationInput,
  ): Promise<UnsharePresentationOutput> {
    return this.post<UnsharePresentationOutput>("/unsharePresentation", input);
  }

  sharePresentationViaEmail(
    input: SharePresentationViaEmailInput,
  ): Promise<SharePresentationViaEmailOutput> {
    return this.post<SharePresentationViaEmailOutput>(
      "/sharePresentationViaEmail",
      input,
    );
  }

  // --------------------------------------------------------------------------
  // Collaborators
  // --------------------------------------------------------------------------

  inviteCollaborator(
    input: InviteCollaboratorInput,
  ): Promise<InviteCollaboratorOutput> {
    return this.post<InviteCollaboratorOutput>("/inviteCollaborator", input);
  }

  uninviteCollaborator(
    input: UninviteCollaboratorInput,
  ): Promise<UninviteCollaboratorOutput> {
    return this.post<UninviteCollaboratorOutput>("/uninviteCollaborator", input);
  }

  listCollaborators(presentationId: string): Promise<ListCollaboratorsOutput> {
    const url = `/listCollaborators?presentationId=${encodeURIComponent(presentationId)}`;
    return this.get<ListCollaboratorsOutput>(url);
  }

  // --------------------------------------------------------------------------
  // Internal — request plumbing
  // --------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: this.authHeader },
    });
    return this.unwrap<T>(res);
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return this.unwrap<T>(res);
  }

  private async unwrap<T>(res: Response): Promise<T> {
    let parsed: ApiResponse<T> | undefined;
    try {
      parsed = (await res.json()) as ApiResponse<T>;
    } catch {
      // Body wasn't JSON — fall through to the raw error path below.
    }

    if (parsed && "success" in parsed) {
      if (parsed.success) return parsed.data;
      throw new SlidelessApiError(res.status, parsed.error);
    }

    throw new SlidelessApiError(res.status, {
      code: res.ok ? "invalid-response" : `http-${res.status}`,
      message: res.ok
        ? "Slideless returned a non-envelope response."
        : `Slideless returned HTTP ${res.status}.`,
    });
  }
}
