/**
 * Tests for dataStore namespace enforcement.
 * 
 * Per README.testdata:
 * - set/get are test.* only (run-scoped persistence)
 * - load is system.* only (repo-backed canonical data)
 * 
 * These tests verify the namespace boundaries are enforced correctly,
 * preventing accidental writes to canonical data from tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import path from "path";

// Import the actual dataStore functions to test namespace enforcement
import { set, get, load, clearRunState } from "../../utils/dataStore";

const runStatePath = path.resolve(process.cwd(), "src/testdata/runState.json");

describe("dataStore namespace enforcement", () => {
  beforeEach(async () => {
    // Clear run state before each test
    await clearRunState().catch(() => {});
  });

  afterEach(async () => {
    // Clean up after each test
    await clearRunState().catch(() => {});
  });

  describe("set() - test.* namespace only", () => {
    test("set() rejects system.* keys with descriptive error", async () => {
      // Arrange - attempt to use set() with a system.* key
      const systemKey = "system.foo" as any;

      // Act & Assert
      await expect(set(systemKey, { data: "should fail" })).rejects.toThrow(
        'set() can only be used with test.* keys. Received: "system.foo". Use load() for system.* keys.'
      );
    });

    test("set() accepts test.* keys", async () => {
      // Arrange
      const testKey = "test.user" as `test.${string}`;
      const testValue = { id: "123", name: "Test User" };

      // Act
      await set(testKey, testValue);

      // Assert - verify data was written to runState
      const data = await fs.readFile(runStatePath, "utf-8");
      const store = JSON.parse(data);
      expect(store["test.user"]).toEqual(testValue);
    });

    test("set() rejects keys without test. prefix", async () => {
      // These would be caught by TypeScript, but runtime validation is also important
      await expect(set("invalid.key" as any, {})).rejects.toThrow(
        'set() can only be used with test.* keys'
      );
    });
  });

  describe("get() - test.* namespace only", () => {
    test("get() rejects system.* keys with descriptive error", async () => {
      // Arrange - attempt to use get() with a system.* key
      const systemKey = "system.foo" as any;

      // Act & Assert
      await expect(get(systemKey)).rejects.toThrow(
        'get() can only be used with test.* keys. Received: "system.foo". Use load() for system.* keys.'
      );
    });

    test("get() reads test.* keys from runState", async () => {
      // Arrange - write directly to runState
      await fs.mkdir(path.dirname(runStatePath), { recursive: true });
      await fs.writeFile(
        runStatePath,
        JSON.stringify({ "test.user": { id: "456", name: "Runtime User" } }, null, 2)
      );

      // Act
      const user = await get<{ id: string; name: string }>("test.user");

      // Assert
      expect(user).toEqual({ id: "456", name: "Runtime User" });
    });

    test("get() rejects keys without test. prefix", async () => {
      await expect(get("plain.key" as any)).rejects.toThrow(
        'get() can only be used with test.* keys'
      );
    });
  });

  describe("load() - system.* namespace only", () => {
    test("load() rejects test.* keys with descriptive error", async () => {
      // Arrange - attempt to use load() with a test.* key
      const testKey = "test.foo" as any;

      // Act & Assert
      await expect(load(testKey)).rejects.toThrow(
        'load() can only be used with system.* keys. Received: "test.foo". Use get() for test.* keys.'
      );
    });

    test("load() accepts system.* keys", async () => {
      // Arrange - use a valid system key
      // Note: This test verifies load() accepts the key, but the value
      // may or may not exist in the canonical store
      const systemKey = "system.salesforce.users.admin" as const;

      // Act - should not throw (may return undefined if key doesn't exist)
      const result = await load(systemKey);

      // Assert - load() accepted the key (no error thrown)
      // Result may be undefined if the key doesn't exist in dataStore.json
      expect(result === undefined || result !== null).toBe(true);
    });

    test("load() rejects keys without system. prefix", async () => {
      await expect(load("invalid.namespace" as any)).rejects.toThrow(
        'load() can only be used with system.* keys'
      );
    });
  });

  describe("namespace isolation", () => {
    test("set() does NOT write to canonical dataStore.json", async () => {
      // Arrange
      const canonicalStorePath = path.resolve(process.cwd(), "src/testdata/dataStore.json");
      const originalContent = await fs.readFile(canonicalStorePath, "utf-8").catch(() => "{}");
      const originalStore = JSON.parse(originalContent);

      // Act - write to test.* namespace
      await set("test.isolation.check", { data: "test" });

      // Assert - canonical store should NOT have the test.* key
      const newContent = await fs.readFile(canonicalStorePath, "utf-8").catch(() => "{}");
      const newStore = JSON.parse(newContent);
      expect(newStore["test.isolation.check"]).toBeUndefined();
      
      // Original keys should remain unchanged
      expect(Object.keys(newStore)).toEqual(Object.keys(originalStore));
    });

    test("test.* and system.* keys are stored in separate files", async () => {
      // Arrange
      const canonicalStorePath = path.resolve(process.cwd(), "src/testdata/dataStore.json");

      // Act - write a test key
      await set("test.separation.check", { value: "runtime-only" });

      // Assert - runState has the test key
      const runStateContent = await fs.readFile(runStatePath, "utf-8");
      const runState = JSON.parse(runStateContent);
      expect(runState["test.separation.check"]).toEqual({ value: "runtime-only" });

      // Assert - canonical store does NOT have the test key
      const canonicalContent = await fs.readFile(canonicalStorePath, "utf-8").catch(() => "{}");
      const canonical = JSON.parse(canonicalContent);
      expect(canonical["test.separation.check"]).toBeUndefined();
    });
  });

  describe("error message clarity", () => {
    test("set() error suggests load() for system.* keys", async () => {
      try {
        await set("system.should.fail" as any, {});
        fail("Expected error to be thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Use load() for system.* keys");
      }
    });

    test("get() error suggests load() for system.* keys", async () => {
      try {
        await get("system.should.fail" as any);
        fail("Expected error to be thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Use load() for system.* keys");
      }
    });

    test("load() error suggests get() for test.* keys", async () => {
      try {
        await load("test.should.fail" as any);
        fail("Expected error to be thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Use get() for test.* keys");
      }
    });
  });
});
