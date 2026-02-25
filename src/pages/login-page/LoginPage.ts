// Page object for login UI interactions.
import type { Page } from "@playwright/test";


// Encapsulates interactions with the login UI.
export class LoginPage {
  private locators = {
    // TODO: Add your locators here
    emailField: '[data-testid="input-email"]',
    passWordField: '[data-testid="input-password"]',
    loginButton: '[data-testid="btn-submit-login"]',
    loginTitle: '[data-testid="login-title"]',
  };

  constructor(private page: Page) { }

  // Navigates to the login page.
  async navigateToLogin() {
    await this.page.goto("/login");
    await this.page.locator(this.locators.loginTitle).waitFor({ timeout: 10000 });
  }

  // Performs a primary action on the page.
  async enterEmail(email: string) {
    await this.page.locator(this.locators.emailField).fill(email);
  }

  // Performs a secondary action on the page.
  async enterPassword(password: string) {
    await this.page.locator(this.locators.passWordField).fill(password);
  }

  async clickLoginButton() {
    await this.page.locator(this.locators.loginButton).click();
  }

  // Health check: verifies key elements are visible on the page.
  async healthCheck() {
    await this.page.locator(this.locators.loginTitle).waitFor({ timeout: 10000 });
    const isVisible = await this.page.locator(this.locators.loginTitle).isVisible();
    if (!isVisible) {
      throw new Error("LoginPage health check failed: login title not visible");
    }
  }

  // Creates a LoginPilot adapter for AutoPilot.login().
  toLoginPilot() {
    return {
      goto: async () => {
        await this.navigateToLogin();
      },
      submit: async (username: string, password: string) => {
        // TODO: Replace the error below with your login implementation.
        // Example:
        //   await this.enterUsername(username);
        //   await this.enterPassword(password);
        //   await this.clickLoginButton();
        await this.enterEmail(username);
        await this.enterPassword(password);
        await this.clickLoginButton();
      },
    };
  }

}
