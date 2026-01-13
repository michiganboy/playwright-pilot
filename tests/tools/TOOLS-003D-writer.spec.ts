import { test } from "../fixtures/test-fixtures";
import * as factories from "../../src/testdata/factories";

// ---
// Writer D for Multi-Worker Collision Detection
// Feature: tools
// Tag: @tools
// ---

test.describe("TOOLS-003D - Writer D @tools", () => {
  test("TOOLS-003-WRITE D.0", async ({ set }, testInfo) => {
    const user = factories.createUser();
    const workerIndex = testInfo.workerIndex;
    const fileLetter = "D";
    const testIndex = 0;

    // Write manifest entry (tracks which tests ran, keyed by fileLetter.testIndex)
    const manifestKey = `test.tools003.manifest.${fileLetter}.${testIndex}` as `test.${string}`;
    await set(manifestKey, { fileLetter, testIndex, workerIndex });

    // Write the actual data entry (keyed by workerIndex for collision detection)
    const dataKey = `test.runState.worker.${workerIndex}.user.${fileLetter}.${testIndex}` as `test.${string}`;
    await set(dataKey, {
      id: user.id,
      email: user.email,
      workerIndex,
      fileLetter,
      testIndex,
    });

    console.log(`[TOOLS-003] WRITE ${fileLetter}.${testIndex} worker ${workerIndex} =>`, {
      id: user.id,
      email: user.email,
    });
  });

  test("TOOLS-003-WRITE D.1", async ({ set }, testInfo) => {
    const user = factories.createUser();
    const workerIndex = testInfo.workerIndex;
    const fileLetter = "D";
    const testIndex = 1;

    // Write manifest entry (tracks which tests ran, keyed by fileLetter.testIndex)
    const manifestKey = `test.tools003.manifest.${fileLetter}.${testIndex}` as `test.${string}`;
    await set(manifestKey, { fileLetter, testIndex, workerIndex });

    // Write the actual data entry (keyed by workerIndex for collision detection)
    const dataKey = `test.runState.worker.${workerIndex}.user.${fileLetter}.${testIndex}` as `test.${string}`;
    await set(dataKey, {
      id: user.id,
      email: user.email,
      workerIndex,
      fileLetter,
      testIndex,
    });

    console.log(`[TOOLS-003] WRITE ${fileLetter}.${testIndex} worker ${workerIndex} =>`, {
      id: user.id,
      email: user.email,
    });
  });
});
