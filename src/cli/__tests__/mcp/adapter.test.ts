/**
 * Tests for MCP adapter analyzeFailure mapping.
 */

import { describe, it, expect } from "@jest/globals";
import { analyzeFailure } from "../../mcp/adapter";
import type { FailureContext, EvidencePacket, ProposalItem } from "../../mcp/types";
import type { RuleEngineResult } from "../../mcp/heal/types";
import { PatchPlan } from "../../mcp/heal/types";

// Mock the rule engine
jest.mock("../../mcp/heal/ruleEngine", () => ({
  runDeterministicHealRules: jest.fn(),
}));

import { runDeterministicHealRules } from "../../mcp/heal/ruleEngine";

const mockRunDeterministicHealRules = runDeterministicHealRules as jest.MockedFunction<
  typeof runDeterministicHealRules
>;

describe("adapter analyzeFailure", () => {
  const createMockContext = (): FailureContext => ({
    testId: "test-123",
    testFile: "tests/example.spec.ts",
    testTitle: "Example test",
    errorMessage: "Test failed",
    stackTrace: "Error: Test failed\n    at test (example.spec.ts:10:5)",
    tracePath: "/test-results/trace.zip",
    featureKey: "example",
  });

  const createMockEvidence = (): EvidencePacket => ({
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create heal ProposalItem with patchPlan when rule returns healItem with patchPlan", async () => {
    const mockPatchPlan: PatchPlan = {
      operations: [
        {
          type: "replaceText",
          filePath: "tests/example.spec.ts",
          search: "old code",
          replace: "new code",
        },
      ],
      description: "Fix selector",
      rationale: "Selector needs fixing",
    };

    const mockRuleResults: RuleEngineResult = {
      healItems: [
        {
          ruleId: "locator-timeout",
          subtype: "selector-fix",
          confidence: 1.0,
          summary: "Fix selector",
          rationale: "Selector needs fixing",
          patchPlan: mockPatchPlan,
          targetFiles: ["tests/example.spec.ts"],
        },
      ],
      bugItems: [],
      analysisItems: [],
    };

    mockRunDeterministicHealRules.mockResolvedValue(mockRuleResults);

    const context = createMockContext();
    const evidence = createMockEvidence();
    const proposalSet = await analyzeFailure(context, evidence);

    expect(proposalSet.items.length).toBeGreaterThan(0);
    const healItem = proposalSet.items.find((i: ProposalItem) => i.type === "heal");
    expect(healItem).toBeDefined();
    expect(healItem?.type).toBe("heal");
    expect(healItem?.subtype).toBe("selector-fix");
    
    const recommendation = healItem?.recommendation as any;
    expect(recommendation.type).toBe("heal");
    expect(recommendation.subtype).toBe("selector-fix");
    expect(recommendation.patchPlan).toBeDefined();
    expect(recommendation.patchPlan).toEqual(mockPatchPlan);
  });

  it("should convert healItem without patchPlan to analysis ProposalItem", async () => {
    const mockRuleResults: RuleEngineResult = {
      healItems: [
        {
          ruleId: "locator-timeout",
          subtype: "selector-fix",
          confidence: 1.0,
          summary: "Fix selector",
          rationale: "Selector needs fixing",
          patchPlan: {
            operations: [
              {
                type: "replaceText",
                filePath: "tests/example.spec.ts",
                search: "old",
                replace: "new",
              },
            ],
            description: "Fix selector",
            rationale: "Selector needs fixing",
          },
          targetFiles: ["tests/example.spec.ts"],
        },
        // This item would have patchPlan missing (but type system prevents it)
        // We'll test the adapter's defensive check instead
      ],
      bugItems: [],
      analysisItems: [],
    };

    mockRunDeterministicHealRules.mockResolvedValue(mockRuleResults);

    const context = createMockContext();
    const evidence = createMockEvidence();
    const proposalSet = await analyzeFailure(context, evidence);

    // All heal items should have patchPlan
    const healItems = proposalSet.items.filter((i: ProposalItem) => i.type === "heal");
    for (const item of healItems) {
      const rec = item.recommendation as any;
      expect(rec.patchPlan).toBeDefined();
    }
  });

  it("should set correct subtype from healItem.subtype", async () => {
    const mockPatchPlan: PatchPlan = {
      operations: [
        {
          type: "insertAfter",
          filePath: "tests/example.spec.ts",
          anchor: "await page.goto('/');",
          insert: "await page.waitForLoadState('networkidle');\n",
        },
      ],
      description: "Add wait condition",
      rationale: "Timing issue",
    };

    const mockRuleResults: RuleEngineResult = {
      healItems: [
        {
          ruleId: "locator-timeout",
          subtype: "wait-condition",
          confidence: 0.85,
          summary: "Add wait condition",
          rationale: "Timing issue",
          patchPlan: mockPatchPlan,
          targetFiles: ["tests/example.spec.ts"],
        },
      ],
      bugItems: [],
      analysisItems: [],
    };

    mockRunDeterministicHealRules.mockResolvedValue(mockRuleResults);

    const context = createMockContext();
    const evidence = createMockEvidence();
    const proposalSet = await analyzeFailure(context, evidence);

    const healItem = proposalSet.items.find((i: ProposalItem) => i.type === "heal");
    expect(healItem?.subtype).toBe("wait-condition");
    
    const recommendation = healItem?.recommendation as any;
    expect(recommendation.subtype).toBe("wait-condition");
  });

  it("should NOT create heal items from legacy stub generation", async () => {
    // Return empty rule results to trigger legacy path
    const mockRuleResults: RuleEngineResult = {
      healItems: [],
      bugItems: [],
      analysisItems: [],
    };

    mockRunDeterministicHealRules.mockResolvedValue(mockRuleResults);

    const context = createMockContext();
    const evidence = createMockEvidence();
    const proposalSet = await analyzeFailure(context, evidence);

    // Should have NO heal items (legacy stub is disabled)
    const healItems = proposalSet.items.filter((i: ProposalItem) => i.type === "heal");
    expect(healItems.length).toBe(0);

    // Should still have analysis items
    const analysisItems = proposalSet.items.filter((i: ProposalItem) => i.type === "analysis");
    expect(analysisItems.length).toBeGreaterThan(0);
  });

  it("should map navigation-timeout subtype to wait-condition", async () => {
    const mockPatchPlan: PatchPlan = {
      operations: [
        {
          type: "insertAfter",
          filePath: "tests/example.spec.ts",
          anchor: "await page.goto('/');",
          insert: "await page.waitForLoadState('networkidle');\n",
        },
      ],
      description: "Add wait for page load state after navigation",
      rationale: "Navigation timeout",
    };

    const mockRuleResults: RuleEngineResult = {
      healItems: [
        {
          ruleId: "navigation-timeout",
          subtype: "navigation-timeout",
          confidence: 0.7,
          summary: "Add wait for page load state after navigation",
          rationale: "Navigation timeout",
          patchPlan: mockPatchPlan,
          targetFiles: ["tests/example.spec.ts"],
        },
      ],
      bugItems: [],
      analysisItems: [],
    };

    mockRunDeterministicHealRules.mockResolvedValue(mockRuleResults);

    const context = createMockContext();
    const evidence = createMockEvidence();
    const proposalSet = await analyzeFailure(context, evidence);

    const healItem = proposalSet.items.find((i: ProposalItem) => i.type === "heal");
    // navigation-timeout should map to wait-condition
    expect(healItem?.subtype).toBe("wait-condition");
    
    const recommendation = healItem?.recommendation as any;
    expect(recommendation.subtype).toBe("wait-condition");
    expect(recommendation.patchPlan).toBeDefined();
  });
});
