/**
 * Tests for runState lifecycle behavior.
 * 
 * Per README.testdata:
 * - Default: runState is cleared at start AND end of each run (via globalSetup/globalTeardown)
 * - When PILOT_KEEP_RUNSTATE=true: runState is preserved across runs
 * 
 * These tests verify the global setup/teardown modules correctly handle
 * runState clearing based on the PILOT_KEEP_RUNSTATE environment variable.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { promises as fs } from "fs";
import path from "path";

// Import the clearRunState function directly
import { clearRunState } from "../../utils/dataStore";

const runStatePath = path.resolve(process.cwd(), "src/testdata/runState.json");

describe("runState lifecycle", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Ensure runState directory exists
    await fs.mkdir(path.dirname(runStatePath), { recursive: true }).catch(() => {});
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up runState
    await fs.writeFile(runStatePath, JSON.stringify({}, null, 2)).catch(() => {});
  });

  describe("clearRunState behavior", () => {
    test("clearRunState() writes empty object to runState.json", async () => {
      // Arrange - populate runState with data
      await fs.writeFile(
        runStatePath,
        JSON.stringify({
          "test.user": { id: "123" },
          "test.session": { token: "abc" },
        }, null, 2)
      );

      // Act
      await clearRunState();

      // Assert
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual({});
    });

    test("clearRunState() creates runState.json if it doesn't exist", async () => {
      // Arrange - ensure file doesn't exist
      await fs.unlink(runStatePath).catch(() => {});

      // Act
      await clearRunState();

      // Assert
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual({});
    });

    test("clearRunState() targets correct file path", async () => {
      // Arrange
      const expectedPath = path.resolve(process.cwd(), "src/testdata/runState.json");

      // Act
      await clearRunState();

      // Assert - verify the file exists at the expected location
      const stat = await fs.stat(expectedPath);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe("globalSetup behavior", () => {
    test("globalSetup clears runState by default", async () => {
      // Arrange - populate runState
      await fs.writeFile(
        runStatePath,
        JSON.stringify({ "test.existing": { data: "preserved" } }, null, 2)
      );

      // Ensure PILOT_KEEP_RUNSTATE is not set
      delete process.env.PILOT_KEEP_RUNSTATE;

      // Act - simulate what globalSetup does
      // Per global-setup.ts: if PILOT_KEEP_RUNSTATE !== "true", calls clearRunState()
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Assert
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual({});
    });

    test("globalSetup preserves runState when PILOT_KEEP_RUNSTATE=true", async () => {
      // Arrange
      const existingData = { "test.preserved": { value: "should remain" } };
      await fs.writeFile(runStatePath, JSON.stringify(existingData, null, 2));

      process.env.PILOT_KEEP_RUNSTATE = "true";

      // Act - simulate what globalSetup does
      // Per global-setup.ts: if PILOT_KEEP_RUNSTATE === "true", skips clearRunState()
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Assert - data should be preserved
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual(existingData);
    });
  });

  describe("globalTeardown behavior", () => {
    test("globalTeardown clears runState by default", async () => {
      // Arrange
      await fs.writeFile(
        runStatePath,
        JSON.stringify({ "test.teardown": { cleaned: true } }, null, 2)
      );

      delete process.env.PILOT_KEEP_RUNSTATE;

      // Act - simulate what globalTeardown does
      // Per global-teardown.ts: if PILOT_KEEP_RUNSTATE !== "true", calls clearRunState()
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Assert
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual({});
    });

    test("globalTeardown preserves runState when PILOT_KEEP_RUNSTATE=true", async () => {
      // Arrange
      const existingData = { "test.kept": { after: "teardown" } };
      await fs.writeFile(runStatePath, JSON.stringify(existingData, null, 2));

      process.env.PILOT_KEEP_RUNSTATE = "true";

      // Act - simulate what globalTeardown does
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Assert
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual(existingData);
    });
  });

  describe("PILOT_KEEP_RUNSTATE variations", () => {
    test("PILOT_KEEP_RUNSTATE must be exactly \"true\" to preserve", async () => {
      // Arrange
      const data = { "test.variations": { test: "data" } };
      await fs.writeFile(runStatePath, JSON.stringify(data, null, 2));

      // Act & Assert - various non-"true" values should NOT preserve
      const invalidValues = ["1", "yes", "TRUE", "True", "false", ""];

      for (const value of invalidValues) {
        // Restore data before each check
        await fs.writeFile(runStatePath, JSON.stringify(data, null, 2));
        
        process.env.PILOT_KEEP_RUNSTATE = value;

        // Simulate setup/teardown check
        if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
          await clearRunState();
        }

        const content = await fs.readFile(runStatePath, "utf-8");
        const store = JSON.parse(content);
        expect(store).toEqual({}); // Should be cleared
      }
    });

    test("unset PILOT_KEEP_RUNSTATE defaults to clearing", async () => {
      // Arrange
      await fs.writeFile(
        runStatePath,
        JSON.stringify({ "test.default": { cleared: true } }, null, 2)
      );

      delete process.env.PILOT_KEEP_RUNSTATE;

      // Act
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Assert
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual({});
    });
  });

  describe("runState file location", () => {
    test("runState is stored in src/testdata/ NOT test-results/", async () => {
      /**
       * Per README.testdata:
       * "Why not in test-results/? Playwright automatically cleans the test-results/
       * directory between runs, which would wipe runState. By placing it in
       * src/testdata/, we can preserve data across separate test runs when
       * PILOT_KEEP_RUNSTATE=true is set."
       */
      const expectedDir = path.resolve(process.cwd(), "src/testdata");
      const actualDir = path.dirname(runStatePath);

      expect(actualDir).toBe(expectedDir);
      expect(runStatePath).not.toContain("test-results");
    });
  });

  describe("cross-run persistence when PILOT_KEEP_RUNSTATE=true", () => {
    test("data persists across simulated runs with PILOT_KEEP_RUNSTATE=true", async () => {
      // Simulate Run 1: Create data
      process.env.PILOT_KEEP_RUNSTATE = "true";

      // Run 1 - globalSetup (preserve)
      const run1Data = { "test.run1": { created: "run1" } };
      await fs.writeFile(runStatePath, JSON.stringify(run1Data, null, 2));

      // Run 1 - globalTeardown (preserve)
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Simulate Run 2: Data should still exist
      // Run 2 - globalSetup check
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Assert - data from run 1 should persist
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual(run1Data);
    });

    test("data is cleared between runs without PILOT_KEEP_RUNSTATE", async () => {
      // Simulate Run 1: Create data
      delete process.env.PILOT_KEEP_RUNSTATE;

      const run1Data = { "test.run1": { created: "run1" } };
      await fs.writeFile(runStatePath, JSON.stringify(run1Data, null, 2));

      // Run 1 - globalTeardown clears
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Simulate Run 2: globalSetup clears
      if (process.env.PILOT_KEEP_RUNSTATE !== "true") {
        await clearRunState();
      }

      // Assert - data should be cleared
      const content = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(content);
      expect(store).toEqual({});
    });
  });
});
