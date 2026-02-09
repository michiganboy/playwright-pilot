// Artifact resolution types for MCP Slice 2
// Defines structures for indexing Playwright test artifacts

/**
 * Artifact attachment kind.
 */
export type AttachmentKind = "screenshot" | "video" | "log" | "other";

/**
 * File metadata for an artifact.
 */
export interface ArtifactFile {
  path: string;
  sizeBytes: number;
  mtime: Date;
  sha256?: string; // Optional hash for integrity
}

/**
 * Attachment artifact (screenshot, video, log, etc.).
 */
export interface AttachmentArtifact {
  kind: AttachmentKind;
  path: string;
  sizeBytes: number;
  mtime: Date;
  label?: string;
}

/**
 * Artifact index containing all discovered artifacts for a test failure.
 */
export interface ArtifactIndex {
  /** Trace ZIP file metadata */
  traceZip?: ArtifactFile;

  /** Extracted trace directory (if extraction was performed) */
  extractedDir?: string;

  /** Discovered attachments */
  attachments: AttachmentArtifact[];

  /** Notes about missing or unknown items */
  notes: string[];

  /** Source paths that were searched */
  sourcePaths: string[];
}

/**
 * Collection metadata for evidence.
 */
export interface CollectionMetadata {
  collectedAt: string;
  sourcePaths: string[];
  indexingNotes: string[];
  traceExtracted: boolean;
  extractedTraceDir?: string; // Path to extracted trace directory
  attachmentCounts: {
    screenshots: number;
    videos: number;
    logs: number;
    other: number;
  };
}
