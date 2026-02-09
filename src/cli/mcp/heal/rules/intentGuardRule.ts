// Rule: Intent guard - prevents weakening test assertions
// If a "fix" would weaken assertions, emit bug proposal instead

import type { FailureContext, EvidencePacket } from "../../types";
import type { RuleMatch, HealRuleId } from "../types";

const RULE_ID: HealRuleId = "intent-guard";

/**
 * Checks if error suggests assertion failure that shouldn't be "fixed".
 */
function isAssertionFailure(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("expect") ||
    lower.includes("assertion") ||
    lower.includes("expected") ||
    (lower.includes("not equal") && lower.includes("actual"))
  );
}

/**
 * Checks if the error suggests a real product bug vs test issue.
 */
function suggestsProductBug(errorMessage: string, evidence: EvidencePacket): boolean {
  const lower = errorMessage.toLowerCase();
  
  // If assertion shows actual != expected with clear values, likely product bug
  if (lower.includes("expected:") && lower.includes("received:")) {
    // Check if the values are clearly different (not just timing/formatting)
    const expectedMatch = errorMessage.match(/expected:\s*([^\n]+)/i);
    const receivedMatch = errorMessage.match(/received:\s*([^\n]+)/i);
    
    if (expectedMatch && receivedMatch) {
      const expected = expectedMatch[1].trim();
      const received = receivedMatch[1].trim();
      
      // If values are substantially different, likely product bug
      if (expected !== received && expected.length > 3 && received.length > 3) {
        return true;
      }
    }
  }

  // Network errors often indicate product issues
  if (evidence.network && evidence.network.some((n) => n.failed || (n.status && n.status >= 500))) {
    return true;
  }

  return false;
}

/**
 * Intent guard rule - prevents weakening test intent.
 */
export function matchIntentGuard(
  context: FailureContext,
  evidence: EvidencePacket,
  proposedHealRuleId?: HealRuleId
): RuleMatch | null {
  const errorText = [
    context.errorMessage,
    context.stackTrace,
    evidence.errorMessage,
  ]
    .filter(Boolean)
    .join("\n");

  // Only check if there's an assertion failure
  if (!isAssertionFailure(errorText)) {
    return null;
  }

  // If this looks like a product bug, emit bug proposal
  if (suggestsProductBug(errorText, evidence)) {
    return {
      ruleId: RULE_ID,
      confidence: 0.7,
      rationale:
        "Assertion failure suggests a product bug rather than a test issue. Fixing this would weaken test intent.",
      bugProposal: {
        title: "Possible product bug or expectation mismatch",
        description:
          `Test assertion failed: ${context.errorMessage || "Assertion mismatch"}\n\n` +
          `This appears to be a product behavior issue rather than a test code problem. ` +
          `Fixing the test to match current behavior would weaken the test's intent.`,
        rationale:
          "The assertion failure shows a clear mismatch between expected and actual behavior. " +
          "This suggests the product may have regressed or the expectation needs product-side verification.",
      },
    };
  }

  // If assertion failure but unclear if product bug, return analysis
  return {
    ruleId: RULE_ID,
    confidence: 0.5,
    rationale: "Assertion failure detected - requires manual review to determine if product bug or test issue",
    analysisOnly: {
      summary: "Assertion failure - review required",
      details:
        "The test failed due to an assertion mismatch. Review to determine if this is a product bug or if the test expectation needs updating.",
    },
  };
}
