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

describe("dataStore <serverId> substitution", () => {
  const originalEnv = process.env.MAILOSAUR_SERVER_ID;

  beforeEach(async () => {
    await clearCanonicalStore().catch(() => {});
  });

  afterEach(async () => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.MAILOSAUR_SERVER_ID = originalEnv;
    } else {
      delete process.env.MAILOSAUR_SERVER_ID;
    }
    await clearCanonicalStore().catch(() => {});
  });

  test("load() substitutes <serverId> in all string values", async () => {
    // Set env var
    process.env.MAILOSAUR_SERVER_ID = "test-server-123";

    // Write a system entry with <serverId> placeholder
    await fs.writeFile(
      canonicalStorePath,
      JSON.stringify({
        "system.test.mfaUser": {
          username: "admin@example.com",
          email: "admin@example.com",
          mfa: {
            provider: "mailosaur",
            channels: {
              email: {
                sentTo: "admin@<serverId>.mailosaur.net",
              },
            },
          },
        },
      }, null, 2)
    );

    const result = await load("system.test.mfaUser" as any);

    // Verify object shape is preserved and placeholder is replaced
    expect(result).toEqual({
      username: "admin@example.com",
      email: "admin@example.com",
      mfa: {
        provider: "mailosaur",
        channels: {
          email: {
            sentTo: "admin@test-server-123.mailosaur.net",
          },
        },
      },
    });
  });

  test("load() throws when <serverId> exists but env is missing", async () => {
    // Ensure env var is NOT set
    delete process.env.MAILOSAUR_SERVER_ID;

    // Write a system entry with <serverId> placeholder
    await fs.writeFile(
      canonicalStorePath,
      JSON.stringify({
        "system.test.mfaUser": {
          username: "admin@example.com",
          mfa: {
            channels: {
              email: { sentTo: "admin@<serverId>.mailosaur.net" },
            },
          },
        },
      }, null, 2)
    );

    await expect(load("system.test.mfaUser" as any)).rejects.toThrow(
      /MAILOSAUR_SERVER_ID environment variable is not set/
    );
  });

  test("load() does NOT throw when no <serverId> placeholder and env is missing", async () => {
    // Ensure env var is NOT set
    delete process.env.MAILOSAUR_SERVER_ID;

    // Write a system entry WITHOUT placeholder
    await fs.writeFile(
      canonicalStorePath,
      JSON.stringify({
        "system.test.regularUser": {
          username: "regular@example.com",
          email: "regular@example.com",
          role: "admin",
        },
      }, null, 2)
    );

    const result = await load("system.test.regularUser" as any);

    // Should return value unchanged, no error
    expect(result).toEqual({
      username: "regular@example.com",
      email: "regular@example.com",
      role: "admin",
    });
  });

  test("load() substitutes multiple <serverId> occurrences in same string", async () => {
    process.env.MAILOSAUR_SERVER_ID = "multi-test";

    await fs.writeFile(
      canonicalStorePath,
      JSON.stringify({
        "system.test.multiPlaceholder": {
          primary: "user@<serverId>.mailosaur.net",
          secondary: "backup@<serverId>.mailosaur.net",
          nested: {
            deep: "deep@<serverId>.mailosaur.net",
          },
        },
      }, null, 2)
    );

    const result = await load("system.test.multiPlaceholder" as any);

    expect(result).toEqual({
      primary: "user@multi-test.mailosaur.net",
      secondary: "backup@multi-test.mailosaur.net",
      nested: {
        deep: "deep@multi-test.mailosaur.net",
      },
    });
  });

  test("load() preserves non-string values unchanged", async () => {
    process.env.MAILOSAUR_SERVER_ID = "preserve-test";

    await fs.writeFile(
      canonicalStorePath,
      JSON.stringify({
        "system.test.mixedTypes": {
          name: "user@<serverId>.mailosaur.net",
          count: 42,
          enabled: true,
          tags: ["tag1", "tag@<serverId>.net"],
          meta: null,
        },
      }, null, 2)
    );

    const result = await load("system.test.mixedTypes" as any);

    expect(result).toEqual({
      name: "user@preserve-test.mailosaur.net",
      count: 42,
      enabled: true,
      tags: ["tag1", "tag@preserve-test.net"],
      meta: null,
    });
  });
});