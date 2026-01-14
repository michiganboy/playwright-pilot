import { clearRunState } from "./src/utils/dataStore";
import { deleteFactoryForTest, factoryExistsForTest } from "./src/cli/utils/factoryTestUtils";

async function globalTeardown() {
  // Clear run state at the end of the run (unless PILOT_KEEP_RUNSTATE=true)
  if (process.env.PILOT_KEEP_RUNSTATE === "true") {
    console.log("[PILOT] Keeping existing runState (PILOT_KEEP_RUNSTATE=true)");
  } else {
    // Clear run state at the end of the run (optional - it's also cleared at start)
    await clearRunState();
  }

  // Clean up User factory if we created it during setup
  // Only delete if it exists and was created by setup (not pre-existing)
  if ((global as any).__PILOT_CREATED_USER_FACTORY__ && factoryExistsForTest("user")) {
    console.log("[PILOT] Cleaning up User factory...");
    await deleteFactoryForTest("user");
    console.log("[PILOT] ✓ User factory deleted");
  }
}

export default globalTeardown;
