// Global setup: seed initialization and run state clearing.
import { FullConfig } from "@playwright/test";
import { promises as fs } from "fs";
import path from "path";
import { clearRunState } from "./src/utils/dataStore";

async function globalSetup(config: FullConfig) {
  // Ensure test-results directory exists
  const testResultsDir = path.resolve(process.cwd(), "test-results");
  await fs.mkdir(testResultsDir, { recursive: true });

  // Clear run state at start of each run (unless PILOT_KEEP_RUNSTATE=true)
  if (process.env.PILOT_KEEP_RUNSTATE === "true") {
    console.log("[PILOT] Keeping existing runState (PILOT_KEEP_RUNSTATE=true)");
  } else {
    await clearRunState();
  }

  // Determine seed
  let seed: string;
  let seedMode: "forced" | "generated";

  if (process.env.PILOT_SEED) {
    seed = process.env.PILOT_SEED;
    seedMode = "forced";
  } else {
    // Generate seed once per run
    seed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    process.env.PILOT_SEED = seed;
    seedMode = "generated";
  }

  // Store seed in process for use during test execution
  (global as any).__PILOT_SEED__ = seed;
  (global as any).__PILOT_SEED_MODE__ = seedMode;
  (global as any).__PILOT_STARTED_AT__ = new Date().toISOString();
  (global as any).__PILOT_WORKERS__ = config.workers;
}

export default globalSetup;
