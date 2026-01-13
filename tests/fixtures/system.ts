// System fixtures: load canonical system values and inject into tests.
import { load } from "../../src/utils/dataStore";
import { system } from "../../src/testdata/system";

// Recursively collect all system key strings from registry
function collectSystemKeys(obj: any, keys: string[] = []): string[] {
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.startsWith("system.")) {
      keys.push(value);
    } else if (typeof value === "object" && value !== null) {
      collectSystemKeys(value, keys);
    }
  }
  return keys;
}

// Load system values at fixture initialization
async function loadSystemValues(): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  const keys = collectSystemKeys(system);
  
  // Load all system keys
  for (const key of keys) {
    try {
      const value = await load(key as any);
      if (value !== undefined) {
        values[key] = value;
      }
    } catch {
      // Key might not exist in dataStore.json yet, skip
    }
  }

  return values;
}

// System values are loaded once and cached
let systemValuesCache: Record<string, unknown> | null = null;

export const systemFixtures = {
  systemValues: async ({}, use: (values: Record<string, unknown>) => Promise<void>) => {
    if (!systemValuesCache) {
      systemValuesCache = await loadSystemValues();
    }
    await use(systemValuesCache);
  },
};
