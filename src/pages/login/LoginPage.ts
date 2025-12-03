// Page object for the login screen and authentication flow.
import type { Page } from "@playwright/test";

// Encapsulates interactions with the login form.
export class LoginPage {
  private locators = {
    usernameField: '[data-testid="username"]',
    passwordField: '[data-testid="password"]',
    loginSubmitButton: '[data-testid="login-submit"]',
  };

  constructor(private page: Page) {}

  async navigateToLogin() {
    await this.page.goto("/login");
  }

  async fillUsername(username: string) {
    await this.page.locator(this.locators.usernameField).fill(username);
  }

  async fillPassword(password: string) {
    await this.page.locator(this.locators.passwordField).fill(password);
  }

  async submitLogin() {
    await this.page.locator(this.locators.loginSubmitButton).click();
  }

  // Logs into the application by navigating to the login page, filling credentials, and submitting.
  async login(username: string, password: string) {
    await this.navigateToLogin();
    await this.fillUsername(username);
    await this.fillPassword(password);
    await this.submitLogin();
  }
}
