// Extends Playwright test with typed fixtures for page objects and shared helpers.
import { test as base, expect } from "@playwright/test";
import { GlobalActions } from "../../src/utils/globalActions";

type Fixtures = {
  globalActions: GlobalActions;
};

export const test = base.extend<Fixtures>({
  globalActions: async ({ page }, use) => {
    await use(new GlobalActions(page));
  },
});

export { expect };
