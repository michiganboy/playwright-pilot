// Trace command for opening Playwright HTML report.
import { execSync } from "child_process";

/**
 * Opens the Playwright HTML report in the browser.
 */
export async function openReport(): Promise<void> {
  try {
    execSync("npx playwright show-report", { stdio: "inherit" });
  } catch (err) {
    throw new Error(`Failed to open report: ${err instanceof Error ? err.message : String(err)}`);
  }
}
