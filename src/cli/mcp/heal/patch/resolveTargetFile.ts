// Target file resolution for patch operations
// Resolves logical paths (relative to tests/) to actual filesystem paths

import { existsSync } from "fs";
import path from "path";
import { REPO_ROOT } from "../../../utils/paths";

/**
 * Result of target file resolution.
 */
export interface ResolveResult {
  success: boolean;
  resolvedPath: string;
  error?: string;
}

/**
 * Resolves a target file path for patch operations.
 * 
 * Resolution logic:
 * 1) If filePath exists as provided, use it (supports already-resolved paths)
 * 2) Else, attempt tests/<filePath>
 * 3) If that exists, use it
 * 4) Else, FAIL with clear error
 * 
 * @param filePath - Logical path (may be relative to tests/ or already resolved)
 * @returns ResolveResult with resolved path or error
 */
export function resolveTargetFile(filePath: string): ResolveResult {
  // Step 1: Check if path exists as provided (already resolved)
  const providedPath = path.join(REPO_ROOT, filePath);
  if (existsSync(providedPath)) {
    return {
      success: true,
      resolvedPath: filePath, // Keep relative path for consistency
    };
  }

  // Step 2: Attempt tests/<filePath>
  const testsPath = path.join("tests", filePath);
  const testsFullPath = path.join(REPO_ROOT, testsPath);
  if (existsSync(testsFullPath)) {
    return {
      success: true,
      resolvedPath: testsPath, // Return relative path
    };
  }

  // Step 3: Resolution failed
  return {
    success: false,
    resolvedPath: filePath, // Return original for error display
    error: `File not found: "${filePath}" (attempted: "${testsPath}")`,
  };
}
