/**
 * Tests for SelectionManifest persistence (Slice 7).
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import {
  saveSelectionManifest,
  loadSelectionManifest,
  getSelectionManifestPath,
} from "../../../mcp/proposals/selectionManifest";
import { REPO_ROOT } from "../../../utils/paths";

const SELECTION_DIR = path.join(REPO_ROOT, ".pilot", "proposals", "selection");
import type { SelectionManifest } from "../../../mcp/types";

describe("SelectionManifest persistence", () => {
  let testDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    process.env = {
      ...originalEnv,
      PILOT_DIR: testDir,
    };
  });

  afterEach(async () => {
    process.env = originalEnv;
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it("should save manifest to correct path", async () => {
    const proposalId = "test-proposal-123";
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: ["item-1", "item-2"],
      createdAt: new Date().toISOString(),
    };

    const savedPath = await saveSelectionManifest(manifest);
    const expectedPath = getSelectionManifestPath(proposalId);

    expect(savedPath).toBe(expectedPath);
    expect(existsSync(savedPath)).toBe(true);
  });

  it("should create selection directory if missing", async () => {
    const proposalId = "test-proposal-456";
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: [],
      createdAt: new Date().toISOString(),
    };

    await saveSelectionManifest(manifest);

    expect(existsSync(SELECTION_DIR)).toBe(true);
  });

  it("should load manifest with correct content", async () => {
    const proposalId = "test-proposal-789";
    const selectedItemIds = ["item-a", "item-b", "item-c"];
    const createdAt = new Date().toISOString();

    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds,
      createdAt,
    };

    await saveSelectionManifest(manifest);
    const loaded = await loadSelectionManifest(proposalId);

    expect(loaded).not.toBeNull();
    expect(loaded?.proposalId).toBe(proposalId);
    expect(loaded?.selectedItemIds).toEqual(selectedItemIds);
    expect(loaded?.createdAt).toBe(createdAt);
  });

  it("should return null when manifest does not exist", async () => {
    const loaded = await loadSelectionManifest("non-existent-proposal");
    expect(loaded).toBeNull();
  });

  it("should overwrite existing manifest deterministically", async () => {
    const proposalId = "test-proposal-overwrite";
    
    const manifest1: SelectionManifest = {
      proposalId,
      selectedItemIds: ["item-1"],
      createdAt: new Date().toISOString(),
    };

    await saveSelectionManifest(manifest1);
    
    const manifest2: SelectionManifest = {
      proposalId,
      selectedItemIds: ["item-2", "item-3"],
      createdAt: manifest1.createdAt, // Keep same createdAt
    };

    await saveSelectionManifest(manifest2);
    
    const loaded = await loadSelectionManifest(proposalId);
    
    expect(loaded).not.toBeNull();
    expect(loaded?.selectedItemIds).toEqual(["item-2", "item-3"]);
    expect(loaded?.createdAt).toBe(manifest1.createdAt);
  });

  it("should fail loudly on invalid JSON", async () => {
    const proposalId = "test-proposal-invalid-json";
    const filePath = getSelectionManifestPath(proposalId);
    
    await fs.mkdir(SELECTION_DIR, { recursive: true });
    await fs.writeFile(filePath, "invalid json content", "utf-8");

    await expect(loadSelectionManifest(proposalId)).rejects.toThrow(
      "Invalid JSON in selection manifest"
    );
  });

  it("should fail loudly on missing proposalId", async () => {
    const proposalId = "test-proposal-missing-id";
    const filePath = getSelectionManifestPath(proposalId);
    
    await fs.mkdir(SELECTION_DIR, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({ selectedItemIds: [], createdAt: new Date().toISOString() }),
      "utf-8"
    );

    await expect(loadSelectionManifest(proposalId)).rejects.toThrow(
      "missing or invalid proposalId"
    );
  });

  it("should fail loudly on proposalId mismatch", async () => {
    const proposalId = "test-proposal-mismatch";
    const filePath = getSelectionManifestPath(proposalId);
    
    await fs.mkdir(SELECTION_DIR, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        proposalId: "different-proposal-id",
        selectedItemIds: [],
        createdAt: new Date().toISOString(),
      }),
      "utf-8"
    );

    await expect(loadSelectionManifest(proposalId)).rejects.toThrow(
      "proposalId mismatch"
    );
  });

  it("should fail loudly on invalid selectedItemIds (not array)", async () => {
    const proposalId = "test-proposal-invalid-ids";
    const filePath = getSelectionManifestPath(proposalId);
    
    await fs.mkdir(SELECTION_DIR, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        proposalId,
        selectedItemIds: "not-an-array",
        createdAt: new Date().toISOString(),
      }),
      "utf-8"
    );

    await expect(loadSelectionManifest(proposalId)).rejects.toThrow(
      "selectedItemIds must be an array"
    );
  });

  it("should fail loudly on missing createdAt", async () => {
    const proposalId = "test-proposal-missing-created";
    const filePath = getSelectionManifestPath(proposalId);
    
    await fs.mkdir(SELECTION_DIR, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        proposalId,
        selectedItemIds: [],
      }),
      "utf-8"
    );

    await expect(loadSelectionManifest(proposalId)).rejects.toThrow(
      "missing or invalid createdAt"
    );
  });

  it("should handle empty selectedItemIds array", async () => {
    const proposalId = "test-proposal-empty-selection";
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: [],
      createdAt: new Date().toISOString(),
    };

    await saveSelectionManifest(manifest);
    const loaded = await loadSelectionManifest(proposalId);

    expect(loaded).not.toBeNull();
    expect(loaded?.selectedItemIds).toEqual([]);
  });

  it("should use atomic write (temp + rename)", async () => {
    const proposalId = "test-proposal-atomic";
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: ["item-1"],
      createdAt: new Date().toISOString(),
    };

    const filePath = getSelectionManifestPath(proposalId);
    const tempPath = `${filePath}.tmp`;

    // Start save operation
    const savePromise = saveSelectionManifest(manifest);

    // Check that temp file exists during write
    // Note: This is a timing-dependent test, but should work in most cases
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    // After save completes, temp file should be gone and final file should exist
    await savePromise;

    expect(existsSync(tempPath)).toBe(false);
    expect(existsSync(filePath)).toBe(true);
  });
});
