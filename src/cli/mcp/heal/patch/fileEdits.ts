// Atomic file edit operations
// Accepts already-resolved repo-relative paths (caller must resolve via validatePatchPlan / resolveTargetFile).

import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { REPO_ROOT } from "../../../utils/paths";

/**
 * Result of a file edit operation.
 */
export interface FileEditOperationResult {
  success: boolean;
  message: string;
  occurrencesReplaced?: number;
  linesAdded?: number;
  bytesChanged?: number;
  error?: string;
}

/**
 * Replaces text in a file atomically.
 * @param resolvedRepoRelativePath - Already-resolved repo-relative path (do not pass logical path; caller resolves).
 */
export async function replaceTextInFile(
  resolvedRepoRelativePath: string,
  search: string,
  replace: string,
  occurrence: "first" | "all" = "first"
): Promise<FileEditOperationResult> {
  const fullPath = path.join(REPO_ROOT, resolvedRepoRelativePath);

  if (!existsSync(fullPath)) {
    return {
      success: false,
      message: `File not found: ${resolvedRepoRelativePath}`,
      error: "File does not exist",
    };
  }

  try {
    const content = await fs.readFile(fullPath, "utf-8");

    const regex = new RegExp(escapeRegex(search), "g");
    const matches = content.match(regex);
    const count = matches ? matches.length : 0;

    if (count === 0) {
      return {
        success: false,
        message: `Search string not found in ${resolvedRepoRelativePath}`,
        error: "Search string not found",
      };
    }

    let newContent: string;
    if (occurrence === "all") {
      newContent = content.replace(regex, replace);
    } else {
      newContent = content.replace(search, replace);
    }

    if (newContent === content) {
      return {
        success: false,
        message: `No changes made to ${resolvedRepoRelativePath}`,
        error: "Content unchanged",
      };
    }

    const tempPath = `${fullPath}.tmp`;
    await fs.writeFile(tempPath, newContent, "utf-8");
    await fs.rename(tempPath, fullPath);

    const occurrencesReplaced = occurrence === "all" ? count : 1;
    const bytesChanged = newContent.length - content.length;

    return {
      success: true,
      message: `Replaced ${occurrencesReplaced} occurrence(s) in ${resolvedRepoRelativePath}`,
      occurrencesReplaced,
      bytesChanged,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to edit ${resolvedRepoRelativePath}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Inserts text after an anchor string in a file atomically.
 * @param resolvedRepoRelativePath - Already-resolved repo-relative path (caller resolves).
 */
export async function insertAfterInFile(
  resolvedRepoRelativePath: string,
  anchor: string,
  insert: string
): Promise<FileEditOperationResult> {
  const fullPath = path.join(REPO_ROOT, resolvedRepoRelativePath);

  if (!existsSync(fullPath)) {
    return {
      success: false,
      message: `File not found: ${resolvedRepoRelativePath}`,
      error: "File does not exist",
    };
  }

  try {
    const content = await fs.readFile(fullPath, "utf-8");

    const occurrences = (content.match(new RegExp(escapeRegex(anchor), "g")) || []).length;

    if (occurrences === 0) {
      return {
        success: false,
        message: `Anchor string not found in ${resolvedRepoRelativePath}`,
        error: "Anchor not found",
      };
    }

    if (occurrences > 1) {
      return {
        success: false,
        message: `Anchor string found ${occurrences} times in ${resolvedRepoRelativePath} (must be unique)`,
        error: "Anchor not unique",
      };
    }

    const anchorIndex = content.indexOf(anchor);
    if (anchorIndex === -1) {
      return {
        success: false,
        message: `Anchor string not found in ${resolvedRepoRelativePath}`,
        error: "Anchor not found",
      };
    }

    const afterAnchor = anchorIndex + anchor.length;
    const beforeInsert = content.substring(0, afterAnchor);
    const afterInsert = content.substring(afterAnchor);
    const needsNewline = !beforeInsert.endsWith("\n") && !insert.startsWith("\n");
    const newContent = beforeInsert + (needsNewline ? "\n" : "") + insert + afterInsert;

    const tempPath = `${fullPath}.tmp`;
    await fs.writeFile(tempPath, newContent, "utf-8");
    await fs.rename(tempPath, fullPath);

    const linesAdded = (insert.match(/\n/g) || []).length + (needsNewline ? 1 : 0);
    const bytesChanged = newContent.length - content.length;

    return {
      success: true,
      message: `Inserted text after anchor in ${resolvedRepoRelativePath}`,
      linesAdded,
      bytesChanged,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to edit ${resolvedRepoRelativePath}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
