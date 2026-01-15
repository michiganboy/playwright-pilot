// Defines cross-application actions such as login and navigation.
import type { Page } from "@playwright/test";
import type { MfaHelper, SystemUser, LoginOptions } from "../integrations/mailosaur/types";

export type LoginPilot = {
  // Navigates to the login page (or ensures the login form is visible).
  goto(): Promise<void>;

  // Performs the login interaction using provided credentials.
  submit(username: string, password: string): Promise<void>;

  // Optional: Handles MFA channel selection if the UI prompts for it.
  // Should select the option matching the provided channel.
  // If not implemented, AutoPilot will attempt a default approach.
  selectMfaChannel?(channel: "email" | "sms"): Promise<void>;

  // Optional: Submits the OTP code when prompted.
  // If not implemented, AutoPilot will attempt a default approach.
  submitOtp?(code: string): Promise<void>;
};

// Provides reusable actions that apply across multiple areas of the application.
export class AutoPilot {
  private locators = {
    logoutButton: '[data-testid="logout"]',
    appReadyIndicator: '[data-testid="app-ready"]',
    // Default OTP input locator (override via LoginPilot.submitOtp if different)
    otpInput: '[data-testid="otp-input"], input[name="otp"], input[type="tel"][maxlength="6"]',
    otpSubmit: '[data-testid="otp-submit"], button[type="submit"]',
  };

  constructor(
    private page: Page,
    private loginPilot?: LoginPilot,
    private mfaHelper?: MfaHelper
  ) {}

  // Logs into the application using the configured login pilot.
  // Accepts either username/password strings (legacy) or a SystemUser object.
  async login(userOrUsername?: string | SystemUser, passwordOrOptions?: string | LoginOptions): Promise<void> {
    if (!this.loginPilot) {
      throw new Error(
        "Login is not configured. Provide a LoginPilot implementation in your fixtures to enable autoPilot.login()."
      );
    }

    // Determine if this is a SystemUser object or legacy string parameters
    const isSystemUser = typeof userOrUsername === "object" && userOrUsername !== null;

    let loginUsername: string;
    let loginPassword: string;
    let loginOptions: LoginOptions | undefined;

    if (isSystemUser) {
      const user = userOrUsername as SystemUser;
      loginUsername = user.username || user.email || "";
      loginPassword = process.env.LOGIN_PASSWORD || "";
      loginOptions = typeof passwordOrOptions === "object" ? passwordOrOptions : undefined;

      if (!loginUsername) {
        throw new Error("SystemUser must have username or email defined for login.");
      }
    } else {
      loginUsername = (userOrUsername as string) || process.env.LOGIN_EMAIL || "";
      loginPassword = (passwordOrOptions as string) || process.env.LOGIN_PASSWORD || "";
    }

    if (!loginUsername || !loginPassword) {
      throw new Error(
        "Login credentials are required. Set LOGIN_EMAIL and LOGIN_PASSWORD in .env file or pass as parameters."
      );
    }

    await this.loginPilot.goto();
    const loginUrl = this.page.url();
    await this.loginPilot.submit(loginUsername, loginPassword);

    // Handle MFA if user has Mailosaur provider configured
    if (isSystemUser) {
      const user = userOrUsername as SystemUser;
      if (user.mfa?.provider === "mailosaur") {
        await this.handleMailosaurMfa(user, loginOptions);
      }
    }

    await this.waitForAppReady(loginUrl);
  }

  // Handles Mailosaur MFA flow.
  private async handleMailosaurMfa(user: SystemUser, options?: LoginOptions): Promise<void> {
    if (!this.mfaHelper) {
      throw new Error(
        "MFA helper is not configured. Mailosaur integration is required for MFA users. " +
          "Ensure MAILOSAUR_API_KEY and MAILOSAUR_SERVER_ID are set."
      );
    }

    // Resolve which channel to use
    const channel = this.mfaHelper.resolveChannel(user, options?.mfaChannel);
    const sentTo = this.mfaHelper.getSentTo(user, channel);

    // Handle channel selection if UI prompts for it
    if (this.loginPilot?.selectMfaChannel) {
      try {
        await this.loginPilot.selectMfaChannel(channel);
      } catch (error) {
        // Channel selection may not be required if user has single channel
        // Log but continue - the UI might auto-select
        console.debug(`MFA channel selection skipped or failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Wait for OTP from Mailosaur
    const otpResult = await this.mfaHelper.waitForOtp(sentTo);

    // Submit OTP
    if (this.loginPilot?.submitOtp) {
      await this.loginPilot.submitOtp(otpResult.code);
    } else {
      // Default OTP submission approach
      await this.defaultSubmitOtp(otpResult.code);
    }
  }

  // Default OTP submission when LoginPilot doesn't provide submitOtp.
  private async defaultSubmitOtp(code: string): Promise<void> {
    // TODO: Implement default OTP submission for your application.
    // This is a placeholder that attempts common patterns.
    // For production use, implement LoginPilot.submitOtp() in your page layer.

    try {
      // Wait for OTP input to appear
      const otpInput = this.page.locator(this.locators.otpInput).first();
      await otpInput.waitFor({ timeout: 10000 });
      await otpInput.fill(code);

      // Look for submit button
      const submitButton = this.page.locator(this.locators.otpSubmit).first();
      await submitButton.click();
    } catch (error) {
      throw new Error(
        `Default OTP submission failed. Implement LoginPilot.submitOtp() for your application. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
