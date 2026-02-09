/**
 * Tests for locator timeout rule.
 */

import { describe, it, expect } from "@jest/globals";
import { matchLocatorTimeout } from "../../../../mcp/heal/rules/locatorTimeoutRule";
import type { FailureContext, EvidencePacket } from "../../../../mcp/types";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";

describe("locatorTimeoutRule", () => {
  const createMockContext = (errorMessage: string, stackTrace?: string): FailureContext => ({
    testId: "test-123",
    testFile: "tests/example.spec.ts",
    testTitle: "Example test",
    errorMessage,
    stackTrace: stackTrace || `Error: ${errorMessage}\n    at test (example.spec.ts:10:5)`,
    tracePath: "/test-results/trace.zip",
    featureKey: "example",
  });

  const createMockEvidence = (extractedDir?: string, actual?: string): EvidencePacket => ({
    traces: [],
    screenshots: [],
    reproSteps: [],
    expected: "Test passes",
    actual: actual || "Test failed",
    collectionMetadata: {
      collectedAt: new Date().toISOString(),
      sourcePaths: extractedDir ? [path.dirname(extractedDir)] : [],
      indexingNotes: [],
      traceExtracted: !!extractedDir,
      extractedTraceDir: extractedDir,
      attachmentCounts: {
        screenshots: 0,
        videos: 0,
        logs: 0,
        other: 0,
      },
    },
  });

  it("should match real-world error pattern: Timeout waiting for appReadyIndicator locator", async () => {
    const errorMessage = 'Timeout waiting for appReadyIndicator locator: [data-testid="app-ready"], and failed to detect URL change from login page. locator.waitFor: Timeout 2000ms exceeded. Call log: - waiting for locator(\'[data-testid="app-ready"]\') to be visible';
    const stackTrace = `Error: ${errorMessage}\n    at AutoPilot.waitForAppReady (src/utils/autoPilot.ts:163:15)\n    at test (example.spec.ts:10:5)`;
    
    const context = createMockContext(errorMessage, stackTrace);
    const evidence = createMockEvidence(undefined, errorMessage);

    const result = await matchLocatorTimeout(context, evidence);

    expect(result).not.toBeNull();
    if (result && !Array.isArray(result)) {
      expect(result.patchPlan).toBeDefined();
      expect(result.patchPlan?.operations[0].filePath).toBe("src/utils/autoPilot.ts");
    }
  });

  it("should extract selector from 'locator: [data-testid=\"app-ready\"]' pattern", async () => {
    const errorMessage = 'Timeout waiting for appReadyIndicator locator: [data-testid="app-ready"]';
    const stackTrace = `Error: ${errorMessage}\n    at AutoPilot.waitForAppReady (src/utils/autoPilot.ts:163:15)`;
    
    const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    const extractDir = path.join(testDir, "trace-extracted");
    await fs.mkdir(extractDir, { recursive: true });

    // Create HTML without the selector
    const htmlFile = path.join(extractDir, "page@123.html");
    await fs.writeFile(htmlFile, '<div>No test id</div>');

    const context = createMockContext(errorMessage, stackTrace);
    const evidence = createMockEvidence(extractDir, errorMessage);

    const result = await matchLocatorTimeout(context, evidence);

    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
    if (result && !Array.isArray(result)) {
      expect(result.patchPlan).toBeDefined();
      expect(result.confidence).toBe(1.0);
      expect(result.patchPlan?.description).toContain("Fix");
      expect(result.patchPlan?.operations[0].filePath).toBe("src/utils/autoPilot.ts");
    }

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should extract selector from 'waiting for locator(\'[data-testid=\"app-ready\"]\')' pattern", async () => {
    const errorMessage = "Call log: - waiting for locator('[data-testid=\"app-ready\"]') to be visible";
    const stackTrace = `Error: Timeout\n    at AutoPilot.waitForAppReady (src/utils/autoPilot.ts:163:15)`;
    
    const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    const extractDir = path.join(testDir, "trace-extracted");
    await fs.mkdir(extractDir, { recursive: true });

    const htmlFile = path.join(extractDir, "page@123.html");
    await fs.writeFile(htmlFile, '<div data-testid="app-ready">Content</div>');

    const context = createMockContext(errorMessage, stackTrace);
    const evidence = createMockEvidence(extractDir, errorMessage);

    const result = await matchLocatorTimeout(context, evidence);

    expect(result).not.toBeNull();
    if (result && !Array.isArray(result)) {
      expect(result.patchPlan).toBeDefined();
      expect(result.confidence).toBe(0.85);
      expect(result.patchPlan?.operations[0].filePath).toBe("src/utils/autoPilot.ts");
    }

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should target autoPilot.ts when stack trace contains autoPilot", async () => {
    const errorMessage = 'Timeout waiting for locator: [data-testid="app-ready"]';
    const stackTrace = `Error: ${errorMessage}\n    at AutoPilot.waitForAppReady (src/utils/autoPilot.ts:163:15)\n    at test (example.spec.ts:10:5)`;
    
    const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    const extractDir = path.join(testDir, "trace-extracted");
    await fs.mkdir(extractDir, { recursive: true });

    const htmlFile = path.join(extractDir, "page@123.html");
    await fs.writeFile(htmlFile, '<div>No test id</div>');

    const context = createMockContext(errorMessage, stackTrace);
    const evidence = createMockEvidence(extractDir, errorMessage);

    const result = await matchLocatorTimeout(context, evidence);

    expect(result).not.toBeNull();
    if (result && !Array.isArray(result)) {
      expect(result.patchPlan).toBeDefined();
      const op = result.patchPlan?.operations[0];
      expect(op).toBeDefined();
      expect(op?.filePath).toBe("src/utils/autoPilot.ts");
      // Should target the locators.appReadyIndicator line
      if (op?.type === "replaceText") {
        expect(op.search).toContain("appReadyIndicator");
      } else {
        throw new Error(`Expected replaceText operation, got: ${op?.type}`);
      }
    }

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should create selector-fix patchPlan for autoPilot.ts when selector not found", async () => {
    const errorMessage = 'Timeout waiting for appReadyIndicator locator: [data-testid="app-ready"]';
    const stackTrace = `Error: ${errorMessage}\n    at AutoPilot.waitForAppReady (src/utils/autoPilot.ts:163:15)`;
    
    const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    const extractDir = path.join(testDir, "trace-extracted");
    await fs.mkdir(extractDir, { recursive: true });

    const htmlFile = path.join(extractDir, "page@123.html");
    await fs.writeFile(htmlFile, '<div>No test id</div>');

    const context = createMockContext(errorMessage, stackTrace);
    const evidence = createMockEvidence(extractDir, errorMessage);

    const result = await matchLocatorTimeout(context, evidence);

    expect(result).not.toBeNull();
    if (result && !Array.isArray(result)) {
      expect(result.patchPlan).toBeDefined();
      const op = result.patchPlan?.operations[0];
      expect(op).toBeDefined();
      expect(op?.filePath).toBe("src/utils/autoPilot.ts");
      if (op?.type === "replaceText") {
        expect(op.search).toContain("appReadyIndicator");
        expect(op.replace).toContain("__REPLACE_ME__");
      } else {
        throw new Error(`Expected replaceText operation, got: ${op?.type}`);
      }
      expect(result.patchPlan?.description).toContain("Fix");
    }

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should create wait-condition patchPlan for autoPilot.ts when selector exists", async () => {
    const errorMessage = 'Timeout waiting for appReadyIndicator locator: [data-testid="app-ready"]';
    const stackTrace = `Error: ${errorMessage}\n    at AutoPilot.waitForAppReady (src/utils/autoPilot.ts:163:15)`;
    
    const testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    const extractDir = path.join(testDir, "trace-extracted");
    await fs.mkdir(extractDir, { recursive: true });

    const htmlFile = path.join(extractDir, "page@123.html");
    await fs.writeFile(htmlFile, '<div data-testid="app-ready">Content</div>');

    const context = createMockContext(errorMessage, stackTrace);
    const evidence = createMockEvidence(extractDir, errorMessage);

    const result = await matchLocatorTimeout(context, evidence);

    expect(result).not.toBeNull();
    if (result && !Array.isArray(result)) {
      expect(result.patchPlan).toBeDefined();
      const op = result.patchPlan?.operations[0];
      expect(op).toBeDefined();
      expect(op?.filePath).toBe("src/utils/autoPilot.ts");
      if (op?.type === "replaceText") {
        expect(op.search).toContain("timeout: 2000");
        expect(op.replace).toContain("timeout: 10000");
      } else {
        throw new Error(`Expected replaceText operation, got: ${op?.type}`);
      }
      expect(result.patchPlan?.description).toContain("Increase timeout");
    }

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should return null for non-locator timeout errors", async () => {
    const context = createMockContext("Network error");
    const evidence = createMockEvidence();
    const result = await matchLocatorTimeout(context, evidence);
    expect(result).toBeNull();
  });

  it("should return null when selector cannot be extracted", async () => {
    const context = createMockContext("Timeout error without selector");
    const evidence = createMockEvidence();
    const result = await matchLocatorTimeout(context, evidence);
    expect(result).toBeNull();
  });
});
