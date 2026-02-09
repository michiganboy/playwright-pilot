// Patch applier - applies patch plans to files
// Handles preview mode and safety checks

import type { PatchPlan, PatchApplyResult, FileEditResult } from "../types";
import { validatePatchPlan, previewPatchPlan } from "./patchPlanner";
import { replaceTextInFile, insertAfterInFile } from "./fileEdits";
import { resolveTargetFile } from "./resolveTargetFile";

/**
 * Applies a patch plan to files.
 * @param plan - The patch plan to apply
 * @param preview - If true, only preview changes without modifying files
 */
export async function applyPatchPlan(
  plan: PatchPlan,
  preview: boolean = false
): Promise<PatchApplyResult> {
  // Validate plan first
  const validation = await validatePatchPlan(plan);
  
  if (!validation.valid) {
    // Operations may have been mutated by validation (paths resolved)
    return {
      patchPlan: plan,
      results: plan.operations.map((op) => ({
        operation: op,
        success: false,
        message: `Validation failed: ${validation.errors.join("; ")}`,
        filePath: op.filePath, // May be resolved or original depending on where validation failed
        error: validation.errors.join("; "),
      })),
      success: false,
      totalOperations: plan.operations.length,
      successfulOperations: 0,
      failedOperations: plan.operations.length,
    };
  }

  // Show warnings if any
  if (validation.warnings.length > 0 && !preview) {
    // Warnings are logged but don't block application
  }

  // Apply operations
  const results: FileEditResult[] = [];

  if (preview) {
    // Preview mode: preview only (paths already resolved and mutated in previewPatchPlan)
    const previewMessages = await previewPatchPlan(plan);
    for (let i = 0; i < plan.operations.length; i++) {
      const op = plan.operations[i];
      // op.filePath is already resolved by previewPatchPlan
      results.push({
        operation: op,
        success: true,
        message: `[PREVIEW] ${previewMessages[i] || "Would apply operation"}`,
        filePath: op.filePath, // Already resolved
      });
    }
  } else {
    // Real application - resolve paths and mutate operation.filePath before applying
    for (const operation of plan.operations) {
      // Resolve target file path and overwrite operation.filePath BEFORE any filesystem operations
      const resolveResult = resolveTargetFile(operation.filePath);
      
      if (!resolveResult.success) {
        results.push({
          operation,
          success: false,
          message: resolveResult.error || `Failed to resolve file: ${operation.filePath}`,
          filePath: operation.filePath,
          error: resolveResult.error,
        });
        continue;
      }

      // Overwrite operation.filePath with resolved path BEFORE any filesystem operations
      operation.filePath = resolveResult.resolvedPath;

      if (operation.type === "replaceText") {
        const result = await replaceTextInFile(
          operation.filePath, // Now using resolved path
          operation.search!,
          operation.replace!,
          operation.occurrence || "first"
        );
        results.push({
          operation,
          ...result,
          filePath: operation.filePath, // Already resolved
        });
      } else if (operation.type === "insertAfter") {
        const result = await insertAfterInFile(
          operation.filePath, // Now using resolved path
          operation.anchor!,
          operation.insert!
        );
        results.push({
          operation,
          ...result,
          filePath: operation.filePath, // Already resolved
        });
      }
    }
  }

  const successfulOperations = results.filter((r) => r.success).length;
  const failedOperations = results.filter((r) => !r.success).length;

  return {
    patchPlan: plan,
    results,
    success: failedOperations === 0,
    totalOperations: plan.operations.length,
    successfulOperations,
    failedOperations,
  };
}
