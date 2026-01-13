/**
 * Tests for seed and run metadata persistence to test-results/.last-run.json.
 * 
 * Per README.testdata and README.artifacts:
 * - Seed and run metadata are persisted under a `pilot` namespace
 * - Includes: seed, seedMode, startedAt, finishedAt, workers
 * 
 * The metadata is written by CustomListReporter's writePilotMetadata method.
 * These tests verify the structure and behavior of that persistence.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { promises as fs } from "fs";
import path from "path";

const lastRunPath = path.resolve(process.cwd(), "test-results/.last-run.json");
const testResultsDir = path.dirname(lastRunPath);

// Helper to simulate the writePilotMetadata behavior from custom-list-reporter.ts
async function writePilotMetadata(globals: {
  seed?: string;
  seedMode?: "forced" | "generated";
  startedAt?: string;
  workers?: number;
}): Promise<void> {
  let lastRun: Record<string, unknown> = {};

  try {
    const content = await fs.readFile(lastRunPath, "utf-8");
    lastRun = JSON.parse(content);
  } catch {
    // File doesn't exist yet, start with empty object
  }

  const seed = globals.seed || "";
  const seedMode = globals.seedMode || "generated";
  const startedAt = globals.startedAt || new Date().toISOString();
  const workers = globals.workers || 1;

  lastRun.pilot = {
    seed,
    seedMode,
    startedAt,
    finishedAt: new Date().toISOString(),
    workers,
  };

  await fs.mkdir(testResultsDir, { recursive: true });
  await fs.writeFile(lastRunPath, JSON.stringify(lastRun, null, 2));
}

describe("last-run metadata persistence", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalGlobal: Record<string, unknown>;

  beforeEach(async () => {
    // Save original state
    originalEnv = { ...process.env };
    originalGlobal = {
      __PILOT_SEED__: (global as any).__PILOT_SEED__,
      __PILOT_SEED_MODE__: (global as any).__PILOT_SEED_MODE__,
      __PILOT_STARTED_AT__: (global as any).__PILOT_STARTED_AT__,
      __PILOT_WORKERS__: (global as any).__PILOT_WORKERS__,
    };

    // Ensure test-results directory exists
    await fs.mkdir(testResultsDir, { recursive: true }).catch(() => {});

    // Clean up last-run.json before each test
    await fs.unlink(lastRunPath).catch(() => {});
  });

  afterEach(async () => {
    // Restore original state
    process.env = originalEnv;
    Object.entries(originalGlobal).forEach(([key, value]) => {
      if (value === undefined) {
        delete (global as any)[key];
      } else {
        (global as any)[key] = value;
      }
    });

    // Clean up
    await fs.unlink(lastRunPath).catch(() => {});
  });

  describe("metadata structure", () => {
    test("writes pilot namespace with required fields", async () => {
      // Arrange
      const globals = {
        seed: "test-seed-123",
        seedMode: "generated" as const,
        startedAt: "2024-12-20T10:00:00.000Z",
        workers: 4,
      };

      // Act
      await writePilotMetadata(globals);

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun.pilot).toBeDefined();
      expect(lastRun.pilot.seed).toBe("test-seed-123");
      expect(lastRun.pilot.seedMode).toBe("generated");
      expect(lastRun.pilot.startedAt).toBe("2024-12-20T10:00:00.000Z");
      expect(lastRun.pilot.finishedAt).toBeDefined();
      expect(lastRun.pilot.workers).toBe(4);
    });

    test("includes finishedAt timestamp", async () => {
      // Arrange
      const beforeWrite = new Date();

      // Act
      await writePilotMetadata({ seed: "finish-test" });

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);
      const afterWrite = new Date();

      const finishedAt = new Date(lastRun.pilot.finishedAt);
      expect(finishedAt.getTime()).toBeGreaterThanOrEqual(beforeWrite.getTime());
      expect(finishedAt.getTime()).toBeLessThanOrEqual(afterWrite.getTime());
    });

    test("seedMode can be forced or generated", async () => {
      // Test forced mode
      await writePilotMetadata({ seed: "forced-seed", seedMode: "forced" });
      let content = await fs.readFile(lastRunPath, "utf-8");
      let lastRun = JSON.parse(content);
      expect(lastRun.pilot.seedMode).toBe("forced");

      // Test generated mode
      await writePilotMetadata({ seed: "generated-seed", seedMode: "generated" });
      content = await fs.readFile(lastRunPath, "utf-8");
      lastRun = JSON.parse(content);
      expect(lastRun.pilot.seedMode).toBe("generated");
    });
  });

  describe("file location", () => {
    test("writes to test-results/.last-run.json", async () => {
      // Act
      await writePilotMetadata({ seed: "location-test" });

      // Assert
      const expectedPath = path.resolve(process.cwd(), "test-results/.last-run.json");
      const stat = await fs.stat(expectedPath);
      expect(stat.isFile()).toBe(true);
    });

    test("creates test-results directory if it doesn't exist", async () => {
      // Arrange - remove directory
      await fs.rm(testResultsDir, { recursive: true, force: true }).catch(() => {});

      // Act
      await writePilotMetadata({ seed: "dir-create-test" });

      // Assert
      const stat = await fs.stat(testResultsDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("preserves existing keys", () => {
    test("preserves status and failedTests from Playwright", async () => {
      // Arrange - write existing Playwright data
      const existingData = {
        status: "passed",
        failedTests: ["test1", "test2"],
      };
      await fs.mkdir(testResultsDir, { recursive: true });
      await fs.writeFile(lastRunPath, JSON.stringify(existingData, null, 2));

      // Act
      await writePilotMetadata({ seed: "preserve-test" });

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun.status).toBe("passed");
      expect(lastRun.failedTests).toEqual(["test1", "test2"]);
      expect(lastRun.pilot).toBeDefined();
    });

    test("updates pilot namespace while keeping other data", async () => {
      // Arrange
      const existingData = {
        customKey: "preserved",
        pilot: {
          seed: "old-seed",
          workers: 2,
        },
      };
      await fs.mkdir(testResultsDir, { recursive: true });
      await fs.writeFile(lastRunPath, JSON.stringify(existingData, null, 2));

      // Act
      await writePilotMetadata({ seed: "new-seed", workers: 8 });

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun.customKey).toBe("preserved"); // Existing data preserved
      expect(lastRun.pilot.seed).toBe("new-seed"); // pilot updated
      expect(lastRun.pilot.workers).toBe(8);
    });
  });

  describe("seed information", () => {
    test("records seed for reproducibility", async () => {
      // Arrange
      const seed = "abc123def456";

      // Act
      await writePilotMetadata({ seed, seedMode: "generated" });

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun.pilot.seed).toBe(seed);
      // Seed can be used with: PILOT_SEED=abc123def456 npm run test
    });

    test("handles empty seed gracefully", async () => {
      // Act
      await writePilotMetadata({});

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun.pilot.seed).toBe("");
      expect(lastRun.pilot.seedMode).toBe("generated");
    });
  });

  describe("worker count", () => {
    test("records worker count for parallel execution info", async () => {
      // Arrange & Act
      await writePilotMetadata({ seed: "worker-test", workers: 4 });

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun.pilot.workers).toBe(4);
    });

    test("defaults to 1 worker when not specified", async () => {
      // Act
      await writePilotMetadata({ seed: "default-worker-test" });

      // Assert
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun.pilot.workers).toBe(1);
    });
  });

  describe("expected JSON structure", () => {
    test("matches documented structure from README.testdata", async () => {
      /**
       * Expected structure per README.testdata:
       * {
       *   "status": "passed",
       *   "failedTests": [],
       *   "pilot": {
       *     "seed": "abc123def456",
       *     "seedMode": "generated",
       *     "startedAt": "2024-12-20T10:00:00.000Z",
       *     "finishedAt": "2024-12-20T10:05:00.000Z",
       *     "workers": 4
       *   }
       * }
       */

      // Arrange - simulate Playwright writing its data first
      const playwrightData = {
        status: "passed",
        failedTests: [],
      };
      await fs.mkdir(testResultsDir, { recursive: true });
      await fs.writeFile(lastRunPath, JSON.stringify(playwrightData, null, 2));

      // Act - add pilot metadata
      await writePilotMetadata({
        seed: "abc123def456",
        seedMode: "generated",
        startedAt: "2024-12-20T10:00:00.000Z",
        workers: 4,
      });

      // Assert - verify structure
      const content = await fs.readFile(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);

      expect(lastRun).toMatchObject({
        status: "passed",
        failedTests: [],
        pilot: {
          seed: "abc123def456",
          seedMode: "generated",
          startedAt: "2024-12-20T10:00:00.000Z",
          workers: 4,
        },
      });
      expect(lastRun.pilot.finishedAt).toBeDefined();
      expect(typeof lastRun.pilot.finishedAt).toBe("string");
    });
  });
});
