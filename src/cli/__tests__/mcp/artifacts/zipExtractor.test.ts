/**
 * Tests for ZIP extraction.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { extractTraceZip, getExtractionDir } from "../../../mcp/artifacts/zipExtractor";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { tmpdir } from "os";

describe("zipExtractor", () => {
  let testDir: string;
  let testZipPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create a test ZIP file
    testZipPath = path.join(testDir, "test.zip");
    const zip = new AdmZip();
    zip.addFile("test.txt", Buffer.from("test content"));
    zip.addFile("nested/file.txt", Buffer.from("nested content"));
    zip.writeZip(testZipPath);
  });

  afterEach(async () => {
    // Cleanup
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it("should extract ZIP file to destination directory", async () => {
    const extractDir = path.join(testDir, "extracted");
    const result = await extractTraceZip(testZipPath, extractDir);

    expect(result.success).toBe(true);
    expect(result.extractedFiles.length).toBeGreaterThan(0);

    // Verify files were extracted
    const testFile = path.join(extractDir, "test.txt");
    const nestedFile = path.join(extractDir, "nested", "file.txt");

    expect(existsSync(testFile)).toBe(true);
    expect(existsSync(nestedFile)).toBe(true);

    const testContent = await fs.readFile(testFile, "utf-8");
    expect(testContent).toBe("test content");
  });

  it("should prevent zip-slip attacks", async () => {
    // Create a malicious ZIP with path traversal
    const maliciousZipPath = path.join(testDir, "malicious.zip");
    const zip = new AdmZip();
    zip.addFile("../../outside.txt", Buffer.from("malicious"));
    zip.writeZip(maliciousZipPath);

    const extractDir = path.join(testDir, "extracted");
    const result = await extractTraceZip(maliciousZipPath, extractDir);

    // Should still succeed but skip malicious entries
    expect(result.success).toBe(true);

    // Verify malicious file was not extracted outside
    const outsideFile = path.join(testDir, "..", "outside.txt");
    expect(existsSync(outsideFile)).toBe(false);
  });

  it("should return error if ZIP file does not exist", async () => {
    const extractDir = path.join(testDir, "extracted");
    const result = await extractTraceZip(path.join(testDir, "nonexistent.zip"), extractDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should clean destination directory before extraction", async () => {
    const extractDir = path.join(testDir, "extracted");
    await fs.mkdir(extractDir, { recursive: true });
    
    // Create existing file
    const existingFile = path.join(extractDir, "existing.txt");
    await fs.writeFile(existingFile, "existing content");

    const result = await extractTraceZip(testZipPath, extractDir);

    expect(result.success).toBe(true);
    // Existing file should be removed
    expect(existsSync(existingFile)).toBe(false);
    // New files should be present
    expect(existsSync(path.join(extractDir, "test.txt"))).toBe(true);
  });

  it("should return extraction directory path", () => {
    const evidenceDir = "/path/to/evidence";
    const extractDir = getExtractionDir(evidenceDir);
    expect(extractDir).toBe(path.join(evidenceDir, "trace-extracted"));
  });
});
