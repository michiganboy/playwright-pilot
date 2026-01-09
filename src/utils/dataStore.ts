// Provides JSON-backed storage for sharing data between tests.
import { promises as fs } from "fs";
import path from "path";
import type * as models from "../testdata/models";

export type DataStoreMap = {
  "enrollment.user": models.User;
  "appointments.user": models.User;
  "sitemanager.user": models.User;
  "schedule.user": models.User;
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

// Loads a value from the JSON data store using a feature-specific key.
export async function load<K extends keyof DataStoreMap>(
  key: K
): Promise<DataStoreMap[K] | undefined> {
  const store = await loadStore();
  return store[key] as DataStoreMap[K] | undefined;
}

// Clears all persisted values from the JSON data store.
export async function clearAll(): Promise<void> {
  await fs.writeFile(dataStorePath, JSON.stringify({}, null, 2));
}
