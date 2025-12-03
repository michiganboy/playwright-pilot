// Tests the appointment booking flow using shared test data.
import { test } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("APPT-101 - Appointment booking @appointments", () => {
  test("[20001] create base user profile", async () => {
    await factories.createUser().save("appointments.user");
  });

  test("[20002] book appointment", async ({ appointmentPage }) => {
    const user = await load("appointments.user");
    if (!user) {
      throw new Error("User data not found in data store.");
    }

    await appointmentPage.openBooking();
    await appointmentPage.fillCustomerDetails(user);
    await appointmentPage.selectTimeSlot();
    await appointmentPage.confirmBooking();
  });
});

