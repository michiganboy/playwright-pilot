// Tests for {{description}}.
// Feature: {{featureKey}}
// Tag: {{tag}}
// ADO Plan ID: {{planId}}
// ADO Suite IDs: {{suites}}
import { test } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("{{specId}} - {{description}} {{tag}}", () => {
  test("[{{testId1}}] setup test data", async () => {
    await factories.createUser().save("{{featureKey}}.user");
  });

  test("[{{testId2}}] {{description}} flow", async ({ {{pageFixture}} }) => {
    const user = await load("{{featureKey}}.user");
    if (!user) {
      throw new Error("User data not found in data store.");
    }

    await test.step("Navigate to {{description}}", async () => {
      await {{pageFixture}}.navigate();
    });

    await test.step("Perform action", async () => {
      // TODO: Add your test steps here
    });
  });
});
