/**
 * Tests for artifact resolution from trace.zip and test-results directories.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { resolveFromTraceZip, resolveFromTestResultsDir } from "../../../mcp/artifacts/resolveFailureArtifacts";
import type { ArtifactIndex } from "../../../mcp/artifacts/types";

// Mock fs and glob - use factory pattern to avoid hoisting issues
jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs") as Record<string, unknown>;
  const mockStatSync = jest.fn() as unknown as jest.MockedFunction<typeof import("fs").statSync>;
  const mockExistsSync = jest.fn() as unknown as jest.MockedFunction<typeof import("fs").existsSync>;
  return {
    ...actualFs,
    existsSync: mockExistsSync,
    statSync: mockStatSync,
    __mocks: {
      mockStatSync,
      mockExistsSync,
    },
  };
});

jest.mock("fast-glob", () => {
  const mockGlob = jest.fn() as unknown as jest.MockedFunction<typeof import("fast-glob").glob>;
  return {
    glob: mockGlob,
    __mockGlob: mockGlob,
  };
});

// Get mocks from the mocked modules
const fsModule = jest.requireMock("fs") as typeof import("fs") & {
  __mocks?: {
    mockStatSync: jest.MockedFunction<typeof import("fs").statSync>;
    mockExistsSync: jest.MockedFunction<typeof import("fs").existsSync>;
  };
};
const globModule = jest.requireMock("fast-glob") as typeof import("fast-glob") & {
  __mockGlob?: jest.MockedFunction<typeof import("fast-glob").glob>;
};
const mockStatSync = fsModule.__mocks?.mockStatSync || jest.fn();
const mockExistsSync = fsModule.__mocks?.mockExistsSync || jest.fn();
const mockGlob = globModule.__mockGlob || jest.fn();

describe("resolveFailureArtifacts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should resolve from trace.zip path", async () => {
    const tracePath = "/test-results/test-123/trace.zip";
    
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      size: BigInt(1024),
      mtime: new Date("2024-01-01"),
    } as unknown as import("fs").Stats);
    mockGlob.mockResolvedValue([]);

    const index = await resolveFromTraceZip(tracePath);

    expect(index.traceZip).toBeDefined();
    expect(index.traceZip?.path).toContain("trace.zip");
    // sizeBytes is converted from BigInt to number in the implementation
    expect(Number(index.traceZip?.sizeBytes)).toBe(1024);
    expect(index.sourcePaths).toContain(tracePath);
  });

  it("should handle missing trace.zip", async () => {
    const tracePath = "/nonexistent/trace.zip";
    
    mockExistsSync.mockReturnValue(false);

    const index = await resolveFromTraceZip(tracePath);

    expect(index.traceZip).toBeUndefined();
    expect(index.notes.some(note => note.includes("Trace ZIP not found"))).toBe(true);
  });

  it("should resolve from test-results directory", async () => {
    const testResultsDir = "/test-results";
    const tracePath = "/test-results/test-123/trace.zip";
    
    mockExistsSync.mockReturnValue(true);
    (mockStatSync as unknown as jest.MockedFunction<(path: import("fs").PathLike) => import("fs").Stats>).mockImplementation((p: import("fs").PathLike) => {
      const pathStr = String(p);
      if (pathStr === testResultsDir) {
        return { isDirectory: () => true, isFile: () => false } as unknown as import("fs").Stats;
      }
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: BigInt(2048),
        mtime: new Date("2024-01-01"),
      } as unknown as import("fs").Stats;
    });
    mockGlob.mockResolvedValue([tracePath]);

    const index = await resolveFromTestResultsDir(testResultsDir);

    expect(index.traceZip).toBeDefined();
    expect(index.sourcePaths).toContain(testResultsDir);
  });

  it("should find screenshots in directory", async () => {
    const tracePath = "/test-results/test-123/trace.zip";
    const screenshotPath = "/test-results/test-123/screenshot.png";
    
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      size: BigInt(1024),
      mtime: new Date("2024-01-01"),
    } as unknown as import("fs").Stats);
    mockGlob.mockResolvedValue([screenshotPath]);

    const index = await resolveFromTraceZip(tracePath);

    const screenshots = index.attachments.filter((a) => a.kind === "screenshot");
    expect(screenshots.length).toBeGreaterThan(0);
    expect(screenshots[0].path).toContain("screenshot.png");
  });
});
