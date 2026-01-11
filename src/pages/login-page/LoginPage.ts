// Page object for login UI interactions.
import type { Page } from "@playwright/test";


// Encapsulates interactions with the login UI.
export class LoginPage {
  private locators = {
    // TODO: Add your locators here
    container: '[data-testid="login-container"]',
    primaryButton: '[data-testid="login-primary-button"]',
    secondaryButton: '[data-testid="login-secondary-button"]',
  };

  constructor(private page: Page) {}

  // Navigates to the login page.
  async navigateToLogin() {
    await this.page.goto("/login");
    await this.page.locator(this.locators.container).waitFor({ timeout: 10000 });
  }

  // Performs a primary action on the page.
  async performPrimaryAction() {
    await this.page.locator(this.locators.primaryButton).click();
  }

  // Performs a secondary action on the page.
  async performSecondaryAction() {
    await this.page.locator(this.locators.secondaryButton).click();
  }

  // Health check: verifies key elements are visible on the page.
  async healthCheck() {
    await this.page.locator(this.locators.container).waitFor({ timeout: 10000 });
    const isVisible = await this.page.locator(this.locators.container).isVisible();
    if (!isVisible) {
      throw new Error("LoginPage health check failed: container not visible");
    }
  }
  
  // Creates a LoginDriver adapter for GlobalActions.login().
  toLoginDriver() {
    return {
      goto: async () => {
        await this.navigateToLogin();
      },
      submit: async (username: string, password: string) => {
        throw new Error(
          "Login submission is not configured. Implement submit() in LoginPage.toLoginDriver() using your app's locators."
        );
      },
    };
  }

}
