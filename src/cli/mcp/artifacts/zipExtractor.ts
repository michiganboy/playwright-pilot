// ZIP extraction for trace.zip files
// Extracts trace.zip contents for DOM inspection

import path from "path";
import { existsSync } from "fs";
import { promises as fs } from "fs";
import AdmZip from "adm-zip";
import { REPO_ROOT } from "../../utils/paths";

/**
 * Extracts trace.zip to a destination directory.
 * Prevents zip-slip attacks and ensures safe extraction.
 * 
 * @param traceZipPath - Path to the trace.zip file
 * @param extractDir - Destination directory for extraction
 * @returns Result with success status and extracted file paths
 */
export async function extractTraceZip(
  traceZipPath: string,
  extractDir: string
): Promise<{
  success: boolean;
  extractedFiles: string[];
  error?: string;
}> {
  if (!existsSync(traceZipPath)) {
    return {
      success: false,
      extractedFiles: [],
      error: `Trace ZIP not found: ${traceZipPath}`,
    };
  }

  try {
    // Resolve absolute paths for safety
    const absoluteZipPath = path.isAbsolute(traceZipPath)
      ? traceZipPath
      : path.join(REPO_ROOT, traceZipPath);
    const absoluteExtractDir = path.isAbsolute(extractDir)
      ? extractDir
      : path.join(REPO_ROOT, extractDir);

    // Ensure destination directory exists
    await fs.mkdir(absoluteExtractDir, { recursive: true });

    // Clean destination directory (remove existing contents)
    try {
      const existingFiles = await fs.readdir(absoluteExtractDir);
      for (const file of existingFiles) {
        const filePath = path.join(absoluteExtractDir, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          await fs.rmdir(filePath, { recursive: true });
        } else {
          await fs.unlink(filePath);
        }
      }
    } catch {
      // Ignore errors during cleanup
    }

    // Extract ZIP
    const zip = new AdmZip(absoluteZipPath);
    const zipEntries = zip.getEntries();
    const extractedFiles: string[] = [];

    for (const entry of zipEntries) {
      // Prevent zip-slip: ensure entry path is within extract directory
      const entryPath = entry.entryName;
      const fullPath = path.join(absoluteExtractDir, entryPath);
      const normalizedPath = path.normalize(fullPath);

      // Check that normalized path is within extract directory
      if (!normalizedPath.startsWith(absoluteExtractDir + path.sep) && normalizedPath !== absoluteExtractDir) {
        // Skip this entry - potential zip-slip attack
        continue;
      }

      // Extract entry
      if (entry.isDirectory) {
        // Create directory
        await fs.mkdir(normalizedPath, { recursive: true });
      } else {
        // Extract file
        const entryDir = path.dirname(normalizedPath);
        await fs.mkdir(entryDir, { recursive: true });
        
        const content = entry.getData();
        await fs.writeFile(normalizedPath, content);
        extractedFiles.push(entryPath);
      }
    }

    return {
      success: true,
      extractedFiles,
    };
  } catch (error) {
    return {
      success: false,
      extractedFiles: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Gets the extraction directory path for a proposal.
 */
export function getExtractionDir(evidenceDir: string): string {
  return path.join(evidenceDir, "trace-extracted");
}
