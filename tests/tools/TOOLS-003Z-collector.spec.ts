import { test, expect } from "../fixtures/test-fixtures";

// ---
// Collector for Multi-Worker Collision Detection
// Feature: tools
// Tag: @tools
// ---

// Configuration for bounded wait
const WAIT_TIMEOUT_MS = 2500; // Max time to wait for all entries
const POLL_INTERVAL_MS = 100; // Poll interval

interface ManifestEntry {
  fileLetter: string;
  testIndex: number;
  workerIndex: number;
}

interface DataEntry {
  id: string;
  email: string;
  workerIndex: number;
  fileLetter: string;
  testIndex: number;
}

test.describe("TOOLS-003Z - Collector @tools", () => {
  test("TOOLS-003-COLLECT validate no collisions across workers", async ({ get }) => {
    // ─────────────────────────────────────────────────────────────────
    // STEP 1: Read manifest to determine expected entry count
    // ─────────────────────────────────────────────────────────────────
    const fileLetters = ["A", "B", "C", "D"];
    const testIndexes = [0, 1];

    const manifestEntries: ManifestEntry[] = [];
    for (const fileLetter of fileLetters) {
      for (const testIndex of testIndexes) {
        const manifestKey = `test.tools003.manifest.${fileLetter}.${testIndex}` as `test.${string}`;
        const entry = await get<ManifestEntry>(manifestKey);
        if (entry) {
          manifestEntries.push(entry);
        }
      }
    }

    const expectedCount = manifestEntries.length;
    console.log(`[TOOLS-003] Manifest entries found: ${expectedCount}`);
    console.log(`[TOOLS-003] Expected tests: ${manifestEntries.map(e => `${e.fileLetter}.${e.testIndex}`).join(", ")}`);

    if (expectedCount === 0) {
      throw new Error(
        `[TOOLS-003] No manifest entries found. Ensure writers ran first.\n` +
        `Run: PILOT_SEED=12345 PILOT_KEEP_RUNSTATE=true npm run test -- --grep="TOOLS-003-WRITE|TOOLS-003-COLLECT" --reporter=list --workers=4`
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 2: Poll for data entries with bounded timeout
    // ─────────────────────────────────────────────────────────────────
    const collectEntries = async (): Promise<DataEntry[]> => {
      const entries: DataEntry[] = [];
      for (let workerIndex = 0; workerIndex < 4; workerIndex++) {
        for (const fileLetter of fileLetters) {
          for (const testIndex of testIndexes) {
            const key = `test.runState.worker.${workerIndex}.user.${fileLetter}.${testIndex}` as `test.${string}`;
            const data = await get<DataEntry>(key);
            if (data) {
              entries.push(data);
            }
          }
        }
      }
      return entries;
    };

    let collectedEntries: DataEntry[] = [];
    const startTime = Date.now();

    while (Date.now() - startTime < WAIT_TIMEOUT_MS) {
      collectedEntries = await collectEntries();
      
      if (collectedEntries.length >= expectedCount) {
        console.log(`[TOOLS-003] All ${expectedCount} expected entries found after ${Date.now() - startTime}ms`);
        break;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 3: Verify all expected entries arrived
    // ─────────────────────────────────────────────────────────────────
    if (collectedEntries.length < expectedCount) {
      // Find missing entries
      const collectedKeys = new Set(
        collectedEntries.map(e => `${e.fileLetter}.${e.testIndex}`)
      );
      const expectedKeys = manifestEntries.map(e => `${e.fileLetter}.${e.testIndex}`);
      const missingKeys = expectedKeys.filter(k => !collectedKeys.has(k));

      throw new Error(
        `[TOOLS-003] TIMEOUT: Expected ${expectedCount} entries but only found ${collectedEntries.length} after ${WAIT_TIMEOUT_MS}ms.\n` +
        `Missing entries: ${missingKeys.join(", ")}\n` +
        `Found entries: ${Array.from(collectedKeys).join(", ")}\n` +
        `This may indicate writers did not complete or runState was not persisted.`
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 4: Calculate summary metrics
    // ─────────────────────────────────────────────────────────────────
    const uniqueWorkerIndexes = new Set(collectedEntries.map((e) => e.workerIndex));
    const observedWorkerCount = uniqueWorkerIndexes.size;
    const totalEntries = collectedEntries.length;
    const uniqueIdEmailPairs = new Set(collectedEntries.map((e) => `${e.id}|${e.email}`));
    const uniqueIdEmailCount = uniqueIdEmailPairs.size;

    // Log summary for quick diagnosis
    console.log("[TOOLS-003] Summary:");
    console.log(`  Expected entries: ${expectedCount}`);
    console.log(`  Total entries found: ${totalEntries}`);
    console.log(`  Distinct workers detected: ${observedWorkerCount}`);
    console.log(`  Unique (id,email) count: ${uniqueIdEmailCount}`);

    // Log detailed entries if needed for debugging
    console.log("[TOOLS-003] Collected entries:", JSON.stringify(collectedEntries, null, 2));
    console.log("[TOOLS-003] Unique worker indexes:", Array.from(uniqueWorkerIndexes).sort());

    // Fail if we only see one worker (user needs to run writers with --workers=4)
    if (observedWorkerCount < 2) {
      throw new Error(
        `[TOOLS-003] Only one worker detected. Ensure you ran writers with --workers=4.\n` +
        `Run: PILOT_SEED=12345 PILOT_KEEP_RUNSTATE=true npm run test -- --grep="TOOLS-003-WRITE|TOOLS-003-COLLECT" --reporter=list --workers=4`
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 5: Check for collisions (same id/email across different workers)
    // ─────────────────────────────────────────────────────────────────
    const collisions: Array<{
      id: string;
      email: string;
      workers: number[];
    }> = [];

    // Group entries by (id, email) pair
    const entryMap = new Map<string, number[]>();
    for (const entry of collectedEntries) {
      const key = `${entry.id}|${entry.email}`;
      if (!entryMap.has(key)) {
        entryMap.set(key, []);
      }
      entryMap.get(key)!.push(entry.workerIndex);
    }

    // Find collisions (same id/email across different workers)
    for (const [key, workerIndexes] of entryMap.entries()) {
      const uniqueWorkers = new Set(workerIndexes);
      if (uniqueWorkers.size > 1) {
        const [id, email] = key.split("|");
        collisions.push({
          id,
          email,
          workers: Array.from(uniqueWorkers).sort(),
        });
      }
    }

    console.log("[TOOLS-003] Collision analysis:", {
      collisionsFound: collisions.length,
      collisions: collisions,
    });

    // Fail if collisions exist
    if (collisions.length > 0) {
      const collisionDetails = collisions
        .map(
          (c) =>
            `  - id="${c.id}" email="${c.email}" appeared in workers: [${c.workers.join(", ")}]`
        )
        .join("\n");
      throw new Error(
        `[TOOLS-003] COLLISION DETECTED: Found ${collisions.length} collision(s) across workers.\n` +
        `The same (id, email) pairs were generated by different workers:\n${collisionDetails}\n` +
        `This indicates the seeding strategy does NOT differentiate by worker index.`
      );
    }

    // If we get here, no collisions were found
    expect(collisions.length).toBe(0);
    console.log("[TOOLS-003] ✓ No collisions detected across workers");
  });
});
