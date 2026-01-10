// Page object for e2e test flows UI interactions.
import type { Page } from "@playwright/test";


// Encapsulates interactions with the e2e test flows UI.
export class E2eTestFlowsPage {
  private locators = {
    // TODO: Add your locators here
    loginTitle: '[data-testid="login-title"]',
    emailField: '[data-testid="input-email"]',
    passwordField: '[data-testid="input-password"]',
    submitButton: '[data-testid="btn-submit-login"]',
  };

  constructor(private page: Page) { }

  // Navigates to the e2e test flows page.
  async navigateToE2eTestFlows() {
    await this.page.goto("/login");
    await this.page.locator(this.locators.loginTitle).waitFor({ timeout: 10000 });
  }

  // Performs a primary action on the page.
  async enterLoginCredentials(username: string, password: string) {
    await this.page.locator(this.locators.emailField).fill(username);
    await this.page.locator(this.locators.passwordField).fill(password);
  }

  async clickSubmitButton() {
    await this.page.locator(this.locators.submitButton).click();
  }
}
