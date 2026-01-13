// DataStore fixtures: set/get for test.* keys (runState.json).
import type { TestInfo } from "@playwright/test";
import { set, get } from "../../src/utils/dataStore";
import { setTestContext, clearTestContext } from "../../src/testdata/tools/context";

export const dataStoreFixtures = {
  // Initialize seed context before set/get are used (ensures factories have correct seed)
  set: async ({}, use: (value: typeof set) => Promise<void>, testInfo: TestInfo) => {
    // Use testId if available, otherwise fallback to titlePath
    const testIdentifier = testInfo.testId || testInfo.titlePath.join(" > ");
    const workerIndex = testInfo.workerIndex;
    setTestContext(testIdentifier, workerIndex);
    try {
      await use(set);
    } finally {
      clearTestContext();
    }
  },
  get: async ({}, use: (value: typeof get) => Promise<void>, testInfo: TestInfo) => {
    // Use testId if available, otherwise fallback to titlePath
    const testIdentifier = testInfo.testId || testInfo.titlePath.join(" > ");
    const workerIndex = testInfo.workerIndex;
    setTestContext(testIdentifier, workerIndex);
    try {
      await use(get);
    } finally {
      clearTestContext();
    }
  },
};
