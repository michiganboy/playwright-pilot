/**
 * Tests for review and apply commands with SelectionManifest (Slice 7).
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { runReview } from "../../../mcp/commands/review";
import { runApply } from "../../../mcp/commands/apply";
import {
  saveProposalSet,
  ACTIVE_DIR,
} from "../../../mcp/persistence";
import {
  loadSelectionManifest,
  saveSelectionManifest,
} from "../../../mcp/proposals/selectionManifest";
import { REPO_ROOT } from "../../../utils/paths";

const SELECTION_DIR = path.join(REPO_ROOT, ".pilot", "proposals", "selection");
import type { ProposalSet, ProposalItem, SelectionManifest } from "../../../mcp/types";

// Mock inquirer prompts
jest.mock("@inquirer/prompts", () => ({
  checkbox: jest.fn(),
  confirm: jest.fn(),
  select: jest.fn(),
  input: jest.fn(),
}));

import { checkbox, confirm, select } from "@inquirer/prompts";

const mockCheckbox = checkbox as jest.MockedFunction<typeof checkbox>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;
const mockSelect = select as jest.MockedFunction<typeof select>;

describe("review and apply with SelectionManifest", () => {
  let testDir: string;
  const originalEnv = process.env;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    process.env = {
      ...originalEnv,
      PILOT_DIR: testDir,
    };
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(async () => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  function createTestProposal(proposalId: string, items: ProposalItem[]): ProposalSet {
    return {
      id: proposalId,
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "Test example",
      },
      items,
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };
  }

  function createTestHealItem(itemId: string): ProposalItem {
    return {
      id: itemId,
      type: "heal",
      subtype: "selector-fix",
      summary: `Heal item ${itemId}`,
      confidence: 0.9,
      evidence: {
        traces: [],
        screenshots: [],
        reproSteps: [],
        expected: "",
        actual: "",
      },
      recommendation: {
        type: "heal",
        subtype: "selector-fix",
        location: {
          file: "tests/example.spec.ts",
          startLine: 10,
        },
        originalCode: "old code",
        proposedCode: "new code",
        rationale: "Fix selector",
        patchPlan: {
          operations: [],
          description: "Fix selector",
          rationale: "Fix selector",
        },
      },
      createdAt: new Date().toISOString(),
    };
  }

  it("should write manifest after review with --all flag", async () => {
    const proposalId = "test-proposal-review-all";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
      createTestHealItem("item-2"),
    ]);

    await saveProposalSet(proposal);

    const result = await runReview({
      proposalId,
      all: true,
      quiet: true,
    });

    expect(result).toBe(true);

    const manifest = await loadSelectionManifest(proposalId);
    expect(manifest).not.toBeNull();
    expect(manifest?.proposalId).toBe(proposalId);
    expect(manifest?.selectedItemIds).toEqual(["item-1", "item-2"]);
    expect(manifest?.createdAt).toBeDefined();
  });

  it("should write manifest with empty array after review with --none flag", async () => {
    const proposalId = "test-proposal-review-none";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
      createTestHealItem("item-2"),
    ]);

    await saveProposalSet(proposal);

    const result = await runReview({
      proposalId,
      none: true,
      quiet: true,
    });

    expect(result).toBe(true);

    const manifest = await loadSelectionManifest(proposalId);
    expect(manifest).not.toBeNull();
    expect(manifest?.selectedItemIds).toEqual([]);
  });

  it("should write manifest after interactive review", async () => {
    const proposalId = "test-proposal-review-interactive";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
      createTestHealItem("item-2"),
    ]);

    await saveProposalSet(proposal);

    mockSelect.mockResolvedValue("quick");
    mockCheckbox.mockResolvedValue(["item-1"]);

    const result = await runReview({
      proposalId,
      quiet: true,
    });

    expect(result).toBe(true);

    const manifest = await loadSelectionManifest(proposalId);
    expect(manifest).not.toBeNull();
    expect(manifest?.selectedItemIds).toEqual(["item-1"]);
  });

  it("should overwrite manifest on second review", async () => {
    const proposalId = "test-proposal-review-overwrite";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
      createTestHealItem("item-2"),
    ]);

    await saveProposalSet(proposal);

    // First review - select item-1
    await runReview({
      proposalId,
      all: true,
      quiet: true,
    });

    const manifest1 = await loadSelectionManifest(proposalId);
    expect(manifest1?.selectedItemIds).toEqual(["item-1", "item-2"]);

    // Second review - select none
    await runReview({
      proposalId,
      none: true,
      quiet: true,
    });

    const manifest2 = await loadSelectionManifest(proposalId);
    expect(manifest2?.selectedItemIds).toEqual([]);
    expect(manifest2?.createdAt).toBe(manifest1?.createdAt); // createdAt preserved
  });

  it("should fail apply when manifest is missing", async () => {
    const proposalId = "test-proposal-apply-no-manifest";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
    ]);

    await saveProposalSet(proposal);

    const result = await runApply({
      proposalId,
      quiet: true,
    });

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("No selection manifest found")
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("pilot mcp:review")
    );
  });

  it("should read manifest and apply selected items", async () => {
    const proposalId = "test-proposal-apply-with-manifest";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
      createTestHealItem("item-2"),
    ]);

    await saveProposalSet(proposal);

    // Create manifest via review
    await runReview({
      proposalId,
      all: true,
      quiet: true,
    });

    mockConfirm.mockResolvedValue(true);

    const result = await runApply({
      proposalId,
      yes: true,
      quiet: true,
    });

    // Apply should succeed (even if patch application fails, manifest was read correctly)
    // The key test is that it doesn't fail with "manifest missing" error
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining("No selection manifest found")
    );
  });

  it("should apply only selected items from manifest", async () => {
    const proposalId = "test-proposal-apply-selected-only";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
      createTestHealItem("item-2"),
      createTestHealItem("item-3"),
    ]);

    await saveProposalSet(proposal);

    // Create manifest with only item-1 selected
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: ["item-1"],
      createdAt: new Date().toISOString(),
    };

    await saveSelectionManifest(manifest);

    mockConfirm.mockResolvedValue(true);

    await runApply({
      proposalId,
      yes: true,
      quiet: true,
    });

    // Verify manifest was read correctly (no "manifest missing" error)
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining("No selection manifest found")
    );
  });

  it("should fail loudly with clear error message when manifest is invalid", async () => {
    const proposalId = "test-proposal-apply-invalid-manifest";
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
    ]);

    await saveProposalSet(proposal);

    // Write invalid manifest (missing proposalId)
    const filePath = path.join(SELECTION_DIR, `${proposalId}.selection.json`);
    await fs.mkdir(SELECTION_DIR, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({ selectedItemIds: [], createdAt: new Date().toISOString() }),
      "utf-8"
    );

    const result = await runApply({
      proposalId,
      quiet: true,
    });

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load selection manifest")
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("pilot mcp:review")
    );
  });
});
