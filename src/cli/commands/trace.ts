// Trace command for opening Playwright HTML report.
import { execSync, type ExecSyncOptions } from "child_process";

/**
 * Executor function for running commands - can be overridden for testing.
 */
export let traceCommandExecutor = (command: string, options: ExecSyncOptions): void => {
  execSync(command, options);
};

/**
 * Sets the command executor (for testing).
 */
export function setTraceCommandExecutor(executor: (command: string, options: ExecSyncOptions) => void): void {
  traceCommandExecutor = executor;
}

/**
 * Resets the command executor to default (for testing cleanup).
 */
export function resetTraceCommandExecutor(): void {
  traceCommandExecutor = (command: string, options: ExecSyncOptions): void => {
    execSync(command, options);
  };
}

/**
 * Opens the Playwright HTML report in the browser.
 */
export async function openReport(): Promise<void> {
  try {
    traceCommandExecutor("npx playwright show-report", { stdio: "inherit" });
  } catch (err) {
    throw new Error(`Failed to open report: ${err instanceof Error ? err.message : String(err)}`);
  }
}
