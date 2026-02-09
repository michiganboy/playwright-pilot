// MCP Adapter - Stubbed Implementation
// This adapter is READ-ONLY and REASONING-ONLY.
// It NEVER mutates repo files, test code, test data, or Azure DevOps.
// It ONLY returns structured proposal objects.
//
// All mutations are executed ONLY by Pilot CLI after explicit human approval.

import { randomUUID } from "crypto";
import type {
  FailureContext,
  ProposalSet,
  ProposalItem,
  EvidencePacket,
  HealRecommendation,
  BugRecommendation,
  AnalysisRecommendation,
  HealSubtype,
  BugSubtype,
  AnalysisSubtype,
} from "./types";
import { runDeterministicHealRules } from "./heal";

/**
 * MCP Adapter version for proposal tracking.
 */
export const MCP_ADAPTER_VERSION = "0.1.0-stub";

/**
 * Failure classification result from analysis.
 */
export interface FailureClassification {
  category: "test-issue" | "app-bug" | "environment" | "flaky" | "unknown";
  confidence: number;
  reasoning: string;
}

/**
 * Analyzes a failure and classifies it.
 * STUB: Returns mock classification based on error patterns.
 */
export function classifyFailure(context: FailureContext): FailureClassification {
  const { errorMessage, stackTrace } = context;
  const combined = `${errorMessage || ""} ${stackTrace || ""}`.toLowerCase();

  // Selector/locator issues → likely test issue
  if (
    combined.includes("locator") ||
    combined.includes("selector") ||
    combined.includes("element not found") ||
    combined.includes("no element matches") ||
    combined.includes("strict mode violation")
  ) {
    return {
      category: "test-issue",
      confidence: 0.85,
      reasoning: "Error indicates element locator/selector issue - likely requires test code update",
    };
  }

  // Timeout issues → could be flaky or environment
  if (combined.includes("timeout") || combined.includes("timed out")) {
    return {
      category: "flaky",
      confidence: 0.7,
      reasoning: "Timeout errors often indicate flaky behavior or environment slowness",
    };
  }

  // Network/API errors → likely app bug
  if (
    combined.includes("net::") ||
    combined.includes("fetch") ||
    combined.includes("api") ||
    combined.includes("500") ||
    combined.includes("502") ||
    combined.includes("503")
  ) {
    return {
      category: "app-bug",
      confidence: 0.75,
      reasoning: "Network/API errors suggest potential application issue",
    };
  }

  // Assertion failures → could be app bug or test issue
  if (combined.includes("expect") || combined.includes("assertion")) {
    return {
      category: "app-bug",
      confidence: 0.6,
      reasoning: "Assertion failure - requires investigation to determine if app regression or test update needed",
    };
  }

  return {
    category: "unknown",
    confidence: 0.4,
    reasoning: "Unable to classify failure with high confidence - manual review recommended",
  };
}

/**
 * Builds evidence packet from failure context.
 */
function buildEvidencePacket(context: FailureContext): EvidencePacket {
  return {
    traces: context.tracePath
      ? [{ path: context.tracePath, testId: context.testId }]
      : [],
    screenshots: (context.screenshots || []).map((path, idx) => ({
      path,
      label: `Screenshot ${idx + 1}`,
    })),
    reproSteps: [
      {
        order: 1,
        action: `Run test: ${context.testTitle}`,
        expected: "Test passes",
        actual: context.errorMessage || "Test failed",
      },
    ],
    expected: "Test execution completes successfully",
    actual: context.errorMessage || "Test failed with error",
    network: context.networkFailures,
    console: context.consoleOutput?.map((msg) => ({
      type: "error" as const,
      message: msg,
    })),
    errorMessage: context.errorMessage,
    stackTrace: context.stackTrace,
    testMetadata: {
      testFile: context.testFile,
      testTitle: context.testTitle,
      suiteName: context.suiteName,
      duration: context.duration,
      retries: context.retries,
    },
  };
}

/**
 * Generates analysis proposal items for cases where heal proposals cannot be generated
 * (no deterministic PatchPlan available).
 * STUB: Returns advisory analysis proposals based on error patterns.
 */
