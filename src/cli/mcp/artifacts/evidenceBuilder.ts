// Builds enriched EvidencePacket from ArtifactIndex
// Extends EvidencePacket with real artifact references

import path from "path";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import type { ArtifactIndex, CollectionMetadata } from "./types";
import type {
  EvidencePacket,
  TraceRef,
  ScreenshotRef,
} from "../types";
import type { AdoContext } from "../ado/types";

/**
 * Builds an enriched EvidencePacket from an ArtifactIndex.
 */
export function buildEvidencePacketFromIndex(
  index: ArtifactIndex,
  evidenceDir: string,
  errorMessage?: string,
  stackTrace?: string,
  testMetadata?: EvidencePacket["testMetadata"],
  adoContext?: AdoContext | null
): EvidencePacket {
  // Normalize ADO context to EvidencePacket format if present
  const normalizedAdoContext = adoContext ? {
    testId: adoContext.testId,
    testCase: {
      id: adoContext.testCase.id,
      url: adoContext.testCase.url,
      title: adoContext.testCase.fields["System.Title"] || "",
      type: adoContext.testCase.fields["System.WorkItemType"] || "",
    },
    parent: adoContext.parent ? {
      id: adoContext.parent.id,
      type: adoContext.parent.type,
      title: adoContext.parent.title,
      url: adoContext.parent.url,
      acceptanceCriteria: adoContext.parent.acceptanceCriteria,
      description: adoContext.parent.description,
    } : null,
  } : undefined;
  // Build trace references
  const traces: TraceRef[] = [];
  if (index.traceZip) {
    traces.push({
      path: index.traceZip.path,
      // testId and runId would come from test metadata if available
    });
  }

  // Build screenshot references
  const screenshots: ScreenshotRef[] = index.attachments
    .filter((a) => a.kind === "screenshot")
    .map((a) => ({
      path: a.path,
      timestamp: a.mtime.getTime(),
      label: a.label,
    }));

  // Build video references (new field)
  const videos: ScreenshotRef[] = index.attachments
    .filter((a) => a.kind === "video")
    .map((a) => ({
      path: a.path,
      timestamp: a.mtime.getTime(),
      label: a.label,
    }));

  // Build other attachment references (new field)
  const otherAttachments: ScreenshotRef[] = index.attachments
    .filter((a) => a.kind === "log" || a.kind === "other")
    .map((a) => ({
      path: a.path,
      timestamp: a.mtime.getTime(),
      label: a.label,
    }));

  // Build collection metadata (new field)
  // If extraction directory is set, construct full path relative to evidence dir
  let extractedTraceDir: string | undefined;
  if (index.extractedDir) {
    // If it's already an absolute path, use it; otherwise join with evidence dir
    extractedTraceDir = path.isAbsolute(index.extractedDir)
      ? index.extractedDir
      : path.join(evidenceDir, index.extractedDir);
  } else {
    // Check if trace-extracted directory exists in evidence dir
    const potentialExtractDir = path.join(evidenceDir, "trace-extracted");
    if (existsSync(potentialExtractDir)) {
      extractedTraceDir = potentialExtractDir;
    }
  }

  const collectionMetadata: CollectionMetadata = {
    collectedAt: new Date().toISOString(),
    sourcePaths: [...index.sourcePaths, evidenceDir], // Include evidence dir for trace extraction lookup
    indexingNotes: index.notes,
    traceExtracted: !!extractedTraceDir,
    extractedTraceDir, // Pass extracted directory path
    attachmentCounts: {
      screenshots: screenshots.length,
      videos: videos.length,
      logs: index.attachments.filter((a) => a.kind === "log").length,
      other: index.attachments.filter((a) => a.kind === "other").length,
    },
  };

  // Build base EvidencePacket
  const packet: EvidencePacket = {
    traces,
    screenshots,
    reproSteps: [], // Will be populated by adapter if needed
    expected: "Test execution completes successfully",
    actual: errorMessage || "Test failed with error",
    errorMessage,
    stackTrace,
    testMetadata,
    // New optional fields
    videoReferences: videos.length > 0 ? videos : undefined,
    attachmentReferences: otherAttachments.length > 0 ? otherAttachments : undefined,
    collectionMetadata,
    // ADO context (Slice 5) - normalized from AdoContext to EvidencePacket format
    adoContext: adoContext ? {
      testId: adoContext.testId,
      testCase: {
        id: adoContext.testCase.id,
        url: adoContext.testCase.url,
        title: adoContext.testCase.fields["System.Title"] || "",
        type: adoContext.testCase.fields["System.WorkItemType"] || "",
      },
      parent: adoContext.parent ? {
        id: adoContext.parent.id,
        type: adoContext.parent.type,
        title: adoContext.parent.title,
        url: adoContext.parent.url,
        acceptanceCriteria: adoContext.parent.acceptanceCriteria,
        description: adoContext.parent.description,
      } : null,
    } : undefined,
  };

  return packet;
}

/**
 * Copies artifacts to evidence directory and updates paths in EvidencePacket.
 */
export async function copyArtifactsToEvidence(
  index: ArtifactIndex,
  evidenceDir: string
): Promise<{
  copiedFiles: string[];
  errors: string[];
}> {
  const copiedFiles: string[] = [];
  const errors: string[] = [];

  // Ensure evidence directory exists
  await fs.mkdir(evidenceDir, { recursive: true });

  // Copy trace.zip if present
  if (index.traceZip && existsSync(index.traceZip.path)) {
    try {
      const destPath = path.join(evidenceDir, "trace.zip");
      await fs.copyFile(index.traceZip.path, destPath);
      copiedFiles.push(destPath);
    } catch (error) {
      errors.push(`Failed to copy trace.zip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Copy attachments
  for (const attachment of index.attachments) {
    if (existsSync(attachment.path)) {
      try {
        const fileName = path.basename(attachment.path);
        const destPath = path.join(evidenceDir, fileName);
        await fs.copyFile(attachment.path, destPath);
        copiedFiles.push(destPath);
      } catch (error) {
        errors.push(`Failed to copy ${attachment.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { copiedFiles, errors };
}
