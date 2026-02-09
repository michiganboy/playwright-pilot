// Heal rule engine types for MCP Slice 3
// Deterministic heuristics for generating actionable heal proposals

/**
 * Unique identifier for a heal rule.
 */
export type HealRuleId =
  | "locator-timeout"
  | "navigation-timeout"
  | "console-typeerror"
  | "intent-guard"
  | "acceptance-criteria";

/**
 * Confidence level for a heal proposal (0.0 to 1.0).
 */
export type HealConfidence = number;

/**
 * Patch operation types (safe, deterministic only).
 */
export type PatchOperationType = "replaceText" | "insertAfter";

/**
 * Replace text operation.
 * Replaces exact string matches in a file.
 */
export interface ReplaceTextOperation {
  type: "replaceText";
  filePath: string;
  search: string;
  replace: string;
  occurrence?: "first" | "all";
}

/**
 * Insert after operation.
 * Inserts text after an exact anchor string.
 */
export interface InsertAfterOperation {
  type: "insertAfter";
  filePath: string;
  anchor: string;
  insert: string;
}

export type PatchOperation = ReplaceTextOperation | InsertAfterOperation;

/**
 * Patch plan containing one or more operations.
 */
export interface PatchPlan {
  operations: PatchOperation[];
  description: string;
  rationale: string;
}

/**
 * Rule match result from a single rule.
 */
export interface RuleMatch {
  ruleId: HealRuleId;
  confidence: HealConfidence;
  rationale: string;
  patchPlan?: PatchPlan;
  bugProposal?: {
    title: string;
    description: string;
    rationale: string;
  };
  analysisOnly?: {
    summary: string;
    details: string;
  };
}

/**
 * Heal subtype for deterministic rules.
 */
export type HealRuleSubtype = "selector-fix" | "wait-condition" | "navigation-timeout" | "test-flow" | "builder-default";

/**
 * Rule engine result containing all matched rules.
 */
export interface RuleEngineResult {
  healItems: Array<{
    ruleId: HealRuleId;
    subtype: HealRuleSubtype;
    confidence: HealConfidence;
    summary: string;
    rationale: string;
    patchPlan: PatchPlan; // Required for heal items
    targetFiles: string[];
  }>;
  bugItems: Array<{
    ruleId: HealRuleId;
    confidence: HealConfidence;
    title: string;
    description: string;
    rationale: string;
  }>;
  analysisItems: Array<{
    ruleId: HealRuleId;
    summary: string;
    details: string;
    subtype?: string; // Optional subtype for analysis items (e.g., "requirement-mismatch")
  }>;
}

/**
 * File edit result from applying a patch operation.
 */
export interface FileEditResult {
  operation: PatchOperation;
  success: boolean;
  message: string;
  filePath: string;
  linesChanged?: number;
  error?: string;
}

/**
 * Patch application result.
 */
export interface PatchApplyResult {
  patchPlan: PatchPlan;
  results: FileEditResult[];
  success: boolean;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
}
