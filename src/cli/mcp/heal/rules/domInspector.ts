// DOM inspection utilities for locator validation
// Checks if selectors exist in DOM snapshots from extracted traces
// STRICT: If trace is extracted, DOM inspection MUST succeed or throw

import { existsSync } from "fs";
import { promises as fs } from "fs";
import { glob } from "fast-glob";
import path from "path";
import type { EvidencePacket } from "../../types";

/**
 * Result of DOM selector check.
 */
export interface DOMCheckResult {
  status: "exists" | "not-exists";
  snapshotsRead: number;
  snapshotsScanned: number;
}

/**
 * Checks if a selector exists in the DOM by inspecting extracted trace snapshots.
 * STRICT: If trace is extracted, must read snapshots or throw error.
 * 
 * @param selector - The CSS selector or data-testid to check
 * @param evidence - Evidence packet containing trace/snapshot references
 * @returns DOMCheckResult indicating if selector exists or doesn't exist
 * @throws Error if trace is extracted but no snapshots can be read
 */
export async function checkSelectorInDOM(
  selector: string,
  evidence: EvidencePacket
): Promise<DOMCheckResult> {
  // Check extracted trace directory
  const extractedDir = evidence.collectionMetadata?.traceExtracted
    ? getExtractedTraceDir(evidence)
    : null;

  if (!extractedDir || !existsSync(extractedDir)) {
    // No extracted trace - this is acceptable, return not-exists conservatively
    // (This case should not happen if extraction succeeded, but handle gracefully)
    return {
      status: "not-exists",
      snapshotsRead: 0,
      snapshotsScanned: 0,
    };
  }

  // STRICT: Trace is extracted, we MUST read snapshots
  const result = await checkSelectorInExtractedTrace(extractedDir, selector);
  
  if (result.snapshotsRead === 0) {
    // Framework error: trace extracted but no snapshots readable
    const searchedPaths = [
      path.join(extractedDir, "resources", "**/*.html"),
      path.join(extractedDir, "**/page@*.html"),
      path.join(extractedDir, "**/src@*.html"),
      path.join(extractedDir, "**/*.html"),
    ];
    
    throw new Error(
      `DOM inspection failed: 0 DOM snapshots read from extracted trace\n` +
      `  Extracted trace directory: ${extractedDir}\n` +
      `  Paths searched: ${searchedPaths.join(", ")}\n` +
      `  Snapshots scanned: ${result.snapshotsScanned}`
    );
  }

  return result;
}

/**
 * Gets the extracted trace directory path from evidence.
 */
function getExtractedTraceDir(evidence: EvidencePacket): string | null {
  // First check if extracted directory is directly provided in metadata
  if (evidence.collectionMetadata?.extractedTraceDir) {
    const extractedDir = evidence.collectionMetadata.extractedTraceDir;
    if (existsSync(extractedDir)) {
      return extractedDir;
    }
  }

  // Look for trace-extracted directory in evidence paths
  if (evidence.collectionMetadata?.sourcePaths) {
    for (const sourcePath of evidence.collectionMetadata.sourcePaths) {
      // Check if this is an evidence directory
      if (sourcePath.includes(".pilot/proposals/evidence") || sourcePath.includes("evidence")) {
        const extractedDir = path.join(sourcePath, "trace-extracted");
        if (existsSync(extractedDir)) {
          return extractedDir;
        }
      }
    }
  }

  // Try to infer from trace path
  if (evidence.traces && evidence.traces.length > 0) {
    const tracePath = evidence.traces[0].path;
    if (tracePath) {
      // If trace is in evidence directory, extracted dir should be nearby
      const traceDir = path.dirname(tracePath);
      if (traceDir.includes(".pilot/proposals/evidence") || traceDir.includes("evidence")) {
        const extractedDir = path.join(traceDir, "trace-extracted");
        if (existsSync(extractedDir)) {
          return extractedDir;
        }
      }
    }
  }

  return null;
}

/**
 * Checks if selector exists in extracted trace directory.
 * Returns result with snapshot counts.
 */
