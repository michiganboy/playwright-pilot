// Page object for site manager UI interactions.
import type { Page } from "@playwright/test";

// Encapsulates interactions with the site manager UI.
export class SiteManagerPage {
  private locators = {
    siteLink: (siteId: string) => `[data-testid="site-${siteId}"]`,
  };

  constructor(private page: Page) {}

  async navigateToDashboard() {
    await this.page.goto("/sitemanager/dashboard");
  }

  async viewSiteDetails(siteId: string) {
    await this.page.locator(this.locators.siteLink(siteId)).click();
  }
}
