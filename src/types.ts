/**
 * Wire shapes for the Slideless HTTP API.
 *
 * Mirrors slideless-app's `functions/src/features/shared-presentations/types/sharedPresentationTypes.ts`
 * and `functions/src/features/presentation-collaborators/types/collaboratorTypes.ts`, with the
 * Firestore-specific types stripped (FieldValue / Timestamp). Only the wire-format types are kept —
 * dates are ISO strings, references are plain strings.
 */

// ============================================================================
// API envelope
// ============================================================================

export interface ApiErrorBody {
  code: string;
  message: string;
  nextAction?: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiErrorBody };

// ============================================================================
// Identity (verifyApiKey)
// ============================================================================

export type ApiKeyType = "org-api-key" | "admin-api-key";

export interface VerifyApiKeyOutput {
  type: ApiKeyType;
  keyName: string | null;
  keyPrefix: string | null;
  scopes: string[];
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestId: string;
}

// ============================================================================
// Token / version mode
// ============================================================================

export type TokenVersionMode =
  | { type: "latest" }
  | { type: "pinned"; version: number };

// ============================================================================
// Presentations — list
// ============================================================================

export interface ListMyPresentationsItem {
  id: string;
  title: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  totalViews: number;
  lastViewedAt: string | null;
  shareUrl: string | null;
  role: "owner" | "dev";
  hasActiveCollaborators: boolean;
  ownerDisplayName: string | null;
}

export interface ListMyPresentationsOutput {
  presentations: ListMyPresentationsItem[];
}

// ============================================================================
// Presentations — get info
// ============================================================================

export interface PresentationTokenInfo {
  tokenId: string;
  name: string;
  createdAt: string;
  revoked: boolean;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  shareUrl: string;
  versionMode: TokenVersionMode;
}

