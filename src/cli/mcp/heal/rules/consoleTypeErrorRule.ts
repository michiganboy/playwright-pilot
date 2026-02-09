// Rule: TypeError / undefined access
// Triggers on JavaScript TypeError in console/logs

import type { FailureContext, EvidencePacket } from "../../types";
import type { RuleMatch, HealRuleId, PatchPlan } from "../types";
import { existsSync } from "fs";
import path from "path";
import { REPO_ROOT } from "../../../utils/paths";

const RULE_ID: HealRuleId = "console-typeerror";

/**
 * Checks if error message indicates a TypeError.
 */
function isTypeError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("typeerror:") ||
    lower.includes("cannot read properties of undefined") ||
    lower.includes("cannot read property") ||
    lower.includes("is not a function") ||
    lower.includes("is undefined")
  );
}

/**
 * Finds the target file for the patch.
 * Returns the logical path (relative to tests/) - resolution happens later.
 */
function findTargetFile(context: FailureContext): string | null {
  // Check if error suggests test data issue
  const errorText = context.errorMessage?.toLowerCase() || "";
  const isDataIssue = errorText.includes("factory") || errorText.includes("builder") || errorText.includes("create");

  if (isDataIssue) {
    // Try to find builder/factory files
    // This is conservative - we'd need more context to find the exact file
    // For now, prefer test file
  }

  // context.testFile is already relative to tests/ (e.g., "login-page/LOGI-101-user-login-flow.spec.ts")
  if (context.testFile && context.testFile !== "unknown") {
    return context.testFile;
  }

  return null;
}

/**
 * Creates a patch plan for TypeError.
 */
function createPatchPlan(targetFile: string, errorMessage: string): PatchPlan | null {
  if (!targetFile) {
    return null;
  }

  // Conservative approach: suggest adding a guard or default
  // The actual patch would need to see the code structure
  const lowerError = errorMessage.toLowerCase();
  
  if (lowerError.includes("cannot read properties of undefined")) {
    return {
      operations: [
        {
          type: "insertAfter",
          filePath: targetFile,
          anchor: "// TODO: Add undefined guard",
          insert: "if (!variable) throw new Error('Variable is undefined');\n",
        },
      ],
      description: "Add undefined guard check",
      rationale:
        "TypeError suggests undefined access. Adding a guard check prevents the error.",
    };
  }

  return null;
}

/**
 * Matches TypeError errors and generates heal proposals.
 */
export function matchConsoleTypeError(
  context: FailureContext,
  evidence: EvidencePacket
): RuleMatch | null {
  const errorText = [
    context.errorMessage,
    context.stackTrace,
    evidence.errorMessage,
    evidence.console?.map((c) => c.message).join("\n"),
    evidence.attachmentReferences?.map((a) => a.path).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  if (!isTypeError(errorText)) {
    return null;
  }

  const targetFile = findTargetFile(context);
  
  if (!targetFile) {
    // Can't determine target - return analysis only
    return {
      ruleId: RULE_ID,
      confidence: 0.4,
      rationale: "TypeError detected but target file could not be determined",
      analysisOnly: {
        summary: "TypeError - manual investigation needed",
        details:
          "The test failed due to a JavaScript TypeError (likely undefined access). Review the test code and test data factories to identify the source.",
      },
    };
  }

  const patchPlan = createPatchPlan(targetFile, errorText);
  
  if (!patchPlan) {
    return {
      ruleId: RULE_ID,
      confidence: 0.4,
      rationale: "TypeError detected but safe patch could not be generated",
      analysisOnly: {
        summary: "TypeError - manual fix required",
        details:
          "The test failed due to a TypeError. A safe automatic fix could not be determined. Review the code and add appropriate guards or defaults.",
      },
    };
  }

  // Lower confidence for TypeErrors as they often require understanding context
  const confidence = 0.4;

  return {
    ruleId: RULE_ID,
    confidence,
    rationale:
      "TypeError detected. Adding a guard check or default value should resolve this.",
    patchPlan,
  };
}
