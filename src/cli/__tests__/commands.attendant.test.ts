/**
 * Tests for CLI attendant command (health gate).
 * 
 * Attendant is a HEALTH GATE that:
 * 1. Runs static checks (feature config, directories, fixtures, exports)
 * 2. Runs authoritative test suites that define framework correctness
 * 3. Fails immediately if any step fails
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import type { ExecSyncOptions } from "child_process";

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
} from "../commands/attendant";

describe("CLI Commands - Attendant Tests", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let commandCalls: Array<{ command: string; options: ExecSyncOptions }>;
  let mockExecutor: jest.Mock<(command: string, options: ExecSyncOptions) => void>;

  beforeEach(() => {
    // Suppress console output during tests
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();

    // Reset all mocks
    fileOpsMock.readFileSafe.mockReset();
    fileOpsMock.readJsonSafe.mockReset();
    fileOpsMock.fileExists.mockReset();
    fileOpsMock.dirExists.mockReset();
    featureConfigMock.getSuiteIds.mockReset();
    featureConfigMock.hasSuiteId.mockReset();
    globMock.mockReset();

    // Track command calls
    commandCalls = [];
    mockExecutor = jest.fn<(command: string, options: ExecSyncOptions) => void>()
      .mockImplementation((command, options) => {
        commandCalls.push({ command, options });
      });

    // Set mock executor
    setCommandExecutor(mockExecutor);

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
    // Reset executor to default
    resetCommandExecutor();
    jest.clearAllMocks();
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

  describe("runTestSuites", () => {
    it("should run all required commands in correct order", async () => {
      // Act
      await runTestSuites();

      // Assert - all 8 steps executed
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

    it("should pass PILOT_SEED and PILOT_KEEP_RUNSTATE for TOOLS steps", async () => {
      // Act
      await runTestSuites();

      // Assert - check all TOOLS steps have env vars
      for (let i = 5; i <= 7; i++) {
        const toolsCall = commandCalls[i];
        expect(toolsCall.options.env).toBeDefined();
        expect(toolsCall.options.env!.PILOT_SEED).toBe("12345");
        expect(toolsCall.options.env!.PILOT_KEEP_RUNSTATE).toBe("true");
      }
    });

    it("should use stdio inherit for all commands", async () => {
      // Act
      await runTestSuites();

      // Assert - all commands use stdio: inherit
      for (const call of commandCalls) {
        expect(call.options.stdio).toBe("inherit");
      }
    });

    it("should stop immediately if a command fails", async () => {
      // Arrange - fail on step 3 (namespace enforcement)
      mockExecutor.mockImplementation((command) => {
        if (command.includes("namespace-enforcement")) {
          throw new Error("Test execution failed");
        }
        commandCalls.push({ command, options: {} as ExecSyncOptions });
      });

      // Act & Assert
      await expect(runTestSuites()).rejects.toThrow(/Attendant failed at step 3/);

      // Should have attempted steps 1, 2, 3 only (3 failed)
      expect(mockExecutor).toHaveBeenCalledTimes(3);
    });

    it("should include step name and command in failure message", async () => {
      // Arrange - fail on step 2
      mockExecutor.mockImplementation((command) => {
        if (command.includes("commands.suite.test.ts")) {
          throw new Error("Tests failed");
        }
        commandCalls.push({ command, options: {} as ExecSyncOptions });
      });

      // Act & Assert
      await expect(runTestSuites()).rejects.toThrow("Suite command tests");
      await expect(mockExecutor).toHaveBeenCalledTimes(2);
    });

    it("should not execute later steps after failure", async () => {
      // Arrange - fail on step 1
      mockExecutor.mockImplementation(() => {
        throw new Error("First step failed");
      });

      // Act
      await expect(runTestSuites()).rejects.toThrow();

      // Assert - only 1 attempt made
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe("runAttendant", () => {
    it("should run static checks before test suites", async () => {
      // Act
      await runAttendant();

      // Assert - static checks run (readJsonSafe called for featureConfig)
      expect(fileOpsMock.readJsonSafe).toHaveBeenCalled();
      // Then test suites run
      expect(mockExecutor).toHaveBeenCalled();
    });

    it("should fail if static checks have errors", async () => {
      // Arrange - invalid feature config
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "bad-feature": {
          tag: "no-at-sign", // Missing @ prefix
          planId: 123,
          suites: { "1001": "Test" },
        },
      });

      // Act & Assert
      await expect(runAttendant()).rejects.toThrow(/Static checks failed/);

      // Test suites should NOT run
      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it("should report success when all steps pass", async () => {
      // Act
      await runAttendant();

      // Assert - success message printed
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Attendant check passed")
      );
    });

    it("should not fail on warnings, only errors", async () => {
      // Arrange - set up a warning condition (orphaned fixture)
      (fileOpsMock.readFileSafe as any).mockResolvedValue(
        'import { TestPage } from "./pages/test/TestPage";\n' +
        "type Fixtures = { orphanPage: OrphanPage; };\n" +
        "testPage: async ({ page }, use) => {}"
      );

      // Act - should not throw
      await runAttendant();

      // Assert - test suites still ran
      expect(mockExecutor).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should provide human-readable step failure information", async () => {
      // Arrange - fail on step 4
      let callCount = 0;
      mockExecutor.mockImplementation((command) => {
        callCount++;
        if (callCount === 4) {
          throw new Error("runstate test failed");
        }
      });

      // Act & Assert
      try {
        await runTestSuites();
        fail("Expected error to be thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("step 4");
        expect(message).toContain("RunState lifecycle tests");
        expect(message).toContain("runstate-lifecycle.test.ts");
      }
    });

    it("should print error details to console", async () => {
      // Arrange - fail on step 5
      let callCount = 0;
      mockExecutor.mockImplementation(() => {
        callCount++;
        if (callCount === 5) {
          throw new Error("metadata test failed");
        }
      });

      // Act
      await expect(runTestSuites()).rejects.toThrow();

      // Assert - error logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("FAILED")
      );
    });
  });
});
