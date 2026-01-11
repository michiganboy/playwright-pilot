// Defines cross-application actions such as login and navigation.
import type { Page } from "@playwright/test";

export type LoginPilot = {
  // Navigates to the login page (or ensures the login form is visible).
  goto(): Promise<void>;

  // Performs the login interaction using provided credentials.
  submit(username: string, password: string): Promise<void>;
};

// Provides reusable actions that apply across multiple areas of the application.
export class AutoPilot {
  private locators = {
    logoutButton: '[data-testid="logout"]',
    appReadyIndicator: '[data-testid="app-ready"]',
  };

  constructor(private page: Page, private loginPilot?: LoginPilot) { }

  // Logs into the application using the configured login pilot.
  async login(username?: string, password?: string) {
    if (!this.loginPilot) {
      throw new Error(
        "Login is not configured. Provide a LoginPilot implementation in your fixtures to enable autoPilot.login()."
      );
    }

    const loginUsername = username || process.env.LOGIN_EMAIL;
    const loginPassword = password || process.env.LOGIN_PASSWORD;

    if (!loginUsername || !loginPassword) {
      throw new Error(
        "Login credentials are required. Set LOGIN_EMAIL and LOGIN_PASSWORD in .env file or pass as parameters."
      );
    }

    await this.loginPilot.goto();
    const loginUrl = this.page.url();
    await this.loginPilot.submit(loginUsername, loginPassword);
    await this.waitForAppReady(loginUrl);
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
  // Falls back to waiting for URL change if the indicator doesn't exist.
  async waitForAppReady(initialUrl?: string) {
    try {
      await this.page.locator(this.locators.appReadyIndicator).waitFor({ timeout: 2000 });
    } catch (error) {
      // If app-ready indicator doesn't exist, wait for URL to change from initial URL
      // This indicates the login was successful and the app redirected
      if (initialUrl) {
        try {
          await this.page.waitForURL((url) => url.href !== initialUrl, { timeout: 8000 });
        } catch (urlError) {
          throw new Error(`Timeout waiting for appReadyIndicator locator: ${this.locators.appReadyIndicator}, and failed to detect URL change from ${initialUrl}. ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // Fallback: wait for URL to not include /login (for backward compatibility)
        try {
          await this.page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 8000 });
        } catch (urlError) {
          throw new Error(`Timeout waiting for appReadyIndicator locator: ${this.locators.appReadyIndicator}, and failed to detect URL change from login page. ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
}
