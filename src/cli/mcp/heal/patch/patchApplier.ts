// Patch applier - applies patch plans to files
// Transactional: on any failure, rolls back all prior operations.

import path from "path";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import type { PatchPlan, PatchApplyResult, FileEditResult, RollbackResult } from "../types";
import { validatePatchPlan, previewPatchPlan } from "./patchPlanner";
import { replaceTextInFile, insertAfterInFile } from "./fileEdits";
import { REPO_ROOT } from "../../../utils/paths";

/**
 * Restores file content atomically (temp + rename). Best-effort.
 */
async function restoreFile(fullPath: string, content: string): Promise<{ success: boolean; error?: string }> {
  try {
    const tempPath = `${fullPath}.tmp`;
    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, fullPath);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Applies a patch plan to files.
 * Paths are resolved once in validatePatchPlan; fileEdits receive resolved repo-relative paths.
 * On any operation failure (non-preview), all prior changes are rolled back.
 */
export async function applyPatchPlan(
  plan: PatchPlan,
  preview: boolean = false
): Promise<PatchApplyResult> {
  const validation = await validatePatchPlan(plan);

  if (!validation.valid) {
    return {
      patchPlan: plan,
      results: plan.operations.map((op) => ({
        operation: op,
        success: false,
        message: `Validation failed: ${validation.errors.join("; ")}`,
        filePath: op.filePath,
        error: validation.errors.join("; "),
      })),
      success: false,
      totalOperations: plan.operations.length,
      successfulOperations: 0,
      failedOperations: plan.operations.length,
    };
  }

  const results: FileEditResult[] = [];

  if (preview) {
    const previewMessages = await previewPatchPlan(plan);
    for (let i = 0; i < plan.operations.length; i++) {
      const op = plan.operations[i];
      results.push({
        operation: op,
        success: true,
        message: `[PREVIEW] ${previewMessages[i] || "Would apply operation"}`,
        filePath: op.filePath,
      });
    }
    return {
      patchPlan: plan,
      results,
      success: true,
      totalOperations: plan.operations.length,
      successfulOperations: results.length,
      failedOperations: 0,
    };
  }

  // Real apply: paths already resolved by validatePatchPlan; snapshot before first write per file
  const snapshotByFullPath = new Map<string, string>();
  const repoRoot = REPO_ROOT;

  for (const operation of plan.operations) {
    const fullPath = path.join(repoRoot, operation.filePath);

    if (!snapshotByFullPath.has(fullPath)) {
      if (!existsSync(fullPath)) {
        results.push({
          operation,
          success: false,
          message: `File not found: ${operation.filePath}`,
          filePath: operation.filePath,
          error: "File does not exist",
        });
        const rollbackResults = await rollbackAll(snapshotByFullPath);
        return {
          patchPlan: plan,
          results,
          rollbackResults,
          success: false,
          totalOperations: plan.operations.length,
          successfulOperations: results.filter((r) => r.success).length,
          failedOperations: results.filter((r) => !r.success).length,
        };
      }
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        snapshotByFullPath.set(fullPath, content);
      } catch (error) {
        results.push({
          operation,
          success: false,
          message: `Failed to read file: ${operation.filePath}`,
          filePath: operation.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        const rollbackResults = await rollbackAll(snapshotByFullPath);
        return {
          patchPlan: plan,
          results,
          rollbackResults,
          success: false,
          totalOperations: plan.operations.length,
          successfulOperations: results.filter((r) => r.success).length,
          failedOperations: results.filter((r) => !r.success).length,
        };
      }
    }

    let editResult: FileEditResult;
    if (operation.type === "replaceText") {
      const result = await replaceTextInFile(
        operation.filePath,
        operation.search,
        operation.replace,
        operation.occurrence || "first"
      );
      editResult = {
        operation,
        ...result,
        filePath: operation.filePath,
      };
    } else {
      const result = await insertAfterInFile(operation.filePath, operation.anchor, operation.insert);
      editResult = {
        operation,
        ...result,
        filePath: operation.filePath,
      };
    }

    results.push(editResult);

    if (!editResult.success) {
      const rollbackResults = await rollbackAll(snapshotByFullPath);
      return {
        patchPlan: plan,
        results,
        rollbackResults,
        success: false,
        totalOperations: plan.operations.length,
        successfulOperations: results.filter((r) => r.success).length,
        failedOperations: results.filter((r) => !r.success).length,
      };
    }
  }

  return {
    patchPlan: plan,
    results,
    success: true,
    totalOperations: plan.operations.length,
    successfulOperations: results.length,
    failedOperations: 0,
  };
}

async function rollbackAll(snapshotByFullPath: Map<string, string>): Promise<RollbackResult[]> {
  const rollbackResults: RollbackResult[] = [];
  for (const [fullPath, content] of snapshotByFullPath) {
    const outcome = await restoreFile(fullPath, content);
    rollbackResults.push({
      filePath: fullPath,
      success: outcome.success,
      error: outcome.error,
    });
  }
  return rollbackResults;
}
