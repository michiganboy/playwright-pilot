// Page object for the login screen and authentication flow.
import type { Page } from "@playwright/test";

// Encapsulates interactions with the login form.
export class LoginPage {
  private locators = {
    emailField: '[id="email"]',
    passwordField: '[id="password"]',
    loginButton: '[type="submit"]',
    errorMessage: '//*[contains(text(),"Invalid login credentials")]',
  };

  constructor(private page: Page) { }

  async navigateToLogin() {
    await this.page.goto("/login");
  }

  async fillEmail(email: string) {
    await this.page.locator(this.locators.emailField).fill(email);
  }

  async fillPassword(password: string) {
    await this.page.locator(this.locators.passwordField).fill(password);
  }

  async submitLogin() {
    await this.page.locator(this.locators.loginButton).click();
  }

  async getErrorMessage() {
    return await this.page.locator(this.locators.errorMessage).textContent();
  }

  // Logs into the application by navigating to the login page, filling credentials, and submitting.
  async login(email: string, password: string) {
    await this.navigateToLogin();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submitLogin();
  }
}
