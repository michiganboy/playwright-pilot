// Rule: Navigation timeout / page closed
// Triggers on Playwright navigation timeout errors

import type { FailureContext, EvidencePacket } from "../../types";
import type { RuleMatch, HealRuleId, PatchPlan } from "../types";
import { existsSync } from "fs";
import path from "path";
import { REPO_ROOT } from "../../../utils/paths";

const RULE_ID: HealRuleId = "navigation-timeout";

/**
 * Checks if error message indicates a navigation timeout.
 */
function isNavigationTimeout(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("navigation timeout") ||
    lower.includes("page.goto: timeout") ||
    lower.includes("target closed") ||
    lower.includes("page closed") ||
    (lower.includes("timeout") && lower.includes("navigation"))
  );
}

/**
 * Finds the target file for the patch.
 * Returns the logical path (relative to tests/) - resolution happens later.
 */
function findTargetFile(context: FailureContext): string | null {
  // context.testFile is already relative to tests/ (e.g., "login-page/LOGI-101-user-login-flow.spec.ts")
  if (context.testFile && context.testFile !== "unknown") {
    return context.testFile;
  }
  return null;
}

/**
 * Creates a patch plan for navigation timeout.
 */
function createPatchPlan(targetFile: string): PatchPlan | null {
  if (!targetFile) {
    return null;
  }

  // Conservative patch: suggest adding wait for navigation
  // The actual patch would need to find the goto() call and add waitUntil
  return {
    operations: [
      {
        type: "insertAfter",
        filePath: targetFile,
        anchor: "// TODO: Add navigation wait",
        insert: "await page.waitForLoadState('networkidle');\n",
      },
    ],
    description: "Add wait for page load state after navigation",
    rationale:
      "Navigation timeout suggests the page may not have fully loaded. Adding a wait for network idle ensures the page is ready before proceeding.",
  };
}

/**
 * Matches navigation timeout errors and generates heal proposals.
 */
export function matchNavigationTimeout(
  context: FailureContext,
  evidence: EvidencePacket
): RuleMatch | null {
  const errorText = [
    context.errorMessage,
    context.stackTrace,
    evidence.errorMessage,
    evidence.console?.map((c) => c.message).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  if (!isNavigationTimeout(errorText)) {
    return null;
  }

  const targetFile = findTargetFile(context);
  
  if (!targetFile) {
    return {
      ruleId: RULE_ID,
      confidence: 0.5,
      rationale: "Navigation timeout detected but target file could not be determined",
      analysisOnly: {
        summary: "Navigation timeout - manual investigation needed",
        details:
          "The test failed due to a navigation timeout. Review the test and ensure proper wait conditions are in place after navigation.",
      },
    };
  }

  const patchPlan = createPatchPlan(targetFile);
  
  if (!patchPlan) {
    return {
      ruleId: RULE_ID,
      confidence: 0.5,
      rationale: "Navigation timeout detected but safe patch could not be generated",
      analysisOnly: {
        summary: "Navigation timeout - manual fix required",
        details:
          "The test failed due to a navigation timeout. A safe automatic fix could not be determined.",
      },
    };
  }

  // Confidence based on error clarity
  let confidence: number = 0.5;
  if (errorText.includes("page.goto: timeout")) {
    confidence = 0.7;
  } else if (errorText.includes("target closed")) {
    confidence = 0.6;
  }

  return {
    ruleId: RULE_ID,
    confidence,
    rationale:
      "Navigation timeout error detected. Adding explicit wait for page load state should resolve this.",
    patchPlan,
  };
}
