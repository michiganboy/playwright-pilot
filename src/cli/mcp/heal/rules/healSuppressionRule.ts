// Heal Suppression Rule (Slice 6)
// Suppresses heal recommendations that conflict with ADO acceptance criteria
// Deterministic token overlap analysis (no NLP)

import type { EvidencePacket } from "../../types";
import type { RuleEngineResult } from "../types";

/**
 * Extracts meaningful tokens from text (words length >= 3, case-insensitive).
 * Ignores numbers and tokens shorter than 3 characters.
 */
function extractTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const words = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
  for (const word of words) {
    // Ignore numbers (pure numeric tokens)
    if (!/^\d+$/.test(word)) {
      tokens.add(word);
    }
  }
  return tokens;
}

/**
 * Checks if two token sets have meaningful overlap.
 * Returns true if at least 1 token overlaps.
 */
function hasOverlap(tokens1: Set<string>, tokens2: Set<string>): boolean {
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a heal recommendation should be suppressed based on ADO acceptance criteria.
 * Returns suppression analysis item if heal conflicts with acceptance criteria, null otherwise.
 */
export function checkHealSuppression(
  healItem: RuleEngineResult["healItems"][0],
  evidence: EvidencePacket
): {
  type: "analysis";
  subtype: "requirement-mismatch";
  summary: string;
  details: string;
} | null {
  // Only run if ADO context is present
  if (!evidence.adoContext?.parent?.acceptanceCriteria) {
    return null;
  }

  const acceptanceCriteria = evidence.adoContext.parent.acceptanceCriteria;
  if (!acceptanceCriteria || acceptanceCriteria.trim().length === 0) {
    return null;
  }

  // Extract tokens from heal proposal
  const healSources: string[] = [];

  // From test metadata title (if present, leading source)
  const testTitle = evidence.testMetadata?.testTitle?.trim();
  if (testTitle && testTitle.length > 0 && !healSources.includes(testTitle)) {
    healSources.push(testTitle);
  }

  // From patch plan description
  if (healItem.patchPlan.description && !healSources.includes(healItem.patchPlan.description)) {
    healSources.push(healItem.patchPlan.description);
  }
  
  // From patch plan rationale
  if (healItem.patchPlan.rationale && !healSources.includes(healItem.patchPlan.rationale)) {
    healSources.push(healItem.patchPlan.rationale);
  }
  
  // From heal item summary
  if (healItem.summary && !healSources.includes(healItem.summary)) {
    healSources.push(healItem.summary);
  }
  
  // From heal item rationale
  if (healItem.rationale && !healSources.includes(healItem.rationale)) {
    healSources.push(healItem.rationale);
  }

  if (healSources.length === 0) {
    return null;
  }

  // Combine all heal sources
  const combinedHeal = healSources.join(" ");
  
  // Extract tokens from heal proposal and acceptance criteria
  const healTokens = extractTokens(combinedHeal);
  const acTokens = extractTokens(acceptanceCriteria);

  // Check for overlap
  if (!hasOverlap(healTokens, acTokens)) {
    // No meaningful overlap - suppress heal and emit requirement-mismatch analysis item
    return {
      type: "analysis",
      subtype: "requirement-mismatch",
      summary: "Automated healing may violate Acceptance Criteria",
      details: `The proposed heal recommendation shows limited overlap with the parent work item's Acceptance Criteria.\n\n` +
               `**Heal Proposal**: ${healItem.summary}\n` +
               `**Acceptance Criteria**: ${acceptanceCriteria.substring(0, 200)}${acceptanceCriteria.length > 200 ? "..." : ""}\n\n` +
               `Consider reviewing the heal proposal to ensure it aligns with the requirements before applying.`,
    };
  }

  // Overlap exists - no suppression
  return null;
}
