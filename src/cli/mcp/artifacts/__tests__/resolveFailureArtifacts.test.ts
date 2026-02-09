/**
 * Tests for artifact resolution from trace.zip and test-results directories.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { promises as fs } from "fs";
import { existsSync, statSync } from "fs";
import path from "path";
import { resolveFailureArtifacts, resolveFromTraceZip, resolveFromTestResultsDir } from "../resolveFailureArtifacts";
import type { ArtifactIndex } from "../types";

// Mock fs and glob
const mockStatSync = jest.fn();
const mockExistsSync = jest.fn();
const mockReadDir = jest.fn();
const mockGlob = jest.fn();

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: (...args: any[]) => mockExistsSync(...args),
  statSync: (...args: any[]) => mockStatSync(...args),
}));

jest.mock("fs/promises", () => ({
  ...jest.requireActual("fs/promises"),
  readdir: (...args: any[]) => mockReadDir(...args),
}));

jest.mock("fast-glob", () => ({
  glob: (...args: any[]) => mockGlob(...args),
}));

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
      size: 1024,
      mtime: new Date("2024-01-01"),
    });
    mockGlob.mockResolvedValue([]);

    const index = await resolveFromTraceZip(tracePath);

    expect(index.traceZip).toBeDefined();
    expect(index.traceZip?.path).toContain("trace.zip");
    expect(index.traceZip?.sizeBytes).toBe(1024);
    expect(index.sourcePaths).toContain(tracePath);
  });

  it("should handle missing trace.zip", async () => {
    const tracePath = "/nonexistent/trace.zip";
    
    mockExistsSync.mockReturnValue(false);

    const index = await resolveFromTraceZip(tracePath);

    expect(index.traceZip).toBeUndefined();
    expect(index.notes).toContain("Trace ZIP not found");
  });

  it("should resolve from test-results directory", async () => {
    const testResultsDir = "/test-results";
    const tracePath = "/test-results/test-123/trace.zip";
    
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockImplementation((p: string) => {
      if (p === testResultsDir) {
        return { isDirectory: () => true, isFile: () => false };
      }
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: 2048,
        mtime: new Date("2024-01-01"),
      };
    });
    mockGlob.mockImplementation((pattern: string) => {
      if (pattern.includes("trace.zip")) {
        return Promise.resolve([tracePath]);
      }
      return Promise.resolve([]);
    });

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
      size: 1024,
      mtime: new Date("2024-01-01"),
    });
    mockGlob.mockImplementation((pattern: string) => {
      if (pattern.includes("*.png")) {
        return Promise.resolve([screenshotPath]);
      }
      return Promise.resolve([]);
    });

    const index = await resolveFromTraceZip(tracePath);

    const screenshots = index.attachments.filter((a) => a.kind === "screenshot");
    expect(screenshots.length).toBeGreaterThan(0);
    expect(screenshots[0].path).toContain("screenshot.png");
  });

  it("should find videos in directory", async () => {
    const tracePath = "/test-results/test-123/trace.zip";
    const videoPath = "/test-results/test-123/video.webm";
    
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      size: 1024,
      mtime: new Date("2024-01-01"),
    });
    mockGlob.mockImplementation((pattern: string) => {
      if (pattern.includes("*.webm")) {
        return Promise.resolve([videoPath]);
      }
      return Promise.resolve([]);
    });

    const index = await resolveFromTraceZip(tracePath);

    const videos = index.attachments.filter((a) => a.kind === "video");
    expect(videos.length).toBeGreaterThan(0);
    expect(videos[0].path).toContain("video.webm");
  });

  it("should find log files in directory", async () => {
    const tracePath = "/test-results/test-123/trace.zip";
    const logPath = "/test-results/test-123/error-context.md";
    
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      size: 1024,
      mtime: new Date("2024-01-01"),
    });
    mockGlob.mockImplementation((pattern: string) => {
      if (pattern.includes("error-context.md")) {
        return Promise.resolve([logPath]);
      }
      return Promise.resolve([]);
    });

    const index = await resolveFromTraceZip(tracePath);

    const logs = index.attachments.filter((a) => a.kind === "log");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].path).toContain("error-context.md");
  });

  it("should handle missing test-results directory", async () => {
    const testResultsDir = "/nonexistent";
    
    mockExistsSync.mockReturnValue(false);

    const index = await resolveFromTestResultsDir(testResultsDir);

    expect(index.traceZip).toBeUndefined();
    expect(index.notes).toContain("Test results directory not found");
  });
});
