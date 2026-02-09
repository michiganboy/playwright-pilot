// MCP Integration Types
// Model Context Protocol types for read-only, reasoning-only analysis.
// MCP NEVER mutates repo files, test code, test data, or Azure DevOps.
// All mutations are executed ONLY by Pilot CLI after explicit human approval.

/**
 * Proposal item types.
 * - heal: Proposes code fix (selector, wait, flow, builder)
 * - bug: Proposes ADO bug creation with evidence
 * - analysis: Informational only, never applied
 */
export type ProposalType = "heal" | "bug" | "analysis";

/**
 * Heal subtypes for specific fix categories.
 */
export type HealSubtype =
  | "selector-fix"
  | "wait-condition"
  | "test-flow"
  | "builder-default"
  | "locator-strategy"
  | "assertion-fix";

/**
 * Bug subtypes for categorization.
 */
export type BugSubtype =
  | "functional-regression"
  | "ui-change"
  | "api-contract"
  | "environment"
  | "data-integrity"
  | "performance";

/**
 * Analysis subtypes for informational items.
 */
export type AnalysisSubtype =
  | "flaky-pattern"
  | "timing-insight"
  | "coverage-gap"
  | "dependency-chain"
  | "root-cause"
  | "requirement-mismatch";

export type ProposalSubtype = HealSubtype | BugSubtype | AnalysisSubtype;

/**
 * Confidence level for proposal items.
 * 0.0 - 1.0 scale.
 */
export type Confidence = number;

/**
 * Network evidence from trace analysis.
 */
export interface NetworkEvidence {
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  timing?: {
    startTime: number;
    responseEnd?: number;
  };
  failed?: boolean;
  failureReason?: string;
}

/**
 * Console evidence from trace analysis.
 */
export interface ConsoleEvidence {
  type: "log" | "warn" | "error" | "info" | "debug";
  message: string;
  timestamp?: number;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
}

/**
 * Screenshot reference.
 */
export interface ScreenshotRef {
  path: string;
  timestamp?: number;
  label?: string;
}

/**
 * Trace reference.
 */
export interface TraceRef {
  path: string;
  runId?: string;
  testId?: string;
}

/**
 * Repro step for evidence.
 */
export interface ReproStep {
  order: number;
  action: string;
  selector?: string;
  value?: string;
  expected?: string;
  actual?: string;
  screenshot?: ScreenshotRef;
}

/**
 * Collection metadata for evidence (Slice 2).
 */
export interface CollectionMetadata {
  collectedAt: string;
  sourcePaths: string[];
  indexingNotes: string[];
  traceExtracted: boolean;
  extractedTraceDir?: string;
  attachmentCounts: {
    screenshots: number;
    videos: number;
    logs: number;
    other: number;
  };
}

/**
 * Evidence packet attached to proposal items.
 * Must include trace references, screenshots, and repro steps.
 */
export interface EvidencePacket {
  /** Trace file references */
  traces: TraceRef[];

  /** Screenshots captured during failure */
  screenshots: ScreenshotRef[];

  /** Reproduction steps */
  reproSteps: ReproStep[];

  /** Expected vs actual behavior */
  expected: string;
  actual: string;

  /** Network evidence (if applicable) */
  network?: NetworkEvidence[];

  /** Console/JS errors (if applicable) */
  console?: ConsoleEvidence[];

  /** Original error message from test */
  errorMessage?: string;

  /** Original stack trace from test */
  stackTrace?: string;

  /** Test metadata */
  testMetadata?: {
    testFile: string;
    testTitle: string;
    suiteName?: string;
    duration?: number;
    retries?: number;
  };

  /** Video references (Slice 2) */
  videoReferences?: ScreenshotRef[];

  /** Other attachment references (logs, etc.) (Slice 2) */
  attachmentReferences?: ScreenshotRef[];

  /** Collection metadata (Slice 2) */
  collectionMetadata?: CollectionMetadata;

  /** ADO context (Slice 5) - optional Azure DevOps work item context */
  adoContext?: {
    testId: number;
    testCase: {
      id: number;
      url: string;
      title: string;
      type: string;
    };
    parent: {
      id: number;
      type: string;
      title: string;
      url: string;
      acceptanceCriteria: string | null;
      description: string | null;
    } | null;
  };
}

/**
 * Code change location.
 */
export interface CodeLocation {
  file: string;
  startLine: number;
  endLine?: number;
}

/**
 * Patch operation and plan types for heal proposals (Slice 3).
 * Re-exported from heal/types to ensure single source of truth.
 */
