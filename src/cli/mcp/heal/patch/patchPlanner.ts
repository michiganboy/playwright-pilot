// Patch planner - validates and prepares patch plans for application

import type { PatchPlan, PatchOperation } from "../types";
import { existsSync } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { REPO_ROOT } from "../../../utils/paths";
import { resolveTargetFile } from "./resolveTargetFile";

/**
 * Validation result for a patch plan.
 */
export interface PatchPlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a patch plan before application.
 * Checks that all target files exist and operations are safe.
 * Resolves target file paths before validation.
 */
export async function validatePatchPlan(plan: PatchPlan): Promise<PatchPlanValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const operation of plan.operations) {
    // Resolve target file path and overwrite operation.filePath
    const resolveResult = resolveTargetFile(operation.filePath);
    
    if (!resolveResult.success) {
      errors.push(resolveResult.error || `Target file does not exist: ${operation.filePath}`);
      continue;
    }

    // Overwrite operation.filePath with resolved path BEFORE any filesystem operations
    operation.filePath = resolveResult.resolvedPath;
    
    // Use resolved path for validation
    const filePath = path.join(REPO_ROOT, operation.filePath);
    
    // Check file exists (should always pass after resolution, but double-check)
    if (!existsSync(filePath)) {
      errors.push(`Target file does not exist after resolution: ${operation.filePath}`);
      continue;
    }

    // Validate operation-specific preconditions
    if (operation.type === "replaceText") {
      const content = await fs.readFile(filePath, "utf-8");
      const occurrences = (content.match(new RegExp(escapeRegex(operation.search), "g")) || []).length;
      
      if (occurrences === 0) {
        errors.push(
          `Search string not found in ${operation.filePath}: "${operation.search.substring(0, 50)}..."`
        );
      } else if (occurrences > 1 && operation.occurrence !== "all") {
        warnings.push(
          `Search string found ${occurrences} times in ${operation.filePath}, will replace first occurrence only`
        );
      }
    } else if (operation.type === "insertAfter") {
      const content = await fs.readFile(filePath, "utf-8");
      const occurrences = (content.match(new RegExp(escapeRegex(operation.anchor), "g")) || []).length;
      
      if (occurrences === 0) {
        errors.push(
          `Anchor string not found in ${operation.filePath}: "${operation.anchor.substring(0, 50)}..."`
        );
      } else if (occurrences > 1) {
        errors.push(
          `Anchor string found ${occurrences} times in ${operation.filePath}, must be unique`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Escapes special regex characters in a string for use in RegExp.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Gets a preview of what a patch plan would change.
 * Resolves target file paths before preview.
 */
export async function previewPatchPlan(plan: PatchPlan): Promise<string[]> {
  const preview: string[] = [];
  
  for (const operation of plan.operations) {
    // Resolve target file path and overwrite operation.filePath
    const resolveResult = resolveTargetFile(operation.filePath);
    
    if (!resolveResult.success) {
      preview.push(`[SKIP] ${operation.filePath} (${resolveResult.error})`);
      continue;
    }

    // Overwrite operation.filePath with resolved path BEFORE any filesystem operations
    operation.filePath = resolveResult.resolvedPath;
    
    const filePath = path.join(REPO_ROOT, operation.filePath);
    
    if (!existsSync(filePath)) {
      preview.push(`[SKIP] ${operation.filePath} (file not found after resolution)`);
      continue;
    }

    if (operation.type === "replaceText") {
      preview.push(
        `[REPLACE] ${operation.filePath}: "${operation.search.substring(0, 40)}..." → "${operation.replace.substring(0, 40)}..."`
      );
    } else if (operation.type === "insertAfter") {
      preview.push(
        `[INSERT] ${operation.filePath}: Insert after "${operation.anchor.substring(0, 40)}..."`
      );
    }
  }

  return preview;
}
