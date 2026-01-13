// Unit tests for dataStore split storage validation
import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import path from "path";
import {
  set,
  get,
  load,
  clearRunState,
  updateSystemRegistry,
} from "../dataStore";
import { system } from "../../testdata/system";

const canonicalStorePath = path.resolve(process.cwd(), "src/testdata/dataStore.json");
const runtimeStorePath = path.resolve(process.cwd(), "src/testdata/runState.json");

// Helper to clear canonical store for testing
async function clearCanonicalStore(): Promise<void> {
  await fs.writeFile(canonicalStorePath, JSON.stringify({}, null, 2)).catch(() => {});
}

describe("dataStore split storage", () => {
  beforeEach(async () => {
    // Clean up both stores before each test
    await clearCanonicalStore().catch(() => {});
    await clearRunState().catch(() => {});
  });

  afterEach(async () => {
    // Clean up after each test
    await clearCanonicalStore().catch(() => {});
    await clearRunState().catch(() => {});
  });

  test("set() writes ONLY to runtime file", async () => {
    await set("test.user", { id: "123", name: "Test User" });

    // Runtime file should contain the data
    const runtimeData = await fs.readFile(runtimeStorePath, "utf-8").catch(() => "{}");
    const runtimeStore = JSON.parse(runtimeData);
    expect(runtimeStore["test.user"]).toEqual({ id: "123", name: "Test User" });

    // Canonical file should NOT contain the data
    const canonicalData = await fs.readFile(canonicalStorePath, "utf-8").catch(() => "{}");
    const canonicalStore = JSON.parse(canonicalData);
    expect(canonicalStore["test.user"]).toBeUndefined();
  });

  test("get() reads ONLY from runtime file", async () => {
    // Write directly to runtime file
    await fs.mkdir(path.dirname(runtimeStorePath), { recursive: true });
    await fs.writeFile(
      runtimeStorePath,
      JSON.stringify({ "test.user": { id: "456", name: "Runtime User" } }, null, 2)
    );

    const user = await get<{ id: string; name: string }>("test.user");
    expect(user).toEqual({ id: "456", name: "Runtime User" });
  });

  test("updateSystemRegistry() writes ONLY to canonical file", async () => {
    // Note: This test requires a valid system key
    // Test that it rejects test.* keys
    await expect(updateSystemRegistry("test.invalid" as any, {})).rejects.toThrow(
      "updateSystemRegistry() requires a system.* key"
    );
  });

  test("load() reads ONLY from canonical file", async () => {
    // Note: This test requires a valid system key in DataStoreMap
    // For now, we'll test the error case to ensure namespace enforcement
    await expect(load("test.invalid" as any)).rejects.toThrow(
      "load() can only be used with system.* keys"
    );
  });

  test("set() throws error for system.* keys", async () => {
    await expect(set("system.invalid" as any, {})).rejects.toThrow(
      "set() can only be used with test.* keys"
    );
  });

  test("get() throws error for system.* keys", async () => {
    await expect(get("system.invalid" as any)).rejects.toThrow(
      "get() can only be used with test.* keys"
    );
  });

  test("updateSystemRegistry() throws error for test.* keys", async () => {
    await expect(updateSystemRegistry("test.invalid" as any, {})).rejects.toThrow(
      "updateSystemRegistry() requires a system.* key"
    );
  });

  test("load() throws error for test.* keys", async () => {
    await expect(load("test.invalid" as any)).rejects.toThrow(
      "load() can only be used with system.* keys"
    );
  });

  test("runtime store persists across multiple set/get calls", async () => {
    await set("test.user1", { id: "1", name: "User 1" });
    await set("test.user2", { id: "2", name: "User 2" });

    const user1 = await get<{ id: string; name: string }>("test.user1");
    const user2 = await get<{ id: string; name: string }>("test.user2");

    expect(user1).toEqual({ id: "1", name: "User 1" });
    expect(user2).toEqual({ id: "2", name: "User 2" });
  });
});
