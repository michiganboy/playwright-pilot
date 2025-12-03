// Page object for appointment-related UI interactions.
import type { Page } from "@playwright/test";
import type * as models from "../../testdata/models";

// Encapsulates interactions with the appointment booking UI.
export class AppointmentPage {
  private locators = {
    bookAppointmentButton: '[data-testid="book-appointment"]',
    firstNameField: '[data-testid="customer-firstName"]',
    lastNameField: '[data-testid="customer-lastName"]',
    emailField: '[data-testid="customer-email"]',
    phoneField: '[data-testid="customer-phone"]',
    timeSlotOption: '[data-testid="time-slot"]:first-child',
    confirmBookingButton: '[data-testid="confirm-booking"]',
    bookingConfirmedMessage: '[data-testid="booking-confirmed"]',
  };

  constructor(private page: Page) {}

  // Opens the appointment booking interface.
  async openBooking() {
    await this.page.goto("/appointments");
    await this.page.locator(this.locators.bookAppointmentButton).click();
  }

  // Fills customer information fields with the provided user data.
  async fillCustomerDetails(user: models.User) {
    await this.page.locator(this.locators.firstNameField).fill(user.firstName);
    await this.page.locator(this.locators.lastNameField).fill(user.lastName);
    await this.page.locator(this.locators.emailField).fill(user.email);
    await this.page.locator(this.locators.phoneField).fill(user.phone);
  }

  async selectTimeSlot() {
    await this.page.locator(this.locators.timeSlotOption).click();
  }

  // Confirms the appointment booking and waits for confirmation message.
  async confirmBooking() {
    await this.page.locator(this.locators.confirmBookingButton).click();
    await this.page.locator(this.locators.bookingConfirmedMessage).waitFor({ timeout: 5000 });
  }
}