function generateHealProposals(
  context: FailureContext,
  classification: FailureClassification,
  evidence: EvidencePacket
): ProposalItem[] {
  const items: ProposalItem[] = [];
  const errorLower = (context.errorMessage || "").toLowerCase();

  // Selector fix suggestion (analysis only - no patchPlan available)
  if (
    errorLower.includes("locator") ||
    errorLower.includes("selector") ||
    errorLower.includes("element")
  ) {
    const subtype: AnalysisSubtype = "root-cause";
    const recommendation: AnalysisRecommendation = {
      type: "analysis",
      subtype,
      summary: "Selector issue detected - manual fix required",
      details:
        "The selector appears to be targeting an element that no longer exists or has changed. " +
        "Consider using a more resilient selector strategy (data-testid, role, or text content).\n\n" +
        "Note: No deterministic PatchPlan could be generated for this issue. Manual code review and fix required.",
    };

    items.push({
      id: randomUUID(),
      type: "analysis",
      subtype,
      summary: "Selector issue detected - requires manual investigation and fix",
      confidence: classification.confidence,
      evidence,
      recommendation,
      createdAt: new Date().toISOString(),
    });
  }

  // Wait condition suggestion (analysis only - no patchPlan available)
  if (errorLower.includes("timeout") || errorLower.includes("not visible")) {
    const subtype: AnalysisSubtype = "root-cause";
    const recommendation: AnalysisRecommendation = {
      type: "analysis",
      subtype,
      summary: "Timeout/wait issue detected - manual fix required",
      details:
        "The test appears to be acting on an element before it is ready. " +
        "Adding explicit wait conditions can improve reliability.\n\n" +
        "Note: No deterministic PatchPlan could be generated for this issue. Manual code review and fix required.",
    };

    items.push({
      id: randomUUID(),
      type: "analysis",
      subtype,
      summary: "Timeout/wait issue detected - requires manual investigation and fix",
      confidence: Math.min(classification.confidence, 0.7),
      evidence,
      recommendation,
      createdAt: new Date().toISOString(),
    });
  }

  return items;
}

/**
 * Generates bug proposal items based on failure analysis.
 * STUB: Returns mock proposals based on error patterns.
 */
function generateBugProposals(
  context: FailureContext,
  classification: FailureClassification,
  evidence: EvidencePacket
): ProposalItem[] {
  const items: ProposalItem[] = [];

  if (classification.category === "app-bug") {
    const subtype: BugSubtype = "functional-regression";
    const recommendation: BugRecommendation = {
      type: "bug",
      subtype,
      title: `[Auto] Test failure: ${context.testTitle}`,
      description:
        `Automated test "${context.testTitle}" in ${context.testFile} failed.\n\n` +
        `Error: ${context.errorMessage || "Unknown error"}\n\n` +
        `This appears to be a potential application issue based on the failure pattern.`,
      reproSteps:
        `1. Run test: ${context.testTitle}\n` +
        `2. Observe failure at: ${context.testFile}`,
      expectedBehavior: evidence.expected,
      actualBehavior: evidence.actual,
      severity: "3 - Medium",
      priority: 2,
      tags: ["auto-generated", "test-failure"],
    };

    items.push({
      id: randomUUID(),
      type: "bug",
      subtype,
      summary: `Potential application bug detected: ${context.testTitle}`,
      confidence: classification.confidence,
      evidence,
      recommendation,
      createdAt: new Date().toISOString(),
    });
  }

  return items;
}

/**
 * Generates analysis proposal items.
 * STUB: Returns mock analysis items.
 */
