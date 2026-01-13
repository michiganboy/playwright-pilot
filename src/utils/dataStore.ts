// Split storage: canonical (system.*) and run-scoped (test.*) data.
import { promises as fs } from "fs";
import path from "path";
import type { SystemKey } from "../testdata/system";

// Canonical store: committed to repo, for system.* keys only
const canonicalStorePath = path.resolve(process.cwd(), "src/testdata/dataStore.json");

// Run state: gitignored, for test.* keys only
// Located in src/testdata/ (not test-results/) to avoid Playwright output cleanup between runs
const runStatePath = path.resolve(process.cwd(), "src/testdata/runState.json");
const runStateLockPath = path.resolve(process.cwd(), "src/testdata/runState.lock");

async function loadCanonicalStore(): Promise<Record<string, unknown>> {
  try {
    const data = await fs.readFile(canonicalStorePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await ensureCanonicalStoreDir();
      await fs.writeFile(canonicalStorePath, JSON.stringify({}, null, 2));
      return {};
    }
    throw error;
  }
}

async function ensureCanonicalStoreDir(): Promise<void> {
  const dir = path.dirname(canonicalStorePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

async function loadRunState(): Promise<Record<string, unknown>> {
  try {
    const data = await fs.readFile(runStatePath, "utf-8");
    if (!data.trim()) {
      return {};
    }
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

/**
 * Acquires an exclusive lock on runState.json by creating a lock file.
 * Retries with exponential backoff if lock is already held.
 */
async function acquireLock(maxAttempts: number = 50): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try to create lock file exclusively (fails if it exists)
      const handle = await fs.open(runStateLockPath, "wx");
      await handle.close(); // Close the handle, file remains as lock marker
      return; // Lock acquired
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        // Lock is held by another process, wait and retry
        const delay = Math.min(10 + attempt * 2, 100); // Exponential backoff, max 100ms
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `Failed to acquire lock on runState.json after ${maxAttempts} attempts. ` +
    `Another process may be holding the lock.`
  );
}

/**
 * Releases the lock by removing the lock file.
 */
async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(runStateLockPath);
  } catch (error) {
    // Ignore ENOENT (lock file already removed) but log other errors
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[dataStore] Warning: Failed to release lock: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function ensureRunStateDir(): Promise<void> {
  const dir = path.dirname(runStatePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

// Writes a value to run state (test.* keys only).
// Uses cross-process locking to ensure safe concurrent writes from multiple workers.
export async function set(key: `test.${string}`, value: unknown): Promise<void> {
  if (!key.startsWith("test.")) {
    throw new Error(
      `set() can only be used with test.* keys. Received: "${key}". Use load() for system.* keys.`
    );
  }

  await ensureRunStateDir();

  // Acquire lock before reading/writing
  await acquireLock();

  try {
    // Read current state (may have been updated by another worker)
    const store = await loadRunState();
    store[key] = value;

    // Write back with await to ensure durability
    await fs.writeFile(runStatePath, JSON.stringify(store, null, 2));
  } finally {
    // Always release lock, even if write fails
    await releaseLock();
  }
}

// Reads a value from run state (test.* keys only).
export async function get<T = unknown>(key: `test.${string}`): Promise<T | undefined> {
  if (!key.startsWith("test.")) {
    throw new Error(
      `get() can only be used with test.* keys. Received: "${key}". Use load() for system.* keys.`
    );
  }

  const store = await loadRunState();
  return store[key] as T | undefined;
}

// Loads a value from canonical store (system.* keys only).
export async function load(key: SystemKey): Promise<unknown> {
  if (!key.startsWith("system.")) {
    throw new Error(
      `load() can only be used with system.* keys. Received: "${key}". Use get() for test.* keys.`
    );
  }

  const store = await loadCanonicalStore();
  return store[key];
}

// Clears run state (called at start of each run).
export async function clearRunState(): Promise<void> {
  await ensureRunStateDir();
  await fs.writeFile(runStatePath, JSON.stringify({}, null, 2));
}

// Internal function for CLI tooling only (not exposed to tests).
export async function updateSystemRegistry(key: SystemKey, value: unknown | undefined): Promise<void> {
  if (!key.startsWith("system.")) {
    throw new Error(`updateSystemRegistry() requires a system.* key. Received: "${key}"`);
  }

  const store = await loadCanonicalStore();
  if (value === undefined) {
    delete store[key];
  } else {
    store[key] = value;
  }
  await fs.writeFile(canonicalStorePath, JSON.stringify(store, null, 2));
}

// Internal function to read canonical store (for CLI tooling).
export async function readCanonicalStore(): Promise<Record<string, unknown>> {
  return loadCanonicalStore();
}
