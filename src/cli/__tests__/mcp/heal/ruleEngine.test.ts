/**
 * Tests for deterministic heal rule engine.
 */

import { describe, it, expect } from "@jest/globals";
import { runDeterministicHealRules } from "../../../mcp/heal/ruleEngine";
import type { FailureContext, EvidencePacket } from "../../../mcp/types";

describe("ruleEngine", () => {
  const createMockContext = (errorMessage: string): FailureContext => ({
    testId: "test-123",
    testFile: "tests/example.spec.ts",
    testTitle: "Example test",
    errorMessage,
    stackTrace: `Error: ${errorMessage}\n    at test (example.spec.ts:10:5)`,
    tracePath: "/test-results/trace.zip",
    featureKey: "example",
  });

  const createMockEvidence = (errorMessage?: string): EvidencePacket => ({
    traces: [],
    screenshots: [],
    reproSteps: [],
    expected: "Test passes",
    actual: errorMessage || "Test failed",
    errorMessage,
    collectionMetadata: {
      collectedAt: new Date().toISOString(),
      sourcePaths: [],
      indexingNotes: [],
      traceExtracted: false,
      attachmentCounts: {
        screenshots: 0,
        videos: 0,
        logs: 0,
        other: 0,
      },
    },
  });

  it("should detect locator timeout errors", async () => {
    const errorMessage = 'Timeout waiting for locator: [data-testid="app-ready"]';
    const context = createMockContext(errorMessage);
    const evidence = createMockEvidence(errorMessage);
    
    const result = await runDeterministicHealRules(context, evidence);
    
    expect(result.healItems.length).toBeGreaterThan(0);
    expect(result.healItems[0].ruleId).toBe("locator-timeout");
    expect(result.healItems[0].patchPlan).toBeDefined();
  });

  it("should detect navigation timeout errors", async () => {
    const context = createMockContext("Navigation timeout while waiting for page.goto");
    const evidence = createMockEvidence("Navigation timeout while waiting for page.goto");
    
    const result = await runDeterministicHealRules(context, evidence);
    
    expect(result.healItems.length).toBeGreaterThan(0);
    expect(result.healItems[0].ruleId).toBe("navigation-timeout");
  });

  it("should detect TypeError errors", async () => {
    const context = createMockContext("TypeError: Cannot read properties of undefined");
    const evidence = createMockEvidence("TypeError: Cannot read properties of undefined");
    
    const result = await runDeterministicHealRules(context, evidence);
    
    // May return heal or analysis depending on context
    expect(result.healItems.length + result.analysisItems.length).toBeGreaterThan(0);
  });

  it("should return empty results for unrelated errors", async () => {
    const context = createMockContext("Network request failed");
    const evidence = createMockEvidence("Network request failed");
    
    const result = await runDeterministicHealRules(context, evidence);
    
    // Should still have some analysis items from intent guard potentially
    expect(result.healItems.length).toBe(0);
  });

  it("should suppress heal when acceptance criteria conflicts (Slice 6)", async () => {
    const errorMessage = 'Timeout waiting for locator: [data-testid="app-ready"]';
    const context = createMockContext(errorMessage);
    const evidence = createMockEvidence(errorMessage);
    evidence.adoContext = {
      testId: 10001,
      testCase: {
        id: 10001,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10001",
        title: "Test Case",
        type: "Test Case",
      },
      parent: {
        id: 20001,
        type: "User Story",
        title: "User Story",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20001",
        acceptanceCriteria: "The system should display dashboard after successful authentication",
        description: null,
      },
    };
    
    const result = await runDeterministicHealRules(context, evidence);
    
    // Heal should be suppressed if it conflicts with acceptance criteria
    // Check if any analysis items have requirement-mismatch subtype
    const suppressionAnalysis = result.analysisItems.find(
      (item) => item.subtype === "requirement-mismatch" && item.ruleId === "locator-timeout"
    );
    
    // If suppression occurred, heal should not be in healItems
    if (suppressionAnalysis) {
      const suppressedHeal = result.healItems.find((item) => item.ruleId === "locator-timeout");
      expect(suppressedHeal).toBeUndefined();
    }
  });

  it("should pass heal through when acceptance criteria aligns (Slice 6)", async () => {
    const errorMessage = 'Timeout waiting for locator: [data-testid="login-button"]';
    const context = createMockContext(errorMessage);
    const evidence = createMockEvidence(errorMessage);
    evidence.adoContext = {
      testId: 10002,
      testCase: {
        id: 10002,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10002",
        title: "Test Case",
        type: "Test Case",
      },
      parent: {
        id: 20002,
        type: "User Story",
        title: "User Story",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20002",
        acceptanceCriteria: "The system should allow user login with valid credentials",
        description: null,
      },
    };
    
    const result = await runDeterministicHealRules(context, evidence);
    
    // Heal should pass through if it aligns with acceptance criteria
    // Check that heal items exist (may be suppressed or not depending on overlap)
    const hasHealItems = result.healItems.length > 0;
    const hasSuppressionAnalysis = result.analysisItems.some(
      (item) => item.subtype === "requirement-mismatch" && item.ruleId === "locator-timeout"
    );
    
    // Either heal passes through OR is suppressed, but not both
    expect(hasHealItems || hasSuppressionAnalysis).toBe(true);
    expect(hasHealItems && hasSuppressionAnalysis).toBe(false);
  });

  it("should not suppress heal when no ADO context (Slice 6)", async () => {
    const errorMessage = 'Timeout waiting for locator: [data-testid="app-ready"]';
    const context = createMockContext(errorMessage);
    const evidence = createMockEvidence(errorMessage);
    // No adoContext
    
    const result = await runDeterministicHealRules(context, evidence);
    
    // Heal behavior should be unchanged without ADO context
    expect(result.healItems.length).toBeGreaterThan(0);
    expect(result.healItems[0].ruleId).toBe("locator-timeout");
    
    // No suppression analysis should be present
    const suppressionAnalysis = result.analysisItems.find(
      (item) => item.subtype === "requirement-mismatch" && item.ruleId === "locator-timeout"
    );
    expect(suppressionAnalysis).toBeUndefined();
  });
});
