// Defines cross-application actions such as login and navigation.
import type { Page } from "@playwright/test";
import { E2eTestFlowsPage } from "../pages/e2e-test-flows/E2eTestFlowsPage";

// Provides reusable actions that apply across multiple areas of the application.
export class GlobalActions {
  private locators = {
    logoutButton: '[data-testid="logout"]',
    appReadyIndicator: '[data-testid="app-ready"]',
  };

  private loginPage: E2eTestFlowsPage;

  constructor(private page: Page) {
    this.loginPage = new E2eTestFlowsPage(page);
  }

  // Logs into the application using the login form and provided credentials.
  async login(username?: string, password?: string) {
    const loginUsername = username || process.env.LOGIN_EMAIL;
    const loginPassword = password || process.env.LOGIN_PASSWORD;

    if (!loginUsername || !loginPassword) {
      throw new Error(
        "Login credentials are required. Set LOGIN_EMAIL and LOGIN_PASSWORD in .env file or pass as parameters."
      );
    }

    await this.loginPage.navigateToE2eTestFlows();
    await this.loginPage.enterLoginCredentials(loginUsername, loginPassword);
    await this.loginPage.clickSubmitButton();
    await this.waitForAppReady();
  }

  // Logs out of the application and waits for redirect to the login page.
  async logout() {
    await this.page.locator(this.locators.logoutButton).click();
    await this.page.waitForURL("**/login", { timeout: 5000 });
  }

  // Navigates to the specified path within the application.
  async navigateTo(path: string) {
    await this.page.goto(path);
  }

  // Waits for the application to be ready by checking for the app-ready indicator.
  async waitForAppReady() {
    await this.page.locator(this.locators.appReadyIndicator).waitFor({ timeout: 10000 });
  }
}