function generateAnalysisProposals(
  context: FailureContext,
  classification: FailureClassification,
  evidence: EvidencePacket
): ProposalItem[] {
  const items: ProposalItem[] = [];

  // Always include root cause analysis
  const subtype: AnalysisSubtype = "root-cause";
  const recommendation: AnalysisRecommendation = {
    type: "analysis",
    subtype,
    summary: classification.reasoning,
    details:
      `Failure classification: ${classification.category}\n` +
      `Confidence: ${(classification.confidence * 100).toFixed(0)}%\n\n` +
      `Error message: ${context.errorMessage || "N/A"}\n\n` +
      `Recommendation: ${
        classification.category === "test-issue"
          ? "Review and update test code"
          : classification.category === "app-bug"
            ? "Investigate application behavior"
            : classification.category === "flaky"
              ? "Add retry logic or improve test stability"
              : "Manual investigation required"
      }`,
  };

  items.push({
    id: randomUUID(),
    type: "analysis",
    subtype,
    summary: `Root cause analysis: ${classification.category}`,
    confidence: classification.confidence,
    evidence,
    recommendation,
    createdAt: new Date().toISOString(),
  });

  // Add flaky pattern analysis if applicable
  if (classification.category === "flaky" || context.retries) {
    const flakySubtype: AnalysisSubtype = "flaky-pattern";
    const flakyRecommendation: AnalysisRecommendation = {
      type: "analysis",
      subtype: flakySubtype,
      summary: "Potential flaky test pattern detected",
      details:
        `This test ${context.retries ? `has been retried ${context.retries} time(s)` : "shows signs of flakiness"}.\n\n` +
        `Common causes of flaky tests:\n` +
        `- Race conditions in UI rendering\n` +
        `- Network timing variability\n` +
        `- Shared state between tests\n` +
        `- Insufficient wait conditions`,
    };

    items.push({
      id: randomUUID(),
      type: "analysis",
      subtype: flakySubtype,
      summary: "Flaky test pattern detected",
      confidence: 0.6,
      evidence,
      recommendation: flakyRecommendation,
      createdAt: new Date().toISOString(),
    });
  }

  return items;
}

/**
 * Analyzes a failure context and produces a ProposalSet.
 * This is the main entry point for MCP analysis.
 *
 * IMPORTANT: This function is READ-ONLY. It analyzes failure context
 * and returns proposals. It NEVER modifies any files or external systems.
 *
 * @param context - Failure context collected from trace/test results
 * @param evidencePacket - Optional pre-built evidence packet (Slice 2)
 * @returns ProposalSet with analysis results and recommendations
 */
