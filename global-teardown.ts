import { clearRunState } from "./src/utils/dataStore";

async function globalTeardown() {
  // Clear run state at the end of the run (unless PILOT_KEEP_RUNSTATE=true)
  if (process.env.PILOT_KEEP_RUNSTATE === "true") {
    console.log("[PILOT] Keeping existing runState (PILOT_KEEP_RUNSTATE=true)");
  } else {
    // Clear run state at the end of the run (optional - it's also cleared at start)
    await clearRunState();
  }
}

export default globalTeardown;
