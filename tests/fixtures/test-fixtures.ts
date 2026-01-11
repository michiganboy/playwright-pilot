// Extends Playwright test with typed fixtures for page objects and shared helpers.
import { test as base, expect } from "@playwright/test";
import { AutoPilot, type LoginPilot } from "../../src/utils/autoPilot";

type Fixtures = {
  autoPilot: AutoPilot;
  loginPilot: LoginPilot;
};

export const test = base.extend<Fixtures>({
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
});

export { expect };