export interface CollaboratorInfo {
  collaboratorId: string;
  email: string;
  userId: string | null;
  role: "dev";
  status: "pending" | "active" | "revoked";
  invitedAt: string;
  invitedBy: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface PresentationInfo {
  id: string;
  ownerId: string;
  organizationId: string;
  title: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  totalViews: number;
  lastViewedAt: string | null;
  primaryShareUrl: string | null;
  role: "owner" | "dev";
  tokens: PresentationTokenInfo[];
  collaborators: CollaboratorInfo[];
}

// ============================================================================
// Versions
// ============================================================================

export interface VersionSummary {
  version: number;
  title: string;
  createdAt: string;
  createdBy: string;
  createdByRole: "owner" | "dev";
  fileCount: number;
  totalBytes: number;
}

export interface ListPresentationVersionsOutput {
  presentationId: string;
  currentVersion: number;
  versions: VersionSummary[];
}

export interface VersionFile {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
}

export interface GetPresentationVersionOutput {
  version: number;
  title: string;
  entryPath: string;
  files: VersionFile[];
  createdAt: string;
  createdBy: string;
  createdByRole: "owner" | "dev";
}

// ============================================================================
// Upload (3-step content-addressed flow)
// ============================================================================

export interface PrecheckAssetsInput {
  presentationId?: string;
  sessionId?: string;
  hashes: string[];
}

export interface PrecheckAssetsOutput {
  missing: string[];
  sessionId?: string;
  presentationId?: string;
}

export interface UploadPresentationAssetOutput {
  sha256: string;
  size: number;
}

export interface CommitPresentationVersionInput {
  presentationId?: string;
  sessionId?: string;
  title: string;
  entryPath: string;
  files: VersionFile[];
  expectedBaseVersion?: number;
}

export interface CommitPresentationVersionOutput {
  presentationId: string;
  version: number;
  role: "owner" | "dev";
}

// ============================================================================
// Sharing
// ============================================================================

export interface AddPresentationTokenInput {
  presentationId: string;
  tokenName: string;
  versionMode?: TokenVersionMode;
}

export interface AddPresentationTokenOutput {
  tokenId: string;
  token: string;
  shareUrl: string;
}

export interface SetTokenVersionModeInput {
  presentationId: string;
  tokenId: string;
  versionMode: TokenVersionMode;
}

export interface SetTokenVersionModeOutput {
  success: boolean;
  versionMode: TokenVersionMode;
}

export interface UnsharePresentationInput {
  presentationId: string;
  tokenId?: string;
}

export interface UnsharePresentationOutput {
  presentationId: string;
  tokensRevoked: number;
}

export interface SharePresentationViaEmailInput {
  presentationId: string;
  emails: string[];
  message?: string;
  subject?: string;
  tokenId?: string;
}

export interface SharePresentationViaEmailSent {
  email: string;
  tokenId: string;
  resendMessageId: string | null;
  shareUrl: string;
}

export interface SharePresentationViaEmailFailed {
  email: string;
  code: string;
  message: string;
}

export interface SharePresentationViaEmailOutput {
  presentationId: string;
  sent: SharePresentationViaEmailSent[];
  failed: SharePresentationViaEmailFailed[];
  summary: { total: number; sent: number; failed: number };
}

// ============================================================================
// Lifecycle
// ============================================================================

export interface DeletePresentationOutput {
  presentationId: string;
  blobsDeleted: number;
}

// ============================================================================
// Marketplace
// ============================================================================

export type MarketplaceKind = "presentation" | "app" | "plan";
export type MarketplaceStatus = "public" | "unlisted";

export interface MarketplacePublicListing {
  slug: string;
  kind: MarketplaceKind;
  interactive: boolean;
  status: MarketplaceStatus;
  title: string;
  description: string;
  tags: string[];
  techStack: string[];
  category: string | null;
  authorDisplayName: string;
  authorHandle: string;
  thumbnailUrl: string | null;
  previewUrl: string;
  publishedVersion: number;
  remixCount: number;
  starCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListMarketplaceListingsInput {
  kind?: MarketplaceKind;
  tag?: string;
  stack?: string;
  category?: string;
  sort?: "recent" | "popular" | "stars";
  limit?: number;
}

export interface ListMarketplaceListingsOutput {
  listings: MarketplacePublicListing[];
  nextCursor: string | null;
}

export interface GetListingOutput extends MarketplacePublicListing {
  readme: string | null;
  entryPath: string;
  fileCount: number;
  totalBytes: number;
}

export interface MarketplaceListingFile {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
}

export interface GetMarketplaceListingFilesOutput {
  slug: string;
  entryPath: string;
  files: MarketplaceListingFile[];
}

export interface PublishMarketplaceListingInput {
  presentationId: string;
  kind: MarketplaceKind;
  interactive?: boolean;
  description: string;
  slug?: string;
  title?: string;
  tags?: string[];
  techStack?: string[];
  category?: string;
  version?: number;
}

export interface PublishMarketplaceListingOutput {
  slug: string;
  kind: MarketplaceKind;
  interactive: boolean;
  status: MarketplaceStatus;
  title: string;
  publishedVersion: number;
  marketplaceUrl: string;
}

export interface RecordMarketplaceRemixOutput {
  slug: string;
  remixCount: number;
}

export interface StarMarketplaceListingOutput {
  slug: string;
  starred: boolean;
  starCount: number;
}

// ============================================================================
// Collaborators
// ============================================================================

export interface InviteCollaboratorInput {
  presentationId: string;
  email: string;
  message?: string;
}

export interface InviteCollaboratorOutput {
  collaboratorId: string;
  email: string;
  status: "pending" | "active" | "revoked";
  userId: string | null;
  inviteAlreadyExisted: boolean;
}

export interface UninviteCollaboratorInput {
  presentationId: string;
  collaboratorId: string;
}

export interface UninviteCollaboratorOutput {
  collaboratorId: string;
}

export interface ListCollaboratorsOutput {
  presentationId: string;
  collaborators: CollaboratorInfo[];
}
