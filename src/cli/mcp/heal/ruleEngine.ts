// Deterministic heal rule engine
// Runs all rules against failure context and evidence

import type { FailureContext, EvidencePacket } from "../types";
import type { RuleEngineResult, RuleMatch, HealRuleSubtype } from "./types";
import { matchLocatorTimeout } from "./rules/locatorTimeoutRule";
import { matchNavigationTimeout } from "./rules/navigationTimeoutRule";
import { matchConsoleTypeError } from "./rules/consoleTypeErrorRule";
import { matchIntentGuard } from "./rules/intentGuardRule";
import { runAcceptanceCriteriaRule } from "./rules/acceptanceCriteriaRule";
import { checkHealSuppression } from "./rules/healSuppressionRule";
import { randomUUID } from "crypto";

/**
 * Maps rule ID to heal subtype based on rule and patch plan context.
 */
function mapRuleIdToSubtype(ruleId: string, patchPlan: { description: string }): HealRuleSubtype {
  // Determine subtype from patch plan description
  const desc = patchPlan.description.toLowerCase();
  
  if (ruleId === "locator-timeout") {
    if (desc.includes("selector") || desc.includes("fix") || desc.includes("replace")) {
      return "selector-fix";
    }
    if (desc.includes("timeout") || desc.includes("wait")) {
      return "wait-condition";
    }
    return "wait-condition"; // Default for locator-timeout
  }
  
  if (ruleId === "navigation-timeout") {
    return "navigation-timeout";
  }
  
  if (ruleId === "console-typeerror") {
    return "builder-default";
  }
  
  // Default fallback
  return "wait-condition";
}

/**
 * Runs all deterministic heal rules against the failure context and evidence.
 */
export async function runDeterministicHealRules(
  context: FailureContext,
  evidence: EvidencePacket
): Promise<RuleEngineResult> {
  const matches: RuleMatch[] = [];

  // Run all rules
  // Exceptions from rules (e.g., DOM inspection failures) propagate to caller
  const locatorMatch = await matchLocatorTimeout(context, evidence);
  if (locatorMatch) {
    matches.push(locatorMatch);
  }

  const navMatch = matchNavigationTimeout(context, evidence);
  if (navMatch) {
    matches.push(navMatch);
  }

  const typeErrorMatch = matchConsoleTypeError(context, evidence);
  if (typeErrorMatch) {
    matches.push(typeErrorMatch);
  }

  // Intent guard runs after other rules to catch assertion failures
  const intentMatch = matchIntentGuard(context, evidence);
  if (intentMatch) {
    matches.push(intentMatch);
  }

  // Build result
  const result: RuleEngineResult = {
    healItems: [],
    bugItems: [],
    analysisItems: [],
  };

  // Acceptance criteria alignment rule (Slice 5)
  const acMatch = runAcceptanceCriteriaRule(context, evidence);
  if (acMatch) {
    result.analysisItems.push({
      ruleId: "acceptance-criteria",
      summary: acMatch.summary,
      details: acMatch.details,
      subtype: "requirement-mismatch",
    });
  }

  for (const match of matches) {
    if (match.patchPlan) {
      // Heal proposal - patchPlan is required
      const targetFiles = match.patchPlan.operations.map((op) => op.filePath);
      const subtype = mapRuleIdToSubtype(match.ruleId, match.patchPlan);
      const healItem = {
        ruleId: match.ruleId,
        subtype,
        confidence: match.confidence,
        summary: match.patchPlan.description,
        rationale: match.rationale,
        patchPlan: match.patchPlan, // Required
        targetFiles: [...new Set(targetFiles)], // Deduplicate
      };

      // Heal suppression check (Slice 6): check if heal conflicts with acceptance criteria
      const suppression = checkHealSuppression(healItem, evidence);
      if (suppression) {
        // Suppress heal and emit analysis instead
        result.analysisItems.push({
          ruleId: match.ruleId,
          summary: suppression.summary,
          details: suppression.details,
          subtype: suppression.subtype,
        });
      } else {
        // No suppression - add heal item as normal
        result.healItems.push(healItem);
      }
    } else if (match.bugProposal) {
      // Bug proposal
      result.bugItems.push({
        ruleId: match.ruleId,
        confidence: match.confidence,
        title: match.bugProposal.title,
        description: match.bugProposal.description,
        rationale: match.bugProposal.rationale,
      });
    } else if (match.analysisOnly) {
      // Analysis only
      result.analysisItems.push({
        ruleId: match.ruleId,
        summary: match.analysisOnly.summary,
        details: match.analysisOnly.details,
      });
    }
  }

  return result;
}
