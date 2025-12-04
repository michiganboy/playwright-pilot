// Page object for dashboard UI interactions.
import type { Page } from "@playwright/test";

// Encapsulates interactions with the dashboard UI.
export class DashboardPage {
  private locators = {
    dashboardContainer: '[data-testid="dashboard"]',
    welcomeMessage: '//p[contains(text(),"Welcome back")]',
    statsCard: '[data-testid="stats-card"]',
    navigationMenu: '[data-testid="navigation-menu"]',
    userProfileButton: '[data-testid="user-profile"]',
    notificationsButton: '[data-testid="notifications"]',
    settingsButton: '[data-testid="settings"]',
  };

  constructor(private page: Page) { }

  async navigateToDashboard() {
    await this.page.goto("/dashboard");
    await this.page
      .locator(this.locators.dashboardContainer)
      .waitFor({ timeout: 10000 });
  }

  async waitForDashboardReady() {
    await this.page
      .locator(this.locators.dashboardContainer)
      .waitFor({ timeout: 10000 });
  }

  async getWelcomeMessage() {
    return await this.page.locator(this.locators.welcomeMessage).textContent();
  }

  async openUserProfile() {
    await this.page.locator(this.locators.userProfileButton).click();
  }

  async openNotifications() {
    await this.page.locator(this.locators.notificationsButton).click();
  }

  async openSettings() {
    await this.page.locator(this.locators.settingsButton).click();
  }

  async getStatsCardCount() {
    return await this.page.locator(this.locators.statsCard).count();
  }
}
