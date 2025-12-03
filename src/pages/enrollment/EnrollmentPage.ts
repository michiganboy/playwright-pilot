// Page object for enrollment-related UI interactions.
import type { Page } from "@playwright/test";
import type * as models from "../../testdata/models";

// Encapsulates interactions with the enrollment UI.
export class EnrollmentPage {
  private locators = {
    firstNameField: '[data-testid="firstName"]',
    lastNameField: '[data-testid="lastName"]',
    emailField: '[data-testid="email"]',
    phoneField: '[data-testid="phone"]',
    submitEnrollmentButton: '[data-testid="submit-enrollment"]',
    enrollmentSuccessMessage: '[data-testid="enrollment-success"]',
  };

  constructor(private page: Page) {}

  // Starts the enrollment flow for the given user by navigating and filling personal details.
  async startEnrollment(user: models.User) {
    await this.page.goto("/enrollment");
    await this.page.locator(this.locators.firstNameField).fill(user.firstName);
    await this.page.locator(this.locators.lastNameField).fill(user.lastName);
    await this.page.locator(this.locators.emailField).fill(user.email);
    await this.page.locator(this.locators.phoneField).fill(user.phone);
  }

  // Submits the enrollment form and waits for confirmation.
  async submitEnrollment() {
    await this.page.locator(this.locators.submitEnrollmentButton).click();
    await this.page.locator(this.locators.enrollmentSuccessMessage).waitFor({ timeout: 5000 });
  }
}
