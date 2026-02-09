// Atomic file edit operations
// Provides safe read/modify/write helpers

import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { REPO_ROOT } from "../../../utils/paths";
import { resolveTargetFile } from "./resolveTargetFile";

/**
 * Result of a file edit operation.
 */
export interface FileEditOperationResult {
  success: boolean;
  message: string;
  linesChanged?: number;
  error?: string;
}

/**
 * Replaces text in a file atomically.
 * Resolves logical paths (relative to tests/) before file operations.
 */
export async function replaceTextInFile(
  filePath: string,
  search: string,
  replace: string,
  occurrence: "first" | "all" = "first"
): Promise<FileEditOperationResult> {
  // Resolve file path: try as-provided, then tests/<filePath>
  const resolveResult = resolveTargetFile(filePath);
  
  if (!resolveResult.success) {
    // Build error message with both attempted paths
    const fullPath1 = path.join(REPO_ROOT, filePath);
    const fullPath2 = path.join(REPO_ROOT, "tests", filePath);
    return {
      success: false,
      message: `File not found: "${filePath}" (attempted: "${fullPath1}", "${fullPath2}")`,
      error: resolveResult.error || "File does not exist",
    };
  }

  // Use resolved path
  const resolvedPath = resolveResult.resolvedPath;
  const fullPath = path.join(REPO_ROOT, resolvedPath);
  
  if (!existsSync(fullPath)) {
    // Should not happen after resolution, but defensive check
    return {
      success: false,
      message: `File not found after resolution: ${resolvedPath}`,
      error: "File does not exist after resolution",
    };
  }

  try {
    const content = await fs.readFile(fullPath, "utf-8");
    
    // Count occurrences
    const regex = new RegExp(escapeRegex(search), "g");
    const matches = content.match(regex);
    const count = matches ? matches.length : 0;
    
    if (count === 0) {
      return {
        success: false,
        message: `Search string not found in ${resolvedPath}`,
        error: "Search string not found",
      };
    }

    // Perform replacement
    let newContent: string;
    if (occurrence === "all") {
      newContent = content.replace(regex, replace);
    } else {
      newContent = content.replace(search, replace);
    }

    // Only write if content changed
    if (newContent === content) {
      return {
        success: false,
        message: `No changes made to ${resolvedPath}`,
        error: "Content unchanged",
      };
    }

    // Atomic write: write to temp file then rename
    const tempPath = `${fullPath}.tmp`;
    await fs.writeFile(tempPath, newContent, "utf-8");
    await fs.rename(tempPath, fullPath);

    const linesChanged = (newContent.match(/\n/g) || []).length - (content.match(/\n/g) || []).length;

    return {
      success: true,
      message: `Replaced ${occurrence === "all" ? count : 1} occurrence(s) in ${resolvedPath}`,
      linesChanged: Math.abs(linesChanged),
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to edit ${resolvedPath}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Inserts text after an anchor string in a file atomically.
 * Resolves logical paths (relative to tests/) before file operations.
 */
export async function insertAfterInFile(
  filePath: string,
  anchor: string,
  insert: string
): Promise<FileEditOperationResult> {
  // Resolve file path: try as-provided, then tests/<filePath>
  const resolveResult = resolveTargetFile(filePath);
  
  if (!resolveResult.success) {
    // Build error message with both attempted paths
    const fullPath1 = path.join(REPO_ROOT, filePath);
    const fullPath2 = path.join(REPO_ROOT, "tests", filePath);
    return {
      success: false,
      message: `File not found: "${filePath}" (attempted: "${fullPath1}", "${fullPath2}")`,
      error: resolveResult.error || "File does not exist",
    };
  }

  // Use resolved path
  const resolvedPath = resolveResult.resolvedPath;
  const fullPath = path.join(REPO_ROOT, resolvedPath);
  
  if (!existsSync(fullPath)) {
    // Should not happen after resolution, but defensive check
    return {
      success: false,
      message: `File not found after resolution: ${resolvedPath}`,
      error: "File does not exist after resolution",
    };
  }

  try {
    const content = await fs.readFile(fullPath, "utf-8");
    
    // Check anchor exists exactly once
    const occurrences = (content.match(new RegExp(escapeRegex(anchor), "g")) || []).length;
    
    if (occurrences === 0) {
      return {
        success: false,
        message: `Anchor string not found in ${resolvedPath}`,
        error: "Anchor not found",
      };
    }
    
    if (occurrences > 1) {
      return {
        success: false,
        message: `Anchor string found ${occurrences} times in ${resolvedPath} (must be unique)`,
        error: "Anchor not unique",
      };
    }

    // Find anchor position and insert after it
    const anchorIndex = content.indexOf(anchor);
    if (anchorIndex === -1) {
      return {
        success: false,
        message: `Anchor string not found in ${resolvedPath}`,
        error: "Anchor not found",
      };
    }

    // Insert after anchor (including newline handling)
    const afterAnchor = anchorIndex + anchor.length;
    const beforeInsert = content.substring(0, afterAnchor);
    const afterInsert = content.substring(afterAnchor);
    
    // Ensure proper newline handling
    const needsNewline = !beforeInsert.endsWith("\n") && !insert.startsWith("\n");
    const newContent = beforeInsert + (needsNewline ? "\n" : "") + insert + afterInsert;

    // Atomic write
    const tempPath = `${fullPath}.tmp`;
    await fs.writeFile(tempPath, newContent, "utf-8");
    await fs.rename(tempPath, fullPath);

    const linesAdded = (insert.match(/\n/g) || []).length + (needsNewline ? 1 : 0);

    return {
      success: true,
      message: `Inserted text after anchor in ${resolvedPath}`,
      linesChanged: linesAdded,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to edit ${resolvedPath}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Escapes special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
