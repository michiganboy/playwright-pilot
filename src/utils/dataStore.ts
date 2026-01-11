// Provides JSON-backed storage for sharing data between tests.
import { promises as fs } from "fs";
import path from "path";
import type * as models from "../testdata/models";
import type { SystemKey } from "../testdata/systemKeys";

export type DataStoreMap = {
  "enrollment.user": models.User;
  "appointments.user": models.User;
  "sitemanager.user": models.User;
  "login-page.user": models.User;
};

const dataStorePath = path.resolve(process.cwd(), "src/testdata/dataStore.json");

async function loadStore(): Promise<Record<string, unknown>> {
  try {
    const data = await fs.readFile(dataStorePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Saves a typed value under a feature-specific key in the JSON data store.
export async function save<K extends keyof DataStoreMap>(
  key: K,
  value: DataStoreMap[K]
): Promise<void> {
  const store = await loadStore();
  store[key] = value;
  await fs.writeFile(dataStorePath, JSON.stringify(store, null, 2));
}

// Saves any value with any key (untyped, for dynamic keys).
export async function saveAny(key: string, value: unknown): Promise<void> {
  const store = await loadStore();
  store[key] = value;
  await fs.writeFile(dataStorePath, JSON.stringify(store, null, 2));
}

// Loads a value from the JSON data store using a feature-specific key.
export async function load<K extends keyof DataStoreMap>(
  key: K
): Promise<DataStoreMap[K] | undefined> {
  const store = await loadStore();
  return store[key] as DataStoreMap[K] | undefined;
}

// Loads any value with any key (untyped, for dynamic keys).
export async function loadAny(key: string): Promise<unknown> {
  const store = await loadStore();
  return store[key];
}

// Writes a value to the JSON data store using the provided key.
export async function set(key: SystemKey | `test.${string}`, value: unknown): Promise<void> {
  if (!key.startsWith("system.") && !key.startsWith("test.")) {
    throw new Error("Data store keys must start with `system.` or `test.`");
  }

  if (key.startsWith("system.")) {
    const store = await loadStore();
    if (Object.prototype.hasOwnProperty.call(store, key)) {
      console.warn(`[dataStore] Overwriting existing system key: ${key}`);
    }
  }

  await saveAny(key, value);
}

// Reads a value from the JSON data store using the provided key.
export async function get<T = unknown>(key: SystemKey | `test.${string}`): Promise<T | undefined> {
  if (!key.startsWith("system.") && !key.startsWith("test.")) {
    throw new Error("Data store keys must start with `system.` or `test.`");
  }

  return (await loadAny(key)) as T | undefined;
}

// Clears all persisted values from the JSON data store.
export async function clearAll(): Promise<void> {
  await fs.writeFile(dataStorePath, JSON.stringify({}, null, 2));
}

// Re-exports supported system data store keys for ergonomic imports.
export { systemKeys } from "../testdata/systemKeys";

