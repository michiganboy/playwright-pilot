// Resolves failure artifacts from trace path or test-results directory
// Handles both trace.zip files and test-results directory structures

import path from "path";
import { existsSync, statSync } from "fs";
import { promises as fs } from "fs";
import { glob } from "fast-glob";
import type { ArtifactIndex } from "./types";

/**
 * Resolves artifacts from a trace.zip file path.
 */
export async function resolveFromTraceZip(traceZipPath: string): Promise<ArtifactIndex> {
  const index: ArtifactIndex = {
    attachments: [],
    notes: [],
    sourcePaths: [traceZipPath],
  };

  if (!existsSync(traceZipPath)) {
    index.notes.push(`Trace ZIP not found: ${traceZipPath}`);
    return index;
  }

  // Get trace ZIP metadata
  const stats = statSync(traceZipPath);
  index.traceZip = {
    path: path.resolve(traceZipPath),
    sizeBytes: stats.size,
    mtime: stats.mtime,
  };

  // Look for attachments in the same directory
  const traceDir = path.dirname(traceZipPath);
  await findAttachmentsInDirectory(traceDir, index);

  return index;
}

/**
 * Resolves artifacts from a test-results directory path.
 */
export async function resolveFromTestResultsDir(testResultsDir: string): Promise<ArtifactIndex> {
  const index: ArtifactIndex = {
    attachments: [],
    notes: [],
    sourcePaths: [testResultsDir],
  };

  if (!existsSync(testResultsDir)) {
    index.notes.push(`Test results directory not found: ${testResultsDir}`);
    return index;
  }

  // Find trace.zip in the directory
  const tracePattern = path.join(testResultsDir, "**", "trace.zip").replace(/\\/g, "/");
  const traceFiles = await glob(tracePattern);

  if (traceFiles.length > 0) {
    // Use the first trace found (most recent if sorted)
    const tracePath = traceFiles[0];
    const stats = statSync(tracePath);
    index.traceZip = {
      path: path.resolve(tracePath),
      sizeBytes: stats.size,
      mtime: stats.mtime,
    };
  } else {
    index.notes.push(`No trace.zip found in: ${testResultsDir}`);
  }

  // Find attachments in the directory
  await findAttachmentsInDirectory(testResultsDir, index);

  return index;
}

/**
 * Finds attachment files in a directory and adds them to the index.
 */
async function findAttachmentsInDirectory(
  dir: string,
  index: ArtifactIndex
): Promise<void> {
  if (!existsSync(dir)) {
    return;
  }

  // Find screenshots (png, jpg, jpeg, webp)
  const screenshotPatterns = [
    path.join(dir, "**", "*.png").replace(/\\/g, "/"),
    path.join(dir, "**", "*.jpg").replace(/\\/g, "/"),
    path.join(dir, "**", "*.jpeg").replace(/\\/g, "/"),
    path.join(dir, "**", "*.webp").replace(/\\/g, "/"),
  ];

  for (const pattern of screenshotPatterns) {
    const files = await glob(pattern);
    for (const file of files) {
      // Skip trace.zip itself
      if (file.endsWith("trace.zip")) {
        continue;
      }
      const stats = statSync(file);
      index.attachments.push({
        kind: "screenshot",
        path: path.resolve(file),
        sizeBytes: stats.size,
        mtime: stats.mtime,
        label: path.basename(file),
      });
    }
  }

  // Find videos (webm, mp4)
  const videoPatterns = [
    path.join(dir, "**", "*.webm").replace(/\\/g, "/"),
    path.join(dir, "**", "*.mp4").replace(/\\/g, "/"),
  ];

  for (const pattern of videoPatterns) {
    const files = await glob(pattern);
    for (const file of files) {
      const stats = statSync(file);
      index.attachments.push({
        kind: "video",
        path: path.resolve(file),
        sizeBytes: stats.size,
        mtime: stats.mtime,
        label: path.basename(file),
      });
    }
  }

  // Find log files (.log, .txt, error-context.md)
  const logPatterns = [
    path.join(dir, "**", "*.log").replace(/\\/g, "/"),
    path.join(dir, "**", "*.txt").replace(/\\/g, "/"),
    path.join(dir, "**", "error-context.md").replace(/\\/g, "/"),
  ];

  for (const pattern of logPatterns) {
    const files = await glob(pattern);
    for (const file of files) {
      // Skip trace.zip
      if (file.endsWith("trace.zip")) {
        continue;
      }
      const stats = statSync(file);
      index.attachments.push({
        kind: "log",
        path: path.resolve(file),
        sizeBytes: stats.size,
        mtime: stats.mtime,
        label: path.basename(file),
      });
    }
  }
}

/**
 * Determines if a path is a trace.zip file or a directory.
 */
export function isTraceZip(path: string): boolean {
  return existsSync(path) && path.toLowerCase().endsWith(".zip") && path.toLowerCase().includes("trace");
}

/**
 * Determines if a path is a test-results directory.
 */
export function isTestResultsDir(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const stats = statSync(path);
  return stats.isDirectory();
}

/**
 * Resolves artifacts from either a trace.zip path or test-results directory.
 */
export async function resolveFailureArtifacts(sourcePath: string): Promise<ArtifactIndex> {
  if (isTraceZip(sourcePath)) {
    return resolveFromTraceZip(sourcePath);
  } else if (isTestResultsDir(sourcePath)) {
    return resolveFromTestResultsDir(sourcePath);
  } else {
    // Try to resolve as trace.zip first, then as directory
    if (sourcePath.toLowerCase().endsWith(".zip")) {
      return resolveFromTraceZip(sourcePath);
    } else {
      return resolveFromTestResultsDir(sourcePath);
    }
  }
}
