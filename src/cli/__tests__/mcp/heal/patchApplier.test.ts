/**
 * Tests for patch application.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { applyPatchPlan } from "../../../mcp/heal/patch/patchApplier";
import type { PatchPlan } from "../../../mcp/heal/types";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { REPO_ROOT } from "../../../utils/paths";

// Mock fs operations - use factory pattern to avoid hoisting issues
jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs") as Record<string, unknown>;
  const mockReadFile = jest.fn() as jest.MockedFunction<typeof import("fs").promises.readFile>;
  const mockWriteFile = jest.fn() as jest.MockedFunction<typeof import("fs").promises.writeFile>;
  const mockRename = jest.fn() as jest.MockedFunction<typeof import("fs").promises.rename>;
  const mockExistsSync = jest.fn() as jest.MockedFunction<typeof import("fs").existsSync>;
  return {
    ...actualFs,
    existsSync: mockExistsSync,
    promises: {
      ...(actualFs.promises as Record<string, unknown>),
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      rename: mockRename,
    },
    __mocks: {
      mockReadFile,
      mockWriteFile,
      mockRename,
      mockExistsSync,
    },
  };
});

// Get mocks from the mocked module
const fsModule = jest.requireMock("fs") as typeof import("fs") & {
  __mocks?: {
    mockReadFile: jest.MockedFunction<typeof import("fs").promises.readFile>;
    mockWriteFile: jest.MockedFunction<typeof import("fs").promises.writeFile>;
    mockRename: jest.MockedFunction<typeof import("fs").promises.rename>;
    mockExistsSync: jest.MockedFunction<typeof import("fs").existsSync>;
  };
};
const mockReadFile = fsModule.__mocks?.mockReadFile || jest.fn();
const mockWriteFile = fsModule.__mocks?.mockWriteFile || jest.fn();
const mockRename = fsModule.__mocks?.mockRename || jest.fn();
const mockExistsSync = fsModule.__mocks?.mockExistsSync || jest.fn();

describe("patchApplier", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("should validate patch plan before applying", async () => {
    const plan: PatchPlan = {
      operations: [
        {
          type: "replaceText",
          filePath: "nonexistent.ts",
          search: "old code",
          replace: "new code",
        },
      ],
      description: "Test patch",
      rationale: "Test",
    };

    mockExistsSync.mockReturnValue(false);

    const result = await applyPatchPlan(plan, false);

    expect(result.success).toBe(false);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("File not found");
  });

  it("should fail when search string not found", async () => {
    const plan: PatchPlan = {
      operations: [
        {
          type: "replaceText",
          filePath: "test.ts",
          search: "nonexistent code",
          replace: "new code",
        },
      ],
      description: "Test patch",
      rationale: "Test",
    };

    mockReadFile.mockResolvedValue("some other code here");

    const result = await applyPatchPlan(plan, false);

    expect(result.success).toBe(false);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not found");
  });

  it("should succeed when search string found", async () => {
    const plan: PatchPlan = {
      operations: [
        {
          type: "replaceText",
          filePath: "test.ts",
          search: "old code",
          replace: "new code",
        },
      ],
      description: "Test patch",
      rationale: "Test",
    };

    mockReadFile.mockResolvedValue("old code here");
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    const result = await applyPatchPlan(plan, false);

    expect(result.success).toBe(true);
    expect(result.results[0].success).toBe(true);
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("should preview changes in preview mode", async () => {
    const plan: PatchPlan = {
      operations: [
        {
          type: "replaceText",
          filePath: "test.ts",
          search: "old code",
          replace: "new code",
        },
      ],
      description: "Test patch",
      rationale: "Test",
    };

    mockReadFile.mockResolvedValue("old code here");

    const result = await applyPatchPlan(plan, true);

    expect(result.success).toBe(true);
    expect(result.results[0].message).toContain("[PREVIEW]");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should fail when anchor not found for insertAfter", async () => {
    const plan: PatchPlan = {
      operations: [
        {
          type: "insertAfter",
          filePath: "test.ts",
          anchor: "nonexistent anchor",
          insert: "new code",
        },
      ],
      description: "Test patch",
      rationale: "Test",
    };

    mockReadFile.mockResolvedValue("some code here");

    const result = await applyPatchPlan(plan, false);

    expect(result.success).toBe(false);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not found");
  });

  it("should fail when anchor found multiple times", async () => {
    const plan: PatchPlan = {
      operations: [
        {
          type: "insertAfter",
          filePath: "test.ts",
          anchor: "duplicate",
          insert: "new code",
        },
      ],
      description: "Test patch",
      rationale: "Test",
    };

    mockReadFile.mockResolvedValue("duplicate\nduplicate");

    const result = await applyPatchPlan(plan, false);

    expect(result.success).toBe(false);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("found 2 times");
  });

  it("when second op fails, rolls back first op and file ends unchanged", async () => {
    const originalContent = "old\nanchor\nline2";
    const afterFirstOp = "new\nanchor\nline2";
    const plan: PatchPlan = {
      operations: [
        { type: "replaceText", filePath: "test.ts", search: "old", replace: "new" },
        { type: "insertAfter", filePath: "test.ts", anchor: "old", insert: "x" },
      ],
      description: "Test",
      rationale: "Test",
    };
    mockReadFile
      .mockResolvedValueOnce(originalContent)
      .mockResolvedValueOnce(originalContent)
      .mockResolvedValueOnce(originalContent)
      .mockResolvedValueOnce(originalContent)
      .mockResolvedValueOnce(afterFirstOp);
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    const result = await applyPatchPlan(plan, false);

    expect(result.success).toBe(false);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.rollbackResults).toBeDefined();
    expect(result.rollbackResults!.length).toBe(1);
    expect(result.rollbackResults![0].success).toBe(true);
    expect(mockWriteFile.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastWrite = mockWriteFile.mock.calls[mockWriteFile.mock.calls.length - 1];
    expect(lastWrite[1]).toBe(originalContent);
  });

  it("fileEdits receives resolved path only (no double resolve)", async () => {
    const plan: PatchPlan = {
      operations: [
        {
          type: "replaceText",
          filePath: "only-here.ts",
          search: "x",
          replace: "y",
        },
      ],
      description: "Test",
      rationale: "Test",
    };
    mockExistsSync.mockImplementation((p: unknown) => {
      const normalized = String(p).replace(/\\/g, "/");
      return normalized.endsWith("tests/only-here.ts");
    });
    mockReadFile.mockResolvedValue("x");
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    const result = await applyPatchPlan(plan, false);

    expect(result.success).toBe(true);
    expect(result.results[0].filePath.replace(/\\/g, "/")).toBe("tests/only-here.ts");
  });
});
