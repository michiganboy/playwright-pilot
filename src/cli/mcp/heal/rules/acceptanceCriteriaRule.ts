// Acceptance Criteria Alignment Rule
// Compares ADO parent acceptance criteria vs test intent
// Deterministic token overlap analysis (no NLP)

import type { FailureContext, EvidencePacket } from "../../types";

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
 * Runs acceptance criteria alignment rule.
 * Returns an ANALYSIS item if test intent does not match ADO acceptance criteria.
 */
export function runAcceptanceCriteriaRule(
  context: FailureContext,
  evidence: EvidencePacket
): {
  type: "analysis";
  subtype: "requirement-mismatch";
  confidence: number;
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

  // Extract test intent from multiple sources
  const intentSources: string[] = [];
  
  // From test title
  if (context.testTitle) {
    intentSources.push(context.testTitle);
  }
  
  // From evidence test metadata
  if (evidence.testMetadata?.testTitle) {
    intentSources.push(evidence.testMetadata.testTitle);
  }
  
  // From error message (if it contains assertion-like text)
  if (context.errorMessage) {
    // Look for assertion patterns
    const assertionMatch = context.errorMessage.match(/expect.*?to(?:Equal|Be|Contain|Match)/i);
    if (assertionMatch) {
      intentSources.push(context.errorMessage);
    }
  }

  if (intentSources.length === 0) {
    return null;
  }

  // Combine all intent sources
  const combinedIntent = intentSources.join(" ");
  
  // Extract tokens from intent and acceptance criteria
  const intentTokens = extractTokens(combinedIntent);
  const acTokens = extractTokens(acceptanceCriteria);

  // Check for overlap
  if (!hasOverlap(intentTokens, acTokens)) {
    // No meaningful overlap - emit requirement-mismatch analysis item
    return {
      type: "analysis",
      subtype: "requirement-mismatch",
      confidence: 0.75,
      summary: "Test intent may not match Acceptance Criteria",
      details: `Test intent tokens: ${Array.from(intentTokens).slice(0, 10).join(", ")}...\n` +
               `Acceptance Criteria checked: ${acceptanceCriteria.substring(0, 200)}${acceptanceCriteria.length > 200 ? "..." : ""}\n` +
               `No meaningful token overlap detected (minimum 1 token required).`,
    };
  }

  // Overlap exists - no item
  return null;
}
