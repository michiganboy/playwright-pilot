// Main test fixtures entrypoint.
import { test as base, expect } from "@playwright/test";
import { AutoPilot, type LoginPilot } from "../../src/utils/autoPilot";
import { dataStoreFixtures } from "./dataStore";
import { systemFixtures } from "./system";
import { setTestContext, clearTestContext } from "../../src/testdata/tools/context";
import type { set as setFn, get as getFn } from "../../src/utils/dataStore";

type Fixtures = {
  autoPilot: AutoPilot;
  loginPilot: LoginPilot;
  set: typeof setFn;
  get: typeof getFn;
  systemValues: Record<string, unknown>;
};

export const test = base.extend<Fixtures>({
  // Per-test seed initialization (A2 strategy)
  // Extend page fixture to initialize seed with worker index for cross-worker uniqueness
  page: async ({ page: basePage }, use, testInfo) => {
    // Use testId if available, otherwise fallback to titlePath
    const testIdentifier = testInfo.testId || testInfo.titlePath.join(" > ");
    const workerIndex = testInfo.workerIndex;
    setTestContext(testIdentifier, workerIndex);
    try {
      await use(basePage);
    } finally {
      clearTestContext();
    }
  },

  loginPilot: async ({ }, use) => {
    const pilot: LoginPilot = {
      async goto() {
        throw new Error(
          "Login is not configured. Provide a LoginPilot implementation in your fixtures to enable autoPilot.login()."
        );
      },
      async submit() {
        throw new Error(
          "Login is not configured. Provide a LoginPilot implementation in your fixtures to enable autoPilot.login()."
        );
      },
    };

    await use(pilot);
  },

  autoPilot: async ({ page, loginPilot }, use) => {
    await use(new AutoPilot(page, loginPilot));
  },

  // DataStore fixtures
  ...dataStoreFixtures,

  // System fixtures
  ...systemFixtures,
});

export { expect };
