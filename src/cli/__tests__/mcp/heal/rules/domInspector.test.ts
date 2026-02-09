/**
 * Tests for DOM inspector.
 */

import { describe, it, expect } from "@jest/globals";
import { checkSelectorInDOM, extractSelectorFromError } from "../../../../mcp/heal/rules/domInspector";
import type { EvidencePacket } from "../../../../mcp/types";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";

describe("domInspector", () => {
  describe("extractSelectorFromError", () => {
    it("should extract selector from locator error", () => {
      const error = 'Timeout waiting for locator(\'[data-testid="app-ready"]\')';
      const selector = extractSelectorFromError(error);
      expect(selector).toBe('[data-testid="app-ready"]');
    });

    it("should extract selector from waitFor error", () => {
      const error = 'locator.waitFor(\'[data-testid="button"]\')';
      const selector = extractSelectorFromError(error);
      expect(selector).toBe('[data-testid="button"]');
    });

    it("should return null if selector cannot be extracted", () => {
      const error = "Generic timeout error";
      const selector = extractSelectorFromError(error);
      expect(selector).toBeNull();
    });
  });

  describe("checkSelectorInDOM", () => {
    it("should return not-exists when no extracted trace directory", async () => {
      const evidence: EvidencePacket = {
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
      };

      const result = await checkSelectorInDOM('[data-testid="test"]', evidence);
      expect(result.status).toBe("not-exists");
      expect(result.snapshotsRead).toBe(0);
      expect(result.snapshotsScanned).toBe(0);
    });

    it("should throw error when trace extracted but 0 snapshots read", async () => {
      const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
      const extractDir = path.join(testDir, "trace-extracted");
      await fs.mkdir(extractDir, { recursive: true });

      // Create directory with no HTML files
      await fs.writeFile(path.join(extractDir, "trace.txt"), "not html content");

      const evidence: EvidencePacket = {
        traces: [],
        screenshots: [],
        reproSteps: [],
        expected: "Test passes",
        actual: "Test failed",
        collectionMetadata: {
          collectedAt: new Date().toISOString(),
          sourcePaths: [testDir],
          indexingNotes: [],
          traceExtracted: true,
          extractedTraceDir: extractDir,
          attachmentCounts: {
            screenshots: 0,
            videos: 0,
            logs: 0,
            other: 0,
          },
        },
      };

      await expect(checkSelectorInDOM('[data-testid="test"]', evidence)).rejects.toThrow(
        "DOM inspection failed: 0 DOM snapshots read from extracted trace"
      );

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it("should return exists when selector found in HTML", async () => {
      const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
      const extractDir = path.join(testDir, "trace-extracted");
      await fs.mkdir(extractDir, { recursive: true });

      // Create HTML file with selector
      const htmlFile = path.join(extractDir, "page@123.html");
      await fs.writeFile(
        htmlFile,
        '<div data-testid="app-ready">Content</div>'
      );

      const evidence: EvidencePacket = {
        traces: [],
        screenshots: [],
        reproSteps: [],
        expected: "Test passes",
        actual: "Test failed",
        collectionMetadata: {
          collectedAt: new Date().toISOString(),
          sourcePaths: [testDir],
          indexingNotes: [],
          traceExtracted: true,
          extractedTraceDir: extractDir,
          attachmentCounts: {
            screenshots: 0,
            videos: 0,
            logs: 0,
            other: 0,
          },
        },
      };

      const result = await checkSelectorInDOM('[data-testid="app-ready"]', evidence);
      expect(result.status).toBe("exists");
      expect(result.snapshotsRead).toBeGreaterThan(0);
      expect(result.snapshotsScanned).toBeGreaterThan(0);

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it("should return not-exists when selector not found in HTML", async () => {
      const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
      const extractDir = path.join(testDir, "trace-extracted");
      await fs.mkdir(extractDir, { recursive: true });

      // Create HTML file without selector
      const htmlFile = path.join(extractDir, "page@123.html");
      await fs.writeFile(htmlFile, '<div>No test id here</div>');

      const evidence: EvidencePacket = {
        traces: [],
        screenshots: [],
        reproSteps: [],
        expected: "Test passes",
        actual: "Test failed",
        collectionMetadata: {
          collectedAt: new Date().toISOString(),
          sourcePaths: [testDir],
          indexingNotes: [],
          traceExtracted: true,
          extractedTraceDir: extractDir,
          attachmentCounts: {
            screenshots: 0,
            videos: 0,
            logs: 0,
            other: 0,
          },
        },
      };

      const result = await checkSelectorInDOM('[data-testid="app-ready"]', evidence);
      expect(result.status).toBe("not-exists");
      expect(result.snapshotsRead).toBeGreaterThan(0); // Must have read snapshots
      expect(result.snapshotsScanned).toBeGreaterThan(0);

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it("should check ID selectors", async () => {
      const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
      const extractDir = path.join(testDir, "trace-extracted");
      await fs.mkdir(extractDir, { recursive: true });

      const htmlFile = path.join(extractDir, "page@123.html");
      await fs.writeFile(htmlFile, '<div id="my-button">Click me</div>');

      const evidence: EvidencePacket = {
        traces: [],
        screenshots: [],
        reproSteps: [],
        expected: "Test passes",
        actual: "Test failed",
        collectionMetadata: {
          collectedAt: new Date().toISOString(),
          sourcePaths: [testDir],
          indexingNotes: [],
          traceExtracted: true,
          extractedTraceDir: extractDir,
          attachmentCounts: {
            screenshots: 0,
            videos: 0,
            logs: 0,
            other: 0,
          },
        },
      };

      const result = await checkSelectorInDOM("#my-button", evidence);
      expect(result.status).toBe("exists");
      expect(result.snapshotsRead).toBeGreaterThan(0);

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it("should check class selectors with word boundaries", async () => {
      const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
      const extractDir = path.join(testDir, "trace-extracted");
      await fs.mkdir(extractDir, { recursive: true });

      const htmlFile = path.join(extractDir, "page@123.html");
      await fs.writeFile(htmlFile, '<div class="button primary">Click</div>');

      const evidence: EvidencePacket = {
        traces: [],
        screenshots: [],
        reproSteps: [],
        expected: "Test passes",
        actual: "Test failed",
        collectionMetadata: {
          collectedAt: new Date().toISOString(),
          sourcePaths: [testDir],
          indexingNotes: [],
          traceExtracted: true,
          extractedTraceDir: extractDir,
          attachmentCounts: {
            screenshots: 0,
            videos: 0,
            logs: 0,
            other: 0,
          },
        },
      };

      const result = await checkSelectorInDOM(".button", evidence);
      expect(result.status).toBe("exists");

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true });
    });
  });
});
