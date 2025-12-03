// Extends Playwright test with typed fixtures for page objects and shared helpers.
import { test as base, expect } from "@playwright/test";
import { EnrollmentPage } from "../../src/pages/enrollment/EnrollmentPage";
import { AppointmentPage } from "../../src/pages/appointments/AppointmentPage";
import { SiteManagerPage } from "../../src/pages/sitemanager/SiteManagerPage";
import { LoginPage } from "../../src/pages/login/LoginPage";
import { GlobalActions } from "../../src/utils/globalActions";

type Fixtures = {
  enrollmentPage: EnrollmentPage;
  appointmentPage: AppointmentPage;
  siteManagerPage: SiteManagerPage;
  loginPage: LoginPage;
  globalActions: GlobalActions;
};

export const test = base.extend<Fixtures>({
  enrollmentPage: async ({ page }, use) => {
    await use(new EnrollmentPage(page));
  },
  appointmentPage: async ({ page }, use) => {
    await use(new AppointmentPage(page));
  },
  siteManagerPage: async ({ page }, use) => {
    await use(new SiteManagerPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  globalActions: async ({ page }, use) => {
    await use(new GlobalActions(page));
  },
});

export { expect };
