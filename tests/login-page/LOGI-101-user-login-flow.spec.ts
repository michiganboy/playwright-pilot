import { test, expect } from "../fixtures/test-fixtures";
import * as factories from "../../src/testdata/factories";
import { load } from "../../src/utils/dataStore";

// ---
// Tests for User Login Flow
// Feature: login-page
// Tag: @login-page
// ADO Plan ID: 2
// ADO Suite IDs: 16
// ---

test.describe.serial("LOGI-101 - User Login Flow @login-page", () => {
  test("[10001] Login with valid credentials", async ({ page, autoPilot }) => {
    await test.step("Login to application", async () => {
      await autoPilot.login();
    });

    await test.step("Verify successful login", async () => {
      // Example assertions:
      await expect(page).toHaveURL(/dashboard/);
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });
  });

  test("[10002] invalid password", async ({ loginPage, page }) => {
    const pilot = loginPage.toLoginPilot();

    await test.step("Attempt login with invalid password", async () => {
      await pilot.goto();
      await pilot.submit("user@test.com", "wrong-password");
    });

    await test.step("Verify failed login message", async () => {
      // Example assertions:
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText("Invalid credentials");
    });
  });

  // Example: Using factories to create test data
  // test("[10003] Create new user", async ({ userPage }) => {
  //   const user = factories.createUser();
  //   await set("test.user", user);
  //   const userData = await get("test.user");
  //   if (!userData) {
  //     throw new Error("User data not found in data store.");
  //   }
  //
  //   await test.step("Navigate to User Page", async () => {
  //     await userPage.navigateToUser();
  //   });
  //
  //   await test.step("Enter user data and create User", async () => {
  //     // await userPage.fillFirstName(userData.firstName);
  //     // await userPage.fillLastName(userData.lastName);
  //     // await userPage.fillEmail(userData.email);
  //     // await userPage.clickCreateButton();
  //   });
  // });
});
