import { test } from "../fixtures/test-fixtures";
import * as factories from "../../src/testdata/factories";
import { load } from "../../src/utils/dataStore";

// ---
// Tests for {{description}}
// Feature: {{featureKey}}
// Tag: {{tag}}
// ADO Plan ID: {{planId}}
// ADO Suite IDs: {{suites}}
// ---

test.describe.serial("{{specId}} - {{description}} {{tag}}", () => {
  test("[{{testId}}] {{description}} flow", async ({ {{pageFixture}} }) => {
    await factories.createUser().save("{{featureKey}}.user");
    const user = await load("{{featureKey}}.user");
    if (!user) {
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