import type { PatchOperation, PatchPlan } from "./heal/types";
export type { PatchOperation, PatchPlan };

/**
 * Heal recommendation details.
 */
export interface HealRecommendation {
  type: "heal";
  subtype: HealSubtype;
  location: CodeLocation;
  originalCode: string;
  proposedCode: string;
  rationale: string;
  patchPlan: PatchPlan; // Slice 3: REQUIRED - heal items must have patchPlan
}

/**
 * Bug recommendation details.
 */
export interface BugRecommendation {
  type: "bug";
  subtype: BugSubtype;
  title: string;
  description: string;
  reproSteps: string;
  expectedBehavior: string;
  actualBehavior: string;
  severity: "1 - Critical" | "2 - High" | "3 - Medium" | "4 - Low";
  priority: 1 | 2 | 3 | 4;
  tags?: string[];
  areaPath?: string;
}

/**
 * Analysis recommendation details (informational only).
 */
export interface AnalysisRecommendation {
  type: "analysis";
  subtype: AnalysisSubtype;
  summary: string;
  details: string;
  relatedItems?: string[];
}

export type Recommendation =
  | HealRecommendation
  | BugRecommendation
  | AnalysisRecommendation;

/**
 * Individual proposal item returned by MCP.
 */
export interface ProposalItem {
  /** Unique identifier for this proposal */
  id: string;

  /** Proposal type */
  type: ProposalType;

  /** Specific subtype */
  subtype: ProposalSubtype;

  /** Human-readable summary */
  summary: string;

  /** Confidence score (0.0 - 1.0) */
  confidence: Confidence;

  /** Evidence supporting this proposal */
  evidence: EvidencePacket;

  /** Recommended action */
  recommendation: Recommendation;

  /** Creation timestamp */
  createdAt: string;
}

/**
 * Set of proposals returned by MCP for a single analysis.
 */
export interface ProposalSet {
  /** Unique identifier for this proposal set */
  id: string;

  /** Source test that triggered analysis */
  source: {
    testFile: string;
    testTitle: string;
    runId?: string;
  };

  /** Individual proposal items */
  items: ProposalItem[];

  /** When this proposal set was created */
  createdAt: string;

  /** In-memory context (not persisted to JSON) */
  context?: {
    ado?: import("./ado/types").AdoContext;
  };

  /** MCP adapter version that generated this */
  adapterVersion: string;
}

/**
 * Selection state for a proposal item.
 * @deprecated Use SelectionManifest.selectedItemIds instead
 */
export interface SelectionState {
  itemId: string;
  selected: boolean;
  selectedAt?: string;
  selectedBy?: string;
}

/**
 * Selection manifest persisted after review.
 * Slice 7: Simplified format for deterministic persistence.
 */
export interface SelectionManifest {
  /** Proposal ID this manifest applies to */
  proposalId: string;

  /** Array of selected item IDs */
  selectedItemIds: string[];

  /** When the manifest was created (ISO string) */
  createdAt: string;
}

/**
 * Apply result for a single proposal item.
 */
export interface ApplyResult {
  itemId: string;
  success: boolean;
  action: "applied" | "skipped" | "failed";
  message?: string;
  details?: {
    filesModified?: string[];
    adoWorkItemId?: number;
    backupPath?: string;
  };
}

/**
 * Apply summary after executing selected proposals.
 */
export interface ApplySummary {
  proposalSetId: string;
  results: ApplyResult[];
  appliedAt: string;
  totalSelected: number;
  totalApplied: number;
  totalFailed: number;
  totalSkipped: number;
}

/**
 * Failure context collected for MCP analysis.
 */
export interface FailureContext {
  /** Path to the trace file */
  tracePath: string;

  /** Error message from the test */
  errorMessage: string;

  /** Stack trace (if available) */
  stackTrace?: string;

  /** Test file path */
  testFile: string;

  /** Test title */
  testTitle: string;

  /** Suite name */
  suiteName?: string;

  /** Test duration in ms */
  duration?: number;

  /** Retry count */
  retries?: number;

  /** Feature key (if determinable) */
  featureKey?: string;

  /** Test ID (e.g., [12345]) */
  testId?: string;

  /** Screenshot paths */
  screenshots?: string[];

  /** Console output */
  consoleOutput?: string[];

  /** Network failures */
  networkFailures?: NetworkEvidence[];
}

/**
 * Archived proposal record.
 */
export interface ArchivedProposal {
  proposalSet: ProposalSet;
  selectionManifest: SelectionManifest;
  applySummary: ApplySummary;
  archivedAt: string;
}
