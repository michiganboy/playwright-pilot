// Tests the site manager dashboard navigation and site detail views.
import { test } from "../../fixtures/test-fixtures";

test.describe.serial("SM-201 - Site manager dashboard @sitemanager", () => {
  test("[40001] view dashboard", async ({ siteManagerPage }) => {
    await siteManagerPage.navigateToDashboard();
  });

  test("[40002] view site details", async ({ siteManagerPage }) => {
    await siteManagerPage.navigateToDashboard();
    await siteManagerPage.viewSiteDetails("site-001");
  });
});

