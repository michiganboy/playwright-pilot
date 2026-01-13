/**
 * Tests for CLI trace:open command.
 * 
 * trace:open opens the Playwright HTML report in the browser.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import type { ExecSyncOptions } from "child_process";

import {
  openReport,
  setTraceCommandExecutor,
  resetTraceCommandExecutor,
} from "../commands/trace";

describe("CLI Commands - Trace Tests", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let mockExecutor: jest.Mock<(command: string, options: ExecSyncOptions) => void>;
  let lastCommand: string | null;
  let lastOptions: ExecSyncOptions | null;

  beforeEach(() => {
    // Suppress console output during tests
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();

    // Reset tracking
    lastCommand = null;
    lastOptions = null;

    // Create mock executor
    mockExecutor = jest.fn<(command: string, options: ExecSyncOptions) => void>()
      .mockImplementation((command, options) => {
        lastCommand = command;
        lastOptions = options;
      });

    // Set mock executor
    setTraceCommandExecutor(mockExecutor);
  });

  afterEach(() => {
    // Reset executor to default
    resetTraceCommandExecutor();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe("trace:open", () => {
    it("should invoke playwright show-report", async () => {
      // Act
      await openReport();

      // Assert
      expect(mockExecutor).toHaveBeenCalledTimes(1);
      expect(lastCommand).toBe("npx playwright show-report");
    });

    it("should use stdio inherit for output", async () => {
      // Act
      await openReport();

      // Assert
      expect(lastOptions).toBeDefined();
      expect(lastOptions!.stdio).toBe("inherit");
    });

    it("should surface failure cleanly when command fails", async () => {
      // Arrange - make executor throw
      mockExecutor.mockImplementation(() => {
        throw new Error("Command failed: report not found");
      });

      // Act & Assert
      await expect(openReport()).rejects.toThrow("Failed to open report");
    });

    it("should include original error message in failure", async () => {
      // Arrange
      const originalError = "ENOENT: file not found";
      mockExecutor.mockImplementation(() => {
        throw new Error(originalError);
      });

      // Act & Assert
      await expect(openReport()).rejects.toThrow(originalError);
    });

    it("should handle non-Error throws gracefully", async () => {
      // Arrange - throw a string instead of Error
      mockExecutor.mockImplementation(() => {
        throw "string error";
      });

      // Act & Assert
      await expect(openReport()).rejects.toThrow("Failed to open report");
    });
  });

  describe("command format", () => {
    it("should execute npx playwright show-report exactly", async () => {
      // Act
      await openReport();

      // Assert - exact command match
      expect(mockExecutor).toHaveBeenCalledWith(
        "npx playwright show-report",
        expect.any(Object)
      );
    });
  });
});
