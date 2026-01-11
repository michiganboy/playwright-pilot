// Extends Playwright test with typed fixtures for page objects and shared helpers.
import { test as base, expect } from "@playwright/test";
import { GlobalActions, type LoginDriver } from "../../src/utils/globalActions";

type Fixtures = {
  globalActions: GlobalActions;
  loginDriver: LoginDriver;
};

export const test = base.extend<Fixtures>({
  loginDriver: async ({ }, use) => {
    const driver: LoginDriver = {
      async goto() {
        throw new Error(
          "Login is not configured. Provide a LoginDriver implementation in your fixtures to enable globalActions.login()."
        );
      },
      async submit() {
        throw new Error(
          "Login is not configured. Provide a LoginDriver implementation in your fixtures to enable globalActions.login()."
        );
      },
    };

    await use(driver);
  },


  globalActions: async ({ page, loginDriver }, use) => {
    await use(new GlobalActions(page, loginDriver));
  },
});

export { expect };

