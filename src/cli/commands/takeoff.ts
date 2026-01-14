// Takeoff command - executes the resolved test plan.
// Takeoff executes responsibility. Does not validate or inspect.
import { spawnSync, type SpawnSyncOptions } from "child_process";
import { REPO_ROOT } from "../utils/paths";
import {
  createLogFilePath,
  writeLogHeader,
  appendToLog,
  writeLogFooter,
  formatDuration,
} from "../utils/preflightLogger";

/**
 * Suite execution definition.
 */
export interface SuiteDefinition {
  name: string;
  grep: string;
}

/**
 * Suite execution result.
 */
export interface SuiteResult {
  suiteNumber: number;
  suiteName: string;
  passed: boolean;
  durationMs: number;
  output: string;
  exitCode: number | null;
}

/**
 * Takeoff options.
 */
export interface TakeoffOptions {
  suites?: string[];
  workers?: number;
  seed?: string;
}

/**
 * Command executor - can be overridden for testing.
 */
export let takeoffExecutor = (command: string, options: SpawnSyncOptions): { stdout: string; stderr: string; exitCode: number | null } => {
  const isWindows = process.platform === "win32";
  const shell = isWindows ? true : "/bin/sh";
  const result = spawnSync(command, [], {
    ...options,
    shell,
    encoding: "utf-8",
  });
  return {
    stdout: result.stdout?.toString() || "",
    stderr: result.stderr?.toString() || "",
    exitCode: result.status,
  };
};

/**
 * Sets the takeoff executor (for testing).
 */
export function setTakeoffExecutor(executor: (command: string, options: SpawnSyncOptions) => { stdout: string; stderr: string; exitCode: number | null }): void {
  takeoffExecutor = executor;
}

/**
 * Resets the takeoff executor to default (for testing cleanup).
 */
export function resetTakeoffExecutor(): void {
  takeoffExecutor = (command: string, options: SpawnSyncOptions): { stdout: string; stderr: string; exitCode: number | null } => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? true : "/bin/sh";
    const result = spawnSync(command, [], {
      ...options,
      shell,
      encoding: "utf-8",
    });
    return {
      stdout: result.stdout?.toString() || "",
      stderr: result.stderr?.toString() || "",
      exitCode: result.status,
    };
  };
}

/**
 * Runs takeoff - executes the test plan.
 * Returns true if all suites passed, false otherwise.
 */
export async function runTakeoff(options: TakeoffOptions = {}): Promise<boolean> {
  const LINE = "\u2500".repeat(70);
  const { 
    suites = ["all"], 
    workers = 4,
    seed = generateSeed()
  } = options;

  const logPath = createLogFilePath("takeoff");
  writeLogHeader(logPath, "takeoff");

  console.log("PILOT TAKEOFF");
  console.log(LINE);
  console.log("Executing flight plan");
  console.log();
  console.log(`Suites:     ${suites.join(", ")}`);
  console.log(`Workers:    ${workers}`);
  console.log(`Seed:       ${seed}`);
  console.log();

  const suiteResults: SuiteResult[] = [];
  const overallStart = Date.now();
  let allPassed = true;

  // Build and execute test command for each suite
  for (let i = 0; i < suites.length; i++) {
    const suiteName = suites[i];
    const suiteNumber = i + 1;
    const suiteStart = Date.now();

    // Build the Playwright command
    const command = buildTestCommand(suiteName, workers, seed);
    
    appendToLog(logPath, `\n${"=".repeat(70)}\nSuite: ${suiteName}\nCommand: ${command}\nStarted: ${new Date().toISOString()}\n${"=".repeat(70)}\n`);

    const spawnOptions: SpawnSyncOptions = {
      cwd: REPO_ROOT,
      env: { 
        ...process.env, 
        PILOT_SEED: seed,
        PILOT_KEEP_RUNSTATE: "true"
      },
    };

    const execResult = takeoffExecutor(command, spawnOptions);
    const durationMs = Date.now() - suiteStart;
    const output = execResult.stdout + execResult.stderr;
    const passed = execResult.exitCode === 0;

    appendToLog(logPath, output);
    appendToLog(logPath, `\nResult: ${passed ? "PASS" : "FAIL"}\nDuration: ${formatDuration(durationMs)}\nExit Code: ${execResult.exitCode}\n`);

    const result: SuiteResult = {
      suiteNumber,
      suiteName,
      passed,
      durationMs,
      output,
      exitCode: execResult.exitCode,
    };
    suiteResults.push(result);

    const status = passed ? "PASS" : "FAIL";
    console.log(formatSuiteResult(suiteNumber, suites.length, suiteName, status, durationMs));

    if (!passed) {
      allPassed = false;
    }
  }

  const totalDuration = Date.now() - overallStart;
  const passedCount = suiteResults.filter((r) => r.passed).length;
  const failedCount = suiteResults.filter((r) => !r.passed).length;
  
  writeLogFooter(logPath, passedCount, failedCount, totalDuration, allPassed);

  console.log(LINE);
  console.log();
  console.log(`Status:     ${allPassed ? "PASSED" : "FAILED"}`);
  console.log(`Duration:   ${formatDuration(totalDuration)}`);
  console.log(`Flight log: ${logPath}`);
  console.log();

  return allPassed;
}

/**
 * Builds the Playwright test command for a suite.
 */
function buildTestCommand(suite: string, workers: number, seed: string): string {
  if (suite === "all") {
    return `npm run test -- --workers=${workers}`;
  }
  // For named suites, use grep pattern
  return `npm run test -- --grep="@${suite}" --workers=${workers}`;
}

/**
 * Generates a random seed for test execution.
 */
function generateSeed(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Formats a suite result line for console output.
 */
function formatSuiteResult(suiteNumber: number, totalSuites: number, suiteName: string, status: string, durationMs: number): string {
  const suiteStr = `[${suiteNumber}/${totalSuites}]`;
  const duration = formatDuration(durationMs);
  const maxNameLength = 15;
  const truncatedName = suiteName.length > maxNameLength ? suiteName.slice(0, maxNameLength - 3) + "..." : suiteName;
  return `${suiteStr.padEnd(7)}  ${truncatedName.padEnd(maxNameLength)} ${status.padEnd(6)} ${duration}`;
}
