/**
 * Tests for acceptance criteria alignment rule.
 */

import { describe, it, expect } from "@jest/globals";
import { runAcceptanceCriteriaRule } from "../../../../mcp/heal/rules/acceptanceCriteriaRule";
import type { FailureContext, EvidencePacket } from "../../../../mcp/types";

describe("acceptanceCriteriaRule", () => {
  const createMockContext = (testTitle: string, errorMessage?: string): FailureContext => ({
    testId: "test-123",
    testFile: "tests/example.spec.ts",
    testTitle,
    errorMessage: errorMessage || "Test failed",
    stackTrace: `Error: ${errorMessage || "Test failed"}\n    at test (example.spec.ts:10:5)`,
    tracePath: "/test-results/trace.zip",
    featureKey: "example",
  });

  const createMockEvidence = (adoContext?: EvidencePacket["adoContext"]): EvidencePacket => ({
    traces: [],
    screenshots: [],
    reproSteps: [],
    expected: "Test passes",
    actual: "Test failed",
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
    adoContext,
  });

  it("should emit requirement-mismatch when no overlap", () => {
    const context = createMockContext("[10001] User login flow");
    const evidence = createMockEvidence({
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
    });

    const result = runAcceptanceCriteriaRule(context, evidence);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("analysis");
    expect(result?.subtype).toBe("requirement-mismatch");
    expect(result?.summary).toBe("Test intent may not match Acceptance Criteria");
    expect(result?.details).toContain("Test intent tokens");
    expect(result?.details).toContain("Acceptance Criteria checked");
  });

  it("should emit null when overlap exists", () => {
    const context = createMockContext("[10002] User login authentication");
    const evidence = createMockEvidence({
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
        acceptanceCriteria: "The system should display dashboard after successful authentication",
        description: null,
      },
    });

    const result = runAcceptanceCriteriaRule(context, evidence);

    expect(result).toBeNull();
  });

  it("should emit null when acceptanceCriteria empty", () => {
    const context = createMockContext("[10003] User login flow");
    const evidence = createMockEvidence({
      testId: 10003,
      testCase: {
        id: 10003,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10003",
        title: "Test Case",
        type: "Test Case",
      },
      parent: {
        id: 20003,
        type: "User Story",
        title: "User Story",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20003",
        acceptanceCriteria: null,
        description: null,
      },
    });

    const result = runAcceptanceCriteriaRule(context, evidence);

    expect(result).toBeNull();
  });

  it("should emit null when acceptanceCriteria is empty string", () => {
    const context = createMockContext("[10004] User login flow");
    const evidence = createMockEvidence({
      testId: 10004,
      testCase: {
        id: 10004,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10004",
        title: "Test Case",
        type: "Test Case",
      },
      parent: {
        id: 20004,
        type: "User Story",
        title: "User Story",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20004",
        acceptanceCriteria: "",
        description: null,
      },
    });

    const result = runAcceptanceCriteriaRule(context, evidence);

    expect(result).toBeNull();
  });

  it("should emit null when parent is null", () => {
    const context = createMockContext("[10005] User login flow");
    const evidence = createMockEvidence({
      testId: 10005,
      testCase: {
        id: 10005,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10005",
        title: "Test Case",
        type: "Test Case",
      },
      parent: null,
    });

    const result = runAcceptanceCriteriaRule(context, evidence);

    expect(result).toBeNull();
  });

  it("should emit null when adoContext is missing", () => {
    const context = createMockContext("[10006] User login flow");
    const evidence = createMockEvidence(undefined);

    const result = runAcceptanceCriteriaRule(context, evidence);

    expect(result).toBeNull();
  });

  it("should extract intent from error message with assertion patterns", () => {
    const context = createMockContext(
      "[10007] User login flow",
      "expect(page.locator('button')).toBeVisible()"
    );
    const evidence = createMockEvidence({
      testId: 10007,
      testCase: {
        id: 10007,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10007",
        title: "Test Case",
        type: "Test Case",
      },
      parent: {
        id: 20007,
        type: "User Story",
        title: "User Story",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20007",
        acceptanceCriteria: "The system should display dashboard after successful authentication",
        description: null,
      },
    });

    const result = runAcceptanceCriteriaRule(context, evidence);

    expect(result).not.toBeNull();
    expect(result?.subtype).toBe("requirement-mismatch");
  });
});
