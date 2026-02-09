/**
 * Tests for heal suppression rule (Slice 6).
 */

import { describe, it, expect } from "@jest/globals";
import { checkHealSuppression } from "../../../../mcp/heal/rules/healSuppressionRule";
import type { EvidencePacket } from "../../../../mcp/types";
import type { RuleEngineResult } from "../../../../mcp/heal/types";

describe("healSuppressionRule", () => {
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

  const createMockHealItem = (
    description: string,
    rationale: string = "Test rationale"
  ): RuleEngineResult["healItems"][0] => ({
    ruleId: "locator-timeout",
    subtype: "wait-condition",
    confidence: 0.8,
    summary: description,
    rationale,
    patchPlan: {
      operations: [],
      description,
      rationale,
    },
    targetFiles: ["tests/example.spec.ts"],
  });

  it("should suppress heal when no overlap with acceptance criteria", () => {
    const healItem = createMockHealItem(
      "Fix selector for navigation menu",
      "Update selector to match new DOM structure"
    );
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

    const result = checkHealSuppression(healItem, evidence);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("analysis");
    expect(result?.subtype).toBe("requirement-mismatch");
    expect(result?.summary).toBe("Automated healing may violate Acceptance Criteria");
    expect(result?.details).toContain("Heal Proposal");
    expect(result?.details).toContain("Acceptance Criteria");
  });

  it("should not suppress heal when overlap exists", () => {
    const healItem = createMockHealItem(
      "Add wait condition before authentication element interaction",
      "The authentication element may not be ready when clicked"
    );
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

    const result = checkHealSuppression(healItem, evidence);

    expect(result).toBeNull();
  });

  it("should return null when no ADO context", () => {
    const healItem = createMockHealItem("Add wait condition");
    const evidence = createMockEvidence(undefined);

    const result = checkHealSuppression(healItem, evidence);

    expect(result).toBeNull();
  });

  it("should return null when acceptance criteria is empty", () => {
    const healItem = createMockHealItem("Add wait condition");
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

    const result = checkHealSuppression(healItem, evidence);

    expect(result).toBeNull();
  });

  it("should return null when acceptance criteria is empty string", () => {
    const healItem = createMockHealItem("Add wait condition");
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

    const result = checkHealSuppression(healItem, evidence);

    expect(result).toBeNull();
  });

  it("should return null when parent is null", () => {
    const healItem = createMockHealItem("Add wait condition");
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

    const result = checkHealSuppression(healItem, evidence);

    expect(result).toBeNull();
  });

  it("should extract tokens from multiple heal sources", () => {
    const healItem = createMockHealItem(
      "Fix selector for login button",
      "The login button selector needs updating"
    );
    const evidence = createMockEvidence({
      testId: 10006,
      testCase: {
        id: 10006,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10006",
        title: "Test Case",
        type: "Test Case",
      },
      parent: {
        id: 20006,
        type: "User Story",
        title: "User Story",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20006",
        acceptanceCriteria: "The system should display dashboard after successful authentication",
        description: null,
      },
    });

    const result = checkHealSuppression(healItem, evidence);

    // Should suppress because "login" and "authentication" overlap
    expect(result).toBeNull();
  });

  it("should ignore numbers in token extraction", () => {
    const healItem = createMockHealItem(
      "Fix selector for element 12345",
      "Element 12345 needs updating"
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

    const result = checkHealSuppression(healItem, evidence);

    // Numbers should be ignored, so no overlap
    expect(result).not.toBeNull();
  });

  it("should be deterministic (same input produces same output)", () => {
    const healItem = createMockHealItem("Add wait condition");
    const evidence = createMockEvidence({
      testId: 10008,
      testCase: {
        id: 10008,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/10008",
        title: "Test Case",
        type: "Test Case",
      },
      parent: {
        id: 20008,
        type: "User Story",
        title: "User Story",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20008",
        acceptanceCriteria: "The system should display dashboard after successful authentication",
        description: null,
      },
    });

    const result1 = checkHealSuppression(healItem, evidence);
    const result2 = checkHealSuppression(healItem, evidence);

    expect(result1).toEqual(result2);
  });
});
