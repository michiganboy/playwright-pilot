/**
 * Tests for target file resolution.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { resolveTargetFile } from "../../../../mcp/heal/patch/resolveTargetFile";
import { existsSync } from "fs";
import { REPO_ROOT } from "../../../../utils/paths";
import path from "path";

// Mock fs - use factory pattern to avoid hoisting issues
jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs") as Record<string, unknown>;
  const mockExistsSync = jest.fn();
  return {
    ...actualFs,
    existsSync: mockExistsSync,
    __mockExistsSync: mockExistsSync,
  };
});

// Get mock from the mocked module
const fsModule = jest.requireMock("fs") as typeof import("fs") & {
  __mockExistsSync?: jest.MockedFunction<typeof import("fs").existsSync>;
};
const mockExistsSync = fsModule.__mockExistsSync || jest.fn();

describe("resolveTargetFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should resolve path that exists as provided", () => {
    mockExistsSync.mockImplementation((filePath: import("fs").PathLike) => {
      const pathStr = String(filePath);
      // resolveTargetFile joins REPO_ROOT with filePath
      const expectedPath = path.join(REPO_ROOT, "tests/login-page/test.spec.ts");
      return pathStr === expectedPath || pathStr.includes("tests/login-page/test.spec.ts");
    });

    const result = resolveTargetFile("tests/login-page/test.spec.ts");

    expect(result.success).toBe(true);
    expect(result.resolvedPath).toBe("tests/login-page/test.spec.ts");
  });

  it("should resolve path relative to tests/ directory", () => {
    mockExistsSync.mockImplementation((filePath: import("fs").PathLike) => {
      const pathStr = String(filePath);
      // First check (as provided) - resolveTargetFile joins REPO_ROOT with filePath
      const providedPath = path.join(REPO_ROOT, "login-page/test.spec.ts");
      if (pathStr === providedPath) {
        return false; // First check fails
      }
      // Second check (tests/login-page/test.spec.ts) succeeds
      const testsPath = path.join(REPO_ROOT, "tests/login-page/test.spec.ts");
      return pathStr === testsPath;
    });

    const result = resolveTargetFile("login-page/test.spec.ts");

    expect(result.success).toBe(true);
    // path.join uses platform-specific separators, normalize for comparison
    expect(result.resolvedPath.replace(/\\/g, "/")).toBe("tests/login-page/test.spec.ts");
  });

  it("should fail when file does not exist in either location", () => {
    mockExistsSync.mockReturnValue(false);

    const result = resolveTargetFile("nonexistent/file.spec.ts");

    expect(result.success).toBe(false);
    expect(result.error).toContain("File not found");
    expect(result.error).toContain("nonexistent/file.spec.ts");
    // path.join uses platform-specific separators, normalize for comparison
    expect(result.error?.replace(/\\/g, "/")).toContain("tests/nonexistent/file.spec.ts");
  });

  it("should handle paths with subdirectories", () => {
    mockExistsSync.mockImplementation((filePath: import("fs").PathLike) => {
      const pathStr = String(filePath);
      // First check (as provided) fails, second check (tests/feature/sub/test.spec.ts) succeeds
      const providedPath = path.join(REPO_ROOT, "feature/sub/test.spec.ts");
      if (pathStr === providedPath) {
        return false; // First check fails
      }
      const testsPath = path.join(REPO_ROOT, "tests/feature/sub/test.spec.ts");
      return pathStr === testsPath;
    });

    const result = resolveTargetFile("feature/sub/test.spec.ts");

    expect(result.success).toBe(true);
    // path.join uses platform-specific separators, normalize for comparison
    expect(result.resolvedPath.replace(/\\/g, "/")).toBe("tests/feature/sub/test.spec.ts");
  });
});
