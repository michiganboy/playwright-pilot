import { test, expect } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

// ---
// Tests for Authentication
// Feature: e2e-test-flows
// Tag: @e2e-test-flows
// ADO Plan ID: 2
// ADO Suite IDs: 7
// ---

test.describe.serial("E2E--101 - Authentication @e2e-test-flows", () => {
  test("[8] Authentication flow", async ({ page, e2eTestFlowsPage }) => {
    const username = process.env.LOGIN_EMAIL;
    const password = process.env.LOGIN_PASSWORD;

    if (!username || !password) {
      throw new Error("LOGIN_EMAIL and LOGIN_PASSWORD environment variables are required");
    }

    await test.step("Navigate to Authentication", async () => {
      await e2eTestFlowsPage.navigateToE2eTestFlows();
    });

    await test.step("Enter login credentials", async () => {
      await e2eTestFlowsPage.enterLoginCredentials(username, password);
    });

    await test.step("Click submit button", async () => {
      await e2eTestFlowsPage.clickSubmitButton();
    });

    await test.step("Verify successful login", async () => {
      await expect(page).toHaveURL(/test/);
    });
  });
});
