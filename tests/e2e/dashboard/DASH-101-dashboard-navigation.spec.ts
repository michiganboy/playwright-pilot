// Tests the dashboard navigation and basic functionality.
import { test } from "../../fixtures/test-fixtures";

test.describe.serial("DASH-101 - Dashboard navigation @dashboard", () => {
  test("[50001] view dashboard", async ({ dashboardPage, globalActions }) => {
    await globalActions.login();
    await dashboardPage.navigateToDashboard();
  });

  test("[50002] verify dashboard elements", async ({
    dashboardPage,
    globalActions,
  }) => {
    await globalActions.login();
    await dashboardPage.navigateToDashboard();

    const welcomeMessage = await dashboardPage.getWelcomeMessage();
    const statsCount = await dashboardPage.getStatsCardCount();

    // Verify dashboard is loaded with expected elements
    if (!welcomeMessage) {
      throw new Error("Welcome message not found on dashboard");
    }
  });
});
