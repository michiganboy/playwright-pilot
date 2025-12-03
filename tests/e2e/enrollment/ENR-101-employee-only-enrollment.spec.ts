// Tests the employee-only enrollment flow.
import { test } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("ENR-101 - Employee-only enrollment @enrollment", () => {
  test("[30001] create base user profile", async () => {
    await factories.createUser().save("enrollment.user");
  });

  test("[30002] submit enrollment", async ({ globalActions, enrollmentPage }) => {
    await globalActions.login();

    const user = await load("enrollment.user");
    if (!user) {
      throw new Error("User data not found in data store.");
    }

    await enrollmentPage.startEnrollment(user);
    await enrollmentPage.submitEnrollment();
  });
});

