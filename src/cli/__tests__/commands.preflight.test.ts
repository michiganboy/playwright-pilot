/**
 * Tests for CLI preflight command (readiness verification).
 * 
 * Preflight is a READINESS CHECK that:
 * 1. Runs inspections (feature config, directories, fixtures, exports)
 * 2. Runs checklist items that verify framework correctness
 * 3. Fails immediately if any item fails
 * 4. Grants clearance for takeoff if all items pass
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import type { SpawnSyncOptions } from "child_process";
import { existsSync, rmSync } from "fs";
import { join } from "path";

// Mock dependencies before imports
const fileOpsMock = {
  readFileSafe: jest.fn(),
  readJsonSafe: jest.fn(),
  fileExists: jest.fn(),
  dirExists: jest.fn(),
};

const featureConfigMock = {
  getSuiteIds: jest.fn(),
  hasSuiteId: jest.fn(),
};

const globMock = jest.fn();

jest.mock("../utils/fileOps", () => fileOpsMock);
jest.mock("../../utils/featureConfig", () => featureConfigMock);
jest.mock("fast-glob", () => ({
  glob: globMock,
}));

// Import after mocks are set up
import {
  runPreflight,
  PREFLIGHT_CHECKLIST,
  setChecklistExecutor,
  resetChecklistExecutor,
} from "../commands/preflight";
import { REPO_ROOT } from "../utils/paths";

describe("CLI Commands - Preflight Tests", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[];
  let checklistCalls: Array<{ command: string; options: SpawnSyncOptions }>;
  let mockChecklistExecutor: jest.Mock<(command: string, options: SpawnSyncOptions) => { stdout: string; stderr: string; exitCode: number | null }>;

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(" "));
    });
    console.error = jest.fn((...args) => {
      consoleOutput.push(args.join(" "));
    });

    // Reset all mocks
    fileOpsMock.readFileSafe.mockReset();
    fileOpsMock.readJsonSafe.mockReset();
    fileOpsMock.fileExists.mockReset();
    fileOpsMock.dirExists.mockReset();
    featureConfigMock.getSuiteIds.mockReset();
    featureConfigMock.hasSuiteId.mockReset();
    globMock.mockReset();

    // Track checklist calls
    checklistCalls = [];
    mockChecklistExecutor = jest.fn<(command: string, options: SpawnSyncOptions) => { stdout: string; stderr: string; exitCode: number | null }>()
      .mockImplementation((command, options) => {
        checklistCalls.push({ command, options });
        return { stdout: "PASS test\n", stderr: "", exitCode: 0 };
      });

    // Set mock executor
    setChecklistExecutor(mockChecklistExecutor);

    // Default mocks for inspections (make them pass)
    (fileOpsMock.readJsonSafe as any).mockResolvedValue({
      "test-feature": {
        tag: "@test-feature",
        planId: 123,
        suites: { "1001": "Test Suite" },
      },
    });
    (fileOpsMock.readFileSafe as any).mockResolvedValue(
      'import { TestPage } from "./pages/test/TestPage";\n' +
      "type Fixtures = { testPage: TestPage; };\n" +
      "testPage: async ({ page }, use) => {}"
    );
    (fileOpsMock.dirExists as any).mockReturnValue(true);
    (featureConfigMock.getSuiteIds as any).mockReturnValue([1001]);
    (globMock as any).mockResolvedValue([]);
  });

  afterEach(() => {
    // Reset executor to default
    resetChecklistExecutor();
    jest.clearAllMocks();
    // Note: We intentionally do NOT clean up .pilot/preflight here.
    // Deleting that directory can corrupt log files from parent processes
    // when these tests run as part of `pilot preflight`.
  });

  afterAll(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe("PREFLIGHT_CHECKLIST configuration", () => {
    it("should define all required checklist items", () => {
      expect(PREFLIGHT_CHECKLIST).toHaveLength(8);

      // Verify item names
      expect(PREFLIGHT_CHECKLIST[0].name).toBe("CLI and unit integrity");
      expect(PREFLIGHT_CHECKLIST[1].name).toBe("Suite command verification");
      expect(PREFLIGHT_CHECKLIST[2].name).toBe("Namespace enforcement");
      expect(PREFLIGHT_CHECKLIST[3].name).toBe("RunState lifecycle");
      expect(PREFLIGHT_CHECKLIST[4].name).toBe("Last-run metadata");
      expect(PREFLIGHT_CHECKLIST[5].name).toBe("TOOLS defaults");
      expect(PREFLIGHT_CHECKLIST[6].name).toBe("TOOLS surface");
      expect(PREFLIGHT_CHECKLIST[7].name).toBe("Parallel determinism and collision stress");
    });

    it("should have correct commands for each item", () => {
      expect(PREFLIGHT_CHECKLIST[0].command).toBe("npm run test:cli -- --runInBand --verbose");
      expect(PREFLIGHT_CHECKLIST[1].command).toContain("commands.suite.test.ts");
      expect(PREFLIGHT_CHECKLIST[2].command).toContain("namespace-enforcement.test.ts");
      expect(PREFLIGHT_CHECKLIST[3].command).toContain("runstate-lifecycle.test.ts");
      expect(PREFLIGHT_CHECKLIST[4].command).toContain("last-run-metadata.test.ts");
      expect(PREFLIGHT_CHECKLIST[5].command).toContain('--grep="TOOLS-001"');
      expect(PREFLIGHT_CHECKLIST[6].command).toContain('--grep="TOOLS-002"');
      expect(PREFLIGHT_CHECKLIST[7].command).toContain('--grep="TOOLS-003-WRITE|TOOLS-003-COLLECT"');
    });

    it("should configure TOOLS items with correct env vars", () => {
      // TOOLS defaults
      expect(PREFLIGHT_CHECKLIST[5].env).toBeDefined();
      expect(PREFLIGHT_CHECKLIST[5].env!.PILOT_SEED).toBe("12345");
      expect(PREFLIGHT_CHECKLIST[5].env!.PILOT_KEEP_RUNSTATE).toBe("true");

      // TOOLS surface
      expect(PREFLIGHT_CHECKLIST[6].env).toBeDefined();
      expect(PREFLIGHT_CHECKLIST[6].env!.PILOT_SEED).toBe("12345");
      expect(PREFLIGHT_CHECKLIST[6].env!.PILOT_KEEP_RUNSTATE).toBe("true");

      // Parallel determinism with workers=4
      expect(PREFLIGHT_CHECKLIST[7].env).toBeDefined();
      expect(PREFLIGHT_CHECKLIST[7].env!.PILOT_SEED).toBe("12345");
      expect(PREFLIGHT_CHECKLIST[7].env!.PILOT_KEEP_RUNSTATE).toBe("true");
      expect(PREFLIGHT_CHECKLIST[7].command).toContain("--workers=4");
    });
  });

  describe("runPreflight", () => {
    it("should run inspections before checklist", async () => {
      await runPreflight();

      expect(fileOpsMock.readJsonSafe).toHaveBeenCalled();
      expect(mockChecklistExecutor).toHaveBeenCalled();
    });

    it("should run all checklist items and capture output", async () => {
      await runPreflight();

      // All 8 items should be executed
      expect(mockChecklistExecutor).toHaveBeenCalledTimes(8);
    });

    it("should NOT print raw test output", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      // Should not contain raw Jest output
      expect(output).not.toContain("PASS  src/");
      expect(output).not.toContain("PASS test");
    });

    it("should print a summary line per item with status indicator", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      // Should contain item progress indicators
      expect(output).toContain("[1/8]");
      expect(output).toContain("[8/8]");
      // Should contain VERIFIED status (not emojis)
      expect(output).toContain("VERIFIED");
    });

    it("should not use emojis in output", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      // Should NOT contain emojis
      expect(output).not.toContain("✅");
      expect(output).not.toContain("❌");
      expect(output).not.toContain("🔍");
      expect(output).not.toContain("📊");
      expect(output).not.toContain("🧪");
      expect(output).not.toContain("✈️");
      expect(output).not.toContain("💡");
      expect(output).not.toContain("📄");
    });

    it("should create a flight log file in the expected directory", async () => {
      await runPreflight();

      const logDir = join(REPO_ROOT, ".pilot", "preflight");
      expect(existsSync(logDir)).toBe(true);

      // Find the log file
      const files = require("fs").readdirSync(logDir);
      const logFiles = files.filter((f: string) => f.startsWith("preflight-") && f.endsWith(".log"));
      expect(logFiles.length).toBeGreaterThan(0);
    });

    it("should print CLEAR FOR TAKEOFF on success", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("CLEAR FOR TAKEOFF");
    });

    it("should print duration and item count on success", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("8/8 verified");
      expect(output).toMatch(/Duration:/);
    });

    it("should return true when all items pass", async () => {
      const result = await runPreflight();
      expect(result).toBe(true);
    });

    it("should stop immediately if an item fails", async () => {
      mockChecklistExecutor.mockImplementation((command) => {
        checklistCalls.push({ command, options: {} as SpawnSyncOptions });
        if (command.includes("namespace-enforcement")) {
          return { stdout: "FAIL test\n", stderr: "Error details", exitCode: 1 };
        }
        return { stdout: "PASS test\n", stderr: "", exitCode: 0 };
      });

      const result = await runPreflight();
      expect(result).toBe(false);
      expect(mockChecklistExecutor).toHaveBeenCalledTimes(3);
    });

    it("should print NOT CLEARED FOR TAKEOFF on failure", async () => {
      mockChecklistExecutor.mockImplementation((command) => {
        checklistCalls.push({ command, options: {} as SpawnSyncOptions });
        return { stdout: "", stderr: "Error!", exitCode: 1 };
      });

      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("NOT CLEARED FOR TAKEOFF");
      expect(output).not.toContain("CLEAR FOR TAKEOFF");
    });

    it("should return false on failure", async () => {
      mockChecklistExecutor.mockImplementation(() => {
        return { stdout: "", stderr: "Error!", exitCode: 1 };
      });

      const result = await runPreflight();
      expect(result).toBe(false);
    });

    it("should fail if inspections have errors", async () => {
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "bad-feature": {
          tag: "no-at-sign",
          planId: 123,
          suites: { "1001": "Test" },
        },
      });

      const result = await runPreflight();
      expect(result).toBe(false);
      expect(mockChecklistExecutor).not.toHaveBeenCalled();
    });
  });

  describe("failure output", () => {
    it("should print tail output on failure", async () => {
      const longOutput = Array(100).fill("line of output").join("\n");
      mockChecklistExecutor.mockImplementation((command) => {
        checklistCalls.push({ command, options: {} as SpawnSyncOptions });
        if (command.includes("TOOLS-001")) {
          return { stdout: longOutput, stderr: "Error!", exitCode: 1 };
        }
        return { stdout: "PASS\n", stderr: "", exitCode: 0 };
      });

      await runPreflight();

      const output = consoleOutput.join("\n");
      // Should contain truncation notice
      expect(output).toContain("truncated");
    });

    it("should include flight log path in failure output", async () => {
      mockChecklistExecutor.mockImplementation((command) => {
        checklistCalls.push({ command, options: {} as SpawnSyncOptions });
        return { stdout: "", stderr: "Error!", exitCode: 1 };
      });

      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain(".pilot");
      expect(output).toContain("preflight");
      expect(output).toContain(".log");
    });

    it("should use Flight log terminology", async () => {
      mockChecklistExecutor.mockImplementation(() => {
        return { stdout: "", stderr: "Error!", exitCode: 1 };
      });

      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("Flight log:");
    });
  });

  describe("console output format", () => {
    it("should print PILOT PREFLIGHT header", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("PILOT PREFLIGHT");
    });

    it("should print INSPECTIONS section", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("INSPECTIONS");
    });

    it("should print CHECKLIST section", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("CHECKLIST");
    });

    it("should print separator lines", async () => {
      await runPreflight();

      const output = consoleOutput.join("\n");
      // Should contain line separators
      expect(output).toContain("\u2500".repeat(70));
    });
  });

  describe("error handling", () => {
    it("should provide human-readable item failure information", async () => {
      let callCount = 0;
      mockChecklistExecutor.mockImplementation((command) => {
        callCount++;
        checklistCalls.push({ command, options: {} as SpawnSyncOptions });
        if (callCount === 4) {
          return { stdout: "", stderr: "runstate test failed", exitCode: 1 };
        }
        return { stdout: "PASS\n", stderr: "", exitCode: 0 };
      });

      await runPreflight();

      const output = consoleOutput.join("\n");
      expect(output).toContain("ITEM FAILED");
      expect(output).toContain("RunState lifecycle");
    });
  });
});
