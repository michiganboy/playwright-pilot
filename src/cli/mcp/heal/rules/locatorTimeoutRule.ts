// Rule: Locator timeout => validate selector and recommend appropriate fix
// Triggers on Playwright locator timeout errors
// Validates if selector exists in DOM to determine if issue is timing or selector
// STRICT: DOM inspection must succeed if trace is extracted

import type { FailureContext, EvidencePacket } from "../../types";
import type { RuleMatch, HealRuleId, PatchPlan } from "../types";
import { extractSelectorFromError, checkSelectorInDOM } from "./domInspector";

const RULE_ID: HealRuleId = "locator-timeout";

/**
 * Checks if error message indicates a locator timeout.
 * Matches multiple patterns including:
 * - "Timeout waiting for .* locator:"
 * - "locator.waitFor: Timeout"
 * - "waiting for locator('...') to be visible"
 */
function isLocatorTimeout(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("timeout") &&
    (lower.includes("waiting for") && lower.includes("locator") ||
      lower.match(/timeout waiting for .* locator:/) !== null ||
      lower.includes("locator.waitfor") ||
      lower.includes("locator.waitfor: timeout") ||
      lower.includes("locator.click: timeout") ||
      lower.includes("locator.fill: timeout") ||
      lower.includes("locator.press: timeout") ||
      lower.includes("waiting for locator("))
  );
}

/**
 * Extracts target file from stack trace or context.
 * Looks for src/utils/autoPilot.ts or other source files in stack trace.
 */
function findTargetFile(context: FailureContext, errorText: string): string | null {
  // Check stack trace for autoPilot.ts or other source files
  const stackTrace = errorText.toLowerCase();
  
  // Look for autoPilot.ts in stack trace
  if (stackTrace.includes("autopilot.ts") || stackTrace.includes("autoPilot")) {
    return "src/utils/autoPilot.ts";
  }
  
  // Look for other common source files in stack trace
  const sourceFileMatch = stackTrace.match(/(src\/[^:]+\.ts)/);
  if (sourceFileMatch) {
    return sourceFileMatch[1];
  }
  
  // Fallback: use test file from context
  if (context.testFile && context.testFile !== "unknown") {
    return context.testFile;
  }

  return null;
}

/**
 * Creates a patch plan for timing issue (locator exists but timing problem).
 * Targets autoPilot.ts waitForAppReady method or the file where the locator is used.
 */
function createTimingPatchPlan(targetFile: string, selector: string): PatchPlan {
  // If targeting autoPilot.ts, update the waitForAppReady method
  if (targetFile === "src/utils/autoPilot.ts") {
    return {
      operations: [
        {
          type: "replaceText",
          filePath: targetFile,
          search: `await this.page.locator(this.locators.appReadyIndicator).waitFor({ timeout: 2000 });`,
          replace: `await this.page.locator(this.locators.appReadyIndicator).waitFor({ state: 'visible', timeout: 10000 });`,
          occurrence: "first",
        },
      ],
      description: "Increase timeout for app ready indicator wait",
      rationale: `Locator "${selector}" exists in DOM but timing issue detected. Increasing timeout from 2000ms to 10000ms ensures element is ready before proceeding.`,
    };
  }
  
  // Generic timing fix for other files
  return {
    operations: [
      {
        type: "replaceText",
        filePath: targetFile,
        search: `await page.locator('${selector}').click()`,
        replace: `await page.locator('${selector}').waitFor({ state: 'visible', timeout: 10000 });\n  await page.locator('${selector}').click()`,
        occurrence: "first",
      },
    ],
    description: "Add wait condition before element interaction",
    rationale: `Locator "${selector}" exists in DOM but timing issue detected. Adding explicit wait ensures element is ready before interaction.`,
  };
}

/**
 * Creates a patch plan for selector issue (locator doesn't exist in DOM).
 * Targets autoPilot.ts locators object or the file where the selector is used.
 */
