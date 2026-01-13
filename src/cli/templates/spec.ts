import { test } from "../fixtures/test-fixtures";
import * as factories from "../../src/testdata/factories";
import type * as models from "../../src/testdata/models";

// ---
// Tests for {{description}}
// Feature: {{featureKey}}
// Tag: {{tag}}
// ADO Plan ID: {{planId}}
// ADO Suite IDs: {{suites}}
// ---

test.describe.serial("{{specId}} - {{description}} {{tag}}", () => {
  test("[{{testId}}] {{description}} flow", async ({ {{pageFixture}}, set, get }) => {
    const user = factories.createUser();
    await set("test.user", user);
    const userData = await get<models.User>("test.user");
    if (!userData) {
      throw new Error("User data not found in data store.");
    }

    await test.step("Navigate to {{description}}", async () => {
      await {{pageFixture}}.{{navigateMethod}}();
    });

    await test.step("Perform action", async () => {
      // Your code here...
    });
  });
  {{testExamples}}
});