export async function analyzeFailure(
  context: FailureContext,
  evidencePacket?: EvidencePacket
): Promise<ProposalSet> {
  // Step 1: Classify the failure
  const classification = classifyFailure(context);

  // Step 2: Build evidence packet (use provided one or build from context)
  const evidence = evidencePacket || buildEvidencePacket(context);

  // Step 3: Run deterministic heal rules (Slice 3)
  const ruleResults = await runDeterministicHealRules(context, evidence);

  // Step 4: Generate proposals based on classification and rule results
  const items: ProposalItem[] = [];

  // Add deterministic heal proposals from rule engine
  // STRICT: Only create heal items when patchPlan exists
  for (const healItem of ruleResults.healItems) {
    // Ensure patchPlan is present (type system should enforce this, but double-check)
    if (!healItem.patchPlan) {
      // Convert to analysis item if patchPlan is missing
      items.push({
        id: randomUUID(),
        type: "analysis",
        subtype: "root-cause",
        summary: `Deterministic heal match produced no PatchPlan: ${healItem.summary}`,
        confidence: healItem.confidence,
        evidence,
        recommendation: {
          type: "analysis",
          subtype: "root-cause",
          summary: `Deterministic heal match produced no PatchPlan: ${healItem.summary}`,
          details: `Rule ${healItem.ruleId} matched but could not generate a safe PatchPlan. ${healItem.rationale}. Manual fix required.`,
        },
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    // Map rule subtype to HealSubtype
    const healSubtype: HealSubtype = healItem.subtype === "navigation-timeout" 
      ? "wait-condition" // navigation-timeout maps to wait-condition
      : healItem.subtype as HealSubtype;

    const recommendation: HealRecommendation = {
      type: "heal",
      subtype: healSubtype,
      location: {
        file: healItem.targetFiles[0] || context.testFile,
        startLine: 1, // Would be determined by actual analysis
      },
      originalCode: healItem.patchPlan ? "See PatchPlan operations" : "// Original code would be extracted here",
      proposedCode: healItem.patchPlan ? "See PatchPlan operations" : "// Proposed code would be generated here",
      rationale: healItem.rationale,
      patchPlan: healItem.patchPlan, // Required - must be present
    };

    items.push({
      id: randomUUID(),
      type: "heal",
      subtype: healSubtype,
      summary: healItem.summary,
      confidence: healItem.confidence,
      evidence,
      recommendation,
      createdAt: new Date().toISOString(),
    });
  }

  // Add analysis items from rule engine (Slice 5: acceptance criteria alignment)
  for (const analysisItem of ruleResults.analysisItems) {
    // Determine subtype: use "requirement-mismatch" for acceptance criteria rules
    const subtype: AnalysisSubtype = analysisItem.ruleId === "acceptance-criteria" 
      ? "requirement-mismatch" 
      : "root-cause";
    
    const recommendation: AnalysisRecommendation = {
      type: "analysis",
      subtype,
      summary: analysisItem.summary,
      details: analysisItem.details,
    };

    items.push({
      id: randomUUID(),
      type: "analysis",
      subtype,
      summary: analysisItem.summary,
      confidence: subtype === "requirement-mismatch" ? 0.75 : 0.5,
      evidence,
      recommendation,
      createdAt: new Date().toISOString(),
    });
  }

  // Add bug proposals from rule engine
  for (const bugItem of ruleResults.bugItems) {
    const recommendation: BugRecommendation = {
      type: "bug",
      subtype: "functional-regression",
      title: bugItem.title,
      description: bugItem.description,
      reproSteps: `1. Run test: ${context.testTitle}\n2. Observe failure`,
      expectedBehavior: evidence.expected,
      actualBehavior: evidence.actual,
      severity: "3 - Medium",
      priority: 2,
      tags: ["auto-generated", "test-failure"],
    };

    items.push({
      id: randomUUID(),
      type: "bug",
      subtype: "functional-regression",
      summary: bugItem.title,
      confidence: bugItem.confidence,
      evidence,
      recommendation,
      createdAt: new Date().toISOString(),
    });
  }

  // Add analysis items from rule engine
  for (const analysisItem of ruleResults.analysisItems) {
    const recommendation: AnalysisRecommendation = {
      type: "analysis",
      subtype: "root-cause",
      summary: analysisItem.summary,
      details: analysisItem.details,
    };

    items.push({
      id: randomUUID(),
      type: "analysis",
      subtype: "root-cause",
      summary: analysisItem.summary,
      confidence: 0.5,
      evidence,
      recommendation,
      createdAt: new Date().toISOString(),
    });
  }

  // STRICT: Deterministic rules are the ONLY source of heal items
  // Legacy stub heal generation is DISABLED - it creates heal items without patchPlan
  // Only generate analysis/bug proposals from classification if no deterministic matches
  if (items.length === 0) {
    // Generate bug proposals if it looks like an app bug
    if (classification.category === "app-bug" || classification.category === "unknown") {
      items.push(...generateBugProposals(context, classification, evidence));
    }

    // Always include analysis proposals
    items.push(...generateAnalysisProposals(context, classification, evidence));
  } else {
    // Still add analysis proposals for context
    items.push(...generateAnalysisProposals(context, classification, evidence));
  }

  // Step 4: Build and return ProposalSet
  const proposalSet: ProposalSet = {
    id: randomUUID(),
    source: {
      testFile: context.testFile,
      testTitle: context.testTitle,
      runId: context.testId,
    },
    items,
    createdAt: new Date().toISOString(),
    adapterVersion: MCP_ADAPTER_VERSION,
  };

  return proposalSet;
}

/**
 * Validates that a ProposalSet is well-formed.
 */
export function validateProposalSet(proposalSet: ProposalSet): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!proposalSet.id) {
    errors.push("ProposalSet missing id");
  }

  if (!proposalSet.source?.testFile) {
    errors.push("ProposalSet missing source.testFile");
  }

  if (!Array.isArray(proposalSet.items)) {
    errors.push("ProposalSet.items must be an array");
  } else {
    for (const item of proposalSet.items) {
      if (!item.id) {
        errors.push("ProposalItem missing id");
      }
      if (!item.type) {
        errors.push("ProposalItem missing type");
      }
      if (!item.evidence) {
        errors.push("ProposalItem missing evidence");
      }
      if (!item.recommendation) {
        errors.push("ProposalItem missing recommendation");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
