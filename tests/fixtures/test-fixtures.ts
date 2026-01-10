// Extends Playwright test with typed fixtures for page objects and shared helpers.
import { test as base, expect } from "@playwright/test";
import { E2eTestFlowsPage } from "../../src/pages/e2e-test-flows/E2eTestFlowsPage";
import { GlobalActions } from "../../src/utils/globalActions";

type Fixtures = {
  globalActions: GlobalActions;
  e2eTestFlowsPage: E2eTestFlowsPage;
};

export const test = base.extend<Fixtures>({
  globalActions: async ({ page }, use) => {
    await use(new GlobalActions(page));
  },
  e2eTestFlowsPage: async ({ page }, use) => {
    await use(new E2eTestFlowsPage(page));
  },
});

export { expect };
