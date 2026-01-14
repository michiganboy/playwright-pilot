/**
 * Tests for CLI attendant command (health gate).
 * 
 * Attendant is a HEALTH GATE that:
 * 1. Runs static checks (feature config, directories, fixtures, exports)
 * 2. Runs authoritative test suites that define framework correctness
 * 3. Fails immediately if any step fails
 * 
 * Modes:
 * - Default (quiet): Shows progress indicators, captures output to log file
 * - Verbose (--verbose): Streams full output live
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import type { ExecSyncOptions, SpawnSyncOptions } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";
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
  runAttendant,
  runTestSuites,
  ATTENDANT_TEST_STEPS,
  setCommandExecutor,
  resetCommandExecutor,
  setQuietCommandExecutor,
  resetQuietCommandExecutor,
} from "../commands/attendant";
import { REPO_ROOT } from "../utils/paths";

describe("CLI Commands - Attendant Tests", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[];
  let commandCalls: Array<{ command: string; options: ExecSyncOptions }>;
  let quietCommandCalls: Array<{ command: string; options: SpawnSyncOptions }>;
  let mockExecutor: jest.Mock<(command: string, options: ExecSyncOptions) => void>;
  let mockQuietExecutor: jest.Mock<(command: string, options: SpawnSyncOptions) => { stdout: string; stderr: string; exitCode: number | null }>;

  // Mock process.stdout methods for quiet mode
  const originalClearLine = process.stdout.clearLine;
  const originalCursorTo = process.stdout.cursorTo;

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

    // Mock stdout methods with proper return types
    process.stdout.clearLine = jest.fn(() => true) as typeof process.stdout.clearLine;
    process.stdout.cursorTo = jest.fn(() => true) as typeof process.stdout.cursorTo;

    // Reset all mocks
    fileOpsMock.readFileSafe.mockReset();
    fileOpsMock.readJsonSafe.mockReset();
    fileOpsMock.fileExists.mockReset();
    fileOpsMock.dirExists.mockReset();
    featureConfigMock.getSuiteIds.mockReset();
    featureConfigMock.hasSuiteId.mockReset();
    globMock.mockReset();

    // Track command calls (verbose mode)
    commandCalls = [];
    mockExecutor = jest.fn<(command: string, options: ExecSyncOptions) => void>()
      .mockImplementation((command, options) => {
        commandCalls.push({ command, options });
      });

    // Track quiet command calls
    quietCommandCalls = [];
    mockQuietExecutor = jest.fn<(command: string, options: SpawnSyncOptions) => { stdout: string; stderr: string; exitCode: number | null }>()
      .mockImplementation((command, options) => {
        quietCommandCalls.push({ command, options });
        return { stdout: "PASS test\n", stderr: "", exitCode: 0 };
      });

    // Set mock executors
    setCommandExecutor(mockExecutor);
    setQuietCommandExecutor(mockQuietExecutor);

    // Default mocks for static checks (make them pass)
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
    // Reset executors to default
    resetCommandExecutor();
    resetQuietCommandExecutor();
    jest.clearAllMocks();

    // Restore stdout methods
    process.stdout.clearLine = originalClearLine;
    process.stdout.cursorTo = originalCursorTo;

    // Clean up any created log files
    const logDir = join(REPO_ROOT, ".pilot", "attendant");
    if (existsSync(logDir)) {
      try {
        rmSync(logDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  });

  afterAll(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe("ATTENDANT_TEST_STEPS configuration", () => {
    it("should define all required test steps", () => {
      expect(ATTENDANT_TEST_STEPS).toHaveLength(8);

      // Verify step names
      expect(ATTENDANT_TEST_STEPS[0].name).toBe("Full CLI + unit suite");
      expect(ATTENDANT_TEST_STEPS[1].name).toBe("Suite command tests");
      expect(ATTENDANT_TEST_STEPS[2].name).toBe("Namespace enforcement tests");
      expect(ATTENDANT_TEST_STEPS[3].name).toBe("RunState lifecycle tests");
      expect(ATTENDANT_TEST_STEPS[4].name).toBe("Last-run metadata tests");
      expect(ATTENDANT_TEST_STEPS[5].name).toBe("TOOLS-001 user defaults");
      expect(ATTENDANT_TEST_STEPS[6].name).toBe("TOOLS-002 tools surface");
      expect(ATTENDANT_TEST_STEPS[7].name).toBe("TOOLS-003 parallel determinism + collision stress");
    });

    it("should have correct commands for each step", () => {
      expect(ATTENDANT_TEST_STEPS[0].command).toBe("npm run test:cli -- --runInBand --verbose");
      expect(ATTENDANT_TEST_STEPS[1].command).toContain("commands.suite.test.ts");
      expect(ATTENDANT_TEST_STEPS[2].command).toContain("namespace-enforcement.test.ts");
      expect(ATTENDANT_TEST_STEPS[3].command).toContain("runstate-lifecycle.test.ts");
      expect(ATTENDANT_TEST_STEPS[4].command).toContain("last-run-metadata.test.ts");
      expect(ATTENDANT_TEST_STEPS[5].command).toContain('--grep="TOOLS-001"');
      expect(ATTENDANT_TEST_STEPS[6].command).toContain('--grep="TOOLS-002"');
      expect(ATTENDANT_TEST_STEPS[7].command).toContain('--grep="TOOLS-003-WRITE|TOOLS-003-COLLECT"');
    });

    it("should configure TOOLS steps with correct env vars", () => {
      // TOOLS-001
      expect(ATTENDANT_TEST_STEPS[5].env).toBeDefined();
      expect(ATTENDANT_TEST_STEPS[5].env!.PILOT_SEED).toBe("12345");
      expect(ATTENDANT_TEST_STEPS[5].env!.PILOT_KEEP_RUNSTATE).toBe("true");

      // TOOLS-002
      expect(ATTENDANT_TEST_STEPS[6].env).toBeDefined();
      expect(ATTENDANT_TEST_STEPS[6].env!.PILOT_SEED).toBe("12345");
      expect(ATTENDANT_TEST_STEPS[6].env!.PILOT_KEEP_RUNSTATE).toBe("true");

      // TOOLS-003 with workers=4
      expect(ATTENDANT_TEST_STEPS[7].env).toBeDefined();
      expect(ATTENDANT_TEST_STEPS[7].env!.PILOT_SEED).toBe("12345");
      expect(ATTENDANT_TEST_STEPS[7].env!.PILOT_KEEP_RUNSTATE).toBe("true");
      expect(ATTENDANT_TEST_STEPS[7].command).toContain("--workers=4");
    });
  });

  describe("runTestSuites - verbose mode", () => {
    it("should run all required commands in correct order", async () => {
      await runTestSuites({ verbose: true });

      expect(mockExecutor).toHaveBeenCalledTimes(8);

      // Verify order
      expect(commandCalls[0].command).toBe("npm run test:cli -- --runInBand --verbose");
      expect(commandCalls[1].command).toContain("commands.suite.test.ts");
      expect(commandCalls[2].command).toContain("namespace-enforcement.test.ts");
      expect(commandCalls[3].command).toContain("runstate-lifecycle.test.ts");
      expect(commandCalls[4].command).toContain("last-run-metadata.test.ts");
      expect(commandCalls[5].command).toContain("TOOLS-001");
      expect(commandCalls[6].command).toContain("TOOLS-002");
      expect(commandCalls[7].command).toContain("TOOLS-003-WRITE|TOOLS-003-COLLECT");
    });

    it("should use stdio inherit for all commands in verbose mode", async () => {
      await runTestSuites({ verbose: true });

      for (const call of commandCalls) {
        expect(call.options.stdio).toBe("inherit");
      }
    });

    it("should stop immediately if a command fails in verbose mode", async () => {
      mockExecutor.mockImplementation((command) => {
        if (command.includes("namespace-enforcement")) {
          throw new Error("Test execution failed");
        }
        commandCalls.push({ command, options: {} as ExecSyncOptions });
      });

      await expect(runTestSuites({ verbose: true })).rejects.toThrow(/Attendant failed at step 3/);
      expect(mockExecutor).toHaveBeenCalledTimes(3);
    });
  });

  describe("runTestSuites - quiet mode (default)", () => {
    it("should run all steps and capture output", async () => {
      await runTestSuites({ verbose: false });

      // All 8 steps should be executed via quiet executor
      expect(mockQuietExecutor).toHaveBeenCalledTimes(8);
    });

    it("should NOT print raw Jest PASS blocks in quiet mode", async () => {
      // The quiet executor returns "PASS test\n" but this should not be printed
      await runTestSuites({ verbose: false });

      const output = consoleOutput.join("\n");
      // Should not contain raw Jest output
      expect(output).not.toContain("PASS  src/");
      expect(output).not.toContain("PASS test");
    });

    it("should print a summary line per step with status indicator", async () => {
      await runTestSuites({ verbose: false });

      const output = consoleOutput.join("\n");
      // Should contain step progress indicators
      expect(output).toContain("[1/8]");
      expect(output).toContain("[8/8]");
      // Should contain status indicators
      expect(output).toContain("✅");
    });

    it("should create a log file in the expected directory", async () => {
      await runTestSuites({ verbose: false });

      const logDir = join(REPO_ROOT, ".pilot", "attendant");
      expect(existsSync(logDir)).toBe(true);

      // Find the log file
      const files = require("fs").readdirSync(logDir);
      const logFiles = files.filter((f: string) => f.startsWith("attendant-") && f.endsWith(".log"));
      expect(logFiles.length).toBeGreaterThan(0);
    });

    it("should print CLEAR FOR TAKEOFF on success", async () => {
      await runTestSuites({ verbose: false });

      const output = consoleOutput.join("\n");
      expect(output).toContain("CLEAR FOR TAKEOFF");
    });

    it("should print duration and step count on success", async () => {
      await runTestSuites({ verbose: false });

      const output = consoleOutput.join("\n");
      expect(output).toContain("8/8 passed");
      expect(output).toMatch(/Duration:/);
    });

    it("should stop immediately if a step fails", async () => {
      mockQuietExecutor.mockImplementation((command) => {
        quietCommandCalls.push({ command, options: {} as SpawnSyncOptions });
        if (command.includes("namespace-enforcement")) {
          return { stdout: "FAIL test\n", stderr: "Error details", exitCode: 1 };
        }
        return { stdout: "PASS test\n", stderr: "", exitCode: 0 };
      });

      await expect(runTestSuites({ verbose: false })).rejects.toThrow(/Attendant failed at step 3/);
      expect(mockQuietExecutor).toHaveBeenCalledTimes(3);
    });
  });

  describe("failure output in quiet mode", () => {
    it("should print tail output on failure", async () => {
      const longOutput = Array(100).fill("line of output").join("\n");
      mockQuietExecutor.mockImplementation((command) => {
        quietCommandCalls.push({ command, options: {} as SpawnSyncOptions });
        if (command.includes("TOOLS-001")) {
          return { stdout: longOutput, stderr: "Error!", exitCode: 1 };
        }
        return { stdout: "PASS\n", stderr: "", exitCode: 0 };
      });

      await expect(runTestSuites({ verbose: false })).rejects.toThrow();

      const output = consoleOutput.join("\n");
      // Should contain truncation notice
      expect(output).toContain("truncated");
      // Should contain the hint to rerun
      expect(output).toContain("--verbose");
    });

    it("should print rerun hint on failure", async () => {
      mockQuietExecutor.mockImplementation((command) => {
        quietCommandCalls.push({ command, options: {} as SpawnSyncOptions });
        return { stdout: "", stderr: "Error!", exitCode: 1 };
      });

      await expect(runTestSuites({ verbose: false })).rejects.toThrow();

      const output = consoleOutput.join("\n");
      expect(output).toContain("pilot attendant --verbose");
    });

    it("should include log file path in failure output", async () => {
      mockQuietExecutor.mockImplementation((command) => {
        quietCommandCalls.push({ command, options: {} as SpawnSyncOptions });
        return { stdout: "", stderr: "Error!", exitCode: 1 };
      });

      await expect(runTestSuites({ verbose: false })).rejects.toThrow();

      const output = consoleOutput.join("\n");
      expect(output).toContain(".pilot");
      expect(output).toContain("attendant");
      expect(output).toContain(".log");
    });
  });

  describe("runAttendant", () => {
    it("should run static checks before test suites", async () => {
      await runAttendant({ verbose: false });

      expect(fileOpsMock.readJsonSafe).toHaveBeenCalled();
      expect(mockQuietExecutor).toHaveBeenCalled();
    });

    it("should fail if static checks have errors", async () => {
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "bad-feature": {
          tag: "no-at-sign",
          planId: 123,
          suites: { "1001": "Test" },
        },
      });

      await expect(runAttendant({ verbose: false })).rejects.toThrow(/Static checks failed/);
      expect(mockQuietExecutor).not.toHaveBeenCalled();
    });

    it("should pass verbose option to runTestSuites", async () => {
      await runAttendant({ verbose: true });

      // Verbose mode uses the sync executor
      expect(mockExecutor).toHaveBeenCalled();
      expect(mockQuietExecutor).not.toHaveBeenCalled();
    });

    it("should default to quiet mode", async () => {
      await runAttendant();

      // Default quiet mode uses the quiet executor
      expect(mockQuietExecutor).toHaveBeenCalled();
      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it("should report success when all steps pass", async () => {
      await runAttendant({ verbose: false });

      const output = consoleOutput.join("\n");
      expect(output).toContain("Attendant check passed");
    });
  });

  describe("error handling", () => {
    it("should provide human-readable step failure information", async () => {
      let callCount = 0;
      mockQuietExecutor.mockImplementation((command) => {
        callCount++;
        quietCommandCalls.push({ command, options: {} as SpawnSyncOptions });
        if (callCount === 4) {
          return { stdout: "", stderr: "runstate test failed", exitCode: 1 };
        }
        return { stdout: "PASS\n", stderr: "", exitCode: 0 };
      });

      try {
        await runTestSuites({ verbose: false });
        fail("Expected error to be thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("step 4");
        expect(message).toContain("RunState lifecycle tests");
      }
    });
  });
});