function createSelectorPatchPlan(targetFile: string, selector: string): PatchPlan {
  // If targeting autoPilot.ts, update the locators.appReadyIndicator
  if (targetFile === "src/utils/autoPilot.ts") {
    // Extract the testid value from selector
    const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/);
    const testId = testIdMatch ? testIdMatch[1] : "app-ready";
    
    return {
      operations: [
        {
          type: "replaceText",
          filePath: targetFile,
          search: `appReadyIndicator: '[data-testid="${testId}"]',`,
          replace: `appReadyIndicator: '[data-testid="__REPLACE_ME__"]', // FIXME: Selector "${selector}" not found in DOM - update to correct selector`,
          occurrence: "first",
        },
      ],
      description: "Fix app ready indicator selector to match DOM",
      rationale: `Locator "${selector}" does not exist in DOM. The selector needs to be updated to match the current page structure. Update the selector value in the locators object.`,
    };
  }
  
  // Generic selector fix for other files
  return {
    operations: [
      {
        type: "replaceText",
        filePath: targetFile,
        search: `page.locator('${selector}')`,
        replace: `page.locator('[data-testid="__REPLACE_ME__"]') // FIXME: Selector "${selector}" not found in DOM - update to correct selector`,
        occurrence: "first",
      },
    ],
    description: "Fix element selector to match DOM",
    rationale: `Locator "${selector}" does not exist in DOM. The selector needs to be updated to match the current page structure.`,
  };
}

/**
 * Matches locator timeout errors and generates heal proposals.
 * Validates selector against DOM to determine if issue is timing or selector.
 * STRICT: DOM inspection must succeed or throw (no unknown status).
 */
export async function matchLocatorTimeout(
  context: FailureContext,
  evidence: EvidencePacket
): Promise<RuleMatch | null> {
  const errorText = [
    context.errorMessage,
    context.stackTrace,
    evidence.errorMessage,
    evidence.actual, // Include actual behavior which may contain full error
    evidence.console?.map((c) => c.message).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  if (!isLocatorTimeout(errorText)) {
    return null;
  }

  // Extract selector from error message
  const selector = extractSelectorFromError(errorText);
  
  if (!selector) {
    // Can't extract selector - cannot determine if timing or selector issue
    return null;
  }

  // Find target file from stack trace or context
  const targetFile = findTargetFile(context, errorText);
  
  if (!targetFile) {
    // Can't determine target file - cannot create patch plan
    // Return analysis item instead of heal proposal
    return {
      ruleId: RULE_ID,
      confidence: 0.5,
      rationale: "Locator timeout detected but target file could not be determined",
      analysisOnly: {
        summary: "Locator timeout - manual investigation needed",
        details: "The test failed due to a locator timeout. Review the test file and ensure elements are properly waited for before interaction.",
      },
    };
  }

  // Check if selector exists in DOM
  // This will throw if trace is extracted but snapshots can't be read
  const domCheck = await checkSelectorInDOM(selector, evidence);

  // Branch based on DOM validation (strict: only exists or not-exists)
  if (domCheck.status === "exists") {
    // Locator exists in DOM - timing issue
    const patchPlan = createTimingPatchPlan(targetFile, selector);
    // Note: subtype will be determined by ruleEngine.mapRuleIdToSubtype based on patchPlan.description
    return {
      ruleId: RULE_ID,
      confidence: 0.85, // High confidence for timing issues when selector exists
      rationale: `Locator "${selector}" exists in DOM but timing issue detected. Adding explicit wait ensures element is ready before interaction.`,
      patchPlan,
    };
  } else {
    // Locator does not exist in DOM - selector issue
    // MUST NOT emit timing/wait proposals when selector is missing
    const patchPlan = createSelectorPatchPlan(targetFile, selector);
    // Note: subtype will be determined by ruleEngine.mapRuleIdToSubtype based on patchPlan.description
    return {
      ruleId: RULE_ID,
      confidence: 1.0, // Maximum confidence for selector issues
      rationale: `Locator "${selector}" does not exist in DOM. The selector needs to be updated to match the current page structure.`,
      patchPlan,
    };
  }
}