async function checkSelectorInExtractedTrace(
  extractedDir: string,
  selector: string
): Promise<DOMCheckResult> {
  let snapshotsScanned = 0;
  let snapshotsRead = 0;
  let selectorFound = false;

  try {
    // Method 1: Look for HTML files in resources/ directory
    const resourcesDir = path.join(extractedDir, "resources");
    if (existsSync(resourcesDir)) {
      const htmlFiles = await glob("**/*.html", { cwd: resourcesDir, absolute: true }).catch(() => []);
      snapshotsScanned += htmlFiles.length;
      
      for (const htmlFile of htmlFiles) {
        try {
          const content = await fs.readFile(htmlFile, "utf-8");
          snapshotsRead++;
          if (checkSelectorInHTML(content, selector)) {
            selectorFound = true;
            break; // Found, no need to continue
          }
        } catch {
          // Skip files we can't read (counts as scanned but not read)
        }
      }
    }

    // Method 2: Look for snapshot files (page@*.html, src@*.html, etc.)
    if (!selectorFound) {
      const snapshotFiles = await glob("**/page@*.html", { cwd: extractedDir, absolute: true }).catch(() => []);
      const srcFiles = await glob("**/src@*.html", { cwd: extractedDir, absolute: true }).catch(() => []);
      const allSnapshotFiles = [...snapshotFiles, ...srcFiles];
      snapshotsScanned += allSnapshotFiles.length;

      for (const snapshotFile of allSnapshotFiles) {
        try {
          const content = await fs.readFile(snapshotFile, "utf-8");
          snapshotsRead++;
          if (checkSelectorInHTML(content, selector)) {
            selectorFound = true;
            break;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }

    // Method 3: Check all HTML files in extracted directory
    if (!selectorFound) {
      const textFiles = await glob("**/*.html", { cwd: extractedDir, absolute: true }).catch(() => []);
      // Only check files we haven't already scanned
      const newFiles = textFiles.filter((f) => {
        const relPath = path.relative(extractedDir, f);
        return !relPath.startsWith("resources") && 
               !f.includes("page@") && 
               !f.includes("src@");
      });
      snapshotsScanned += newFiles.length;

      for (const textFile of newFiles.slice(0, 50)) { // Limit to first 50
        try {
          const content = await fs.readFile(textFile, "utf-8");
          // Check if this looks like HTML
          if (content.includes("<html") || content.includes("<!DOCTYPE") || content.includes("<div")) {
            snapshotsRead++;
            if (checkSelectorInHTML(content, selector)) {
              selectorFound = true;
              break;
            }
          }
        } catch {
          // Skip files we can't read
        }
      }
    }

    return {
      status: selectorFound ? "exists" : "not-exists",
      snapshotsRead,
      snapshotsScanned,
    };
  } catch (error) {
    // Re-throw with context
    throw new Error(
      `DOM inspection failed: ${error instanceof Error ? error.message : String(error)}\n` +
      `  Extracted trace directory: ${extractedDir}\n` +
      `  Snapshots scanned: ${snapshotsScanned}\n` +
      `  Snapshots read: ${snapshotsRead}`
    );
  }
}

/**
 * Checks if selector exists in HTML content.
 */
function checkSelectorInHTML(htmlContent: string, selector: string): boolean {
  // For data-testid selectors: [data-testid="value"]
  if (selector.startsWith("[data-testid=")) {
    const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/);
    if (testIdMatch) {
      const testId = testIdMatch[1];
      // Check if data-testid exists in HTML (exact match)
      return (
        htmlContent.includes(`data-testid="${testId}"`) ||
        htmlContent.includes(`data-testid='${testId}'`) ||
        htmlContent.includes(`data-testid="${testId}" `) ||
        htmlContent.includes(`data-testid="${testId}">`)
      );
    }
  }

  // For ID selectors: #id
  if (selector.startsWith("#")) {
    const id = selector.substring(1);
    return (
      htmlContent.includes(`id="${id}"`) ||
      htmlContent.includes(`id='${id}'`) ||
      htmlContent.includes(`id="${id}" `) ||
      htmlContent.includes(`id="${id}">`)
    );
  }

  // For CSS class selectors: .className
  if (selector.startsWith(".")) {
    const className = selector.substring(1);
    // Check if class exists in HTML (word boundary check)
    const classRegex = new RegExp(`class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["']`, "i");
    return classRegex.test(htmlContent);
  }

  // For other selectors, do a simple substring check
  // This is not perfect but works for common cases
  return htmlContent.includes(selector);
}

/**
 * Escapes special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts the selector string from a locator error message.
 * Handles multiple patterns:
 * - "Timeout waiting for appReadyIndicator locator: [data-testid=\"app-ready\"]"
 * - "locator('[data-testid=\"app-ready\"]')"
 * - "waiting for locator('[data-testid=\"app-ready\"]') to be visible"
 * @param errorMessage - The error message containing locator information
 * @returns The extracted selector string, or null if not found
 */
export function extractSelectorFromError(errorMessage: string): string | null {
  // Pattern 1: "Timeout waiting for .* locator: [data-testid=\"app-ready\"]"
  // Matches: "Timeout waiting for appReadyIndicator locator: [data-testid=\"app-ready\"]"
  const locatorColonMatch = errorMessage.match(/locator:\s*(\[[^\]]+\])/i);
  if (locatorColonMatch) {
    return locatorColonMatch[1];
  }

  // Pattern 2: locator('[data-testid="app-ready"]')
  const locatorMatch = errorMessage.match(/locator\(['"]([^'"]+)['"]\)/i);
  if (locatorMatch) {
    return locatorMatch[1];
  }

  // Pattern 3: locator.waitFor('[data-testid="app-ready"]')
  const waitForMatch = errorMessage.match(/locator\.waitFor\(['"]([^'"]+)['"]\)/i);
  if (waitForMatch) {
    return waitForMatch[1];
  }

  // Pattern 4: "waiting for locator('[data-testid="app-ready"]') to be visible"
  const timeoutMatch = errorMessage.match(/waiting for locator\(['"]([^'"]+)['"]\)/i);
  if (timeoutMatch) {
    return timeoutMatch[1];
  }

  // Pattern 5: Look for [data-testid="..."] or other selector patterns in the error
  const dataTestIdMatch = errorMessage.match(/(\[data-testid=["']([^"']+)["']\])/i);
  if (dataTestIdMatch) {
    return dataTestIdMatch[1];
  }

  return null;
}
