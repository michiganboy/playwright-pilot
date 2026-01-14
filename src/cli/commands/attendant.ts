// Health check command (attendant).
// Attendant is a HEALTH GATE - if it succeeds, the repo is in a known-good state.
import { readJsonSafe, readFileSafe, fileExists, dirExists } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { getSuiteIds, hasSuiteId } from "../../utils/featureConfig";
import { glob } from "fast-glob";
import path from "path";
import { execSync, spawnSync, type ExecSyncOptions, type SpawnSyncOptions } from "child_process";
import {
  createLogFilePath,
  writeLogHeader,
  writeStepHeader,
  appendToLog,
  writeStepResult,
  writeLogFooter,
  tailOutput,
  formatDuration,
  formatStepProgress,
  formatStepResult,
} from "../utils/attendantLogger";

/**
 * Attendant options.
 */
export interface AttendantOptions {
  verbose?: boolean;
}

/**
 * Test suite step definition for the health gate.
 */
export interface TestStep {
  name: string;
  command: string;
  env?: Record<string, string>;
}

/**
 * Step execution result.
 */
export interface StepResult {
  stepNumber: number;
  stepName: string;
  command: string;
  passed: boolean;
  durationMs: number;
  output: string;
  exitCode: number | null;
}

/**
 * The authoritative test suites that define framework correctness.
 * Attendant runs these in order; any failure stops immediately.
 */
export const ATTENDANT_TEST_STEPS: TestStep[] = [
  {
    name: "Full CLI + unit suite",
    command: "npm run test:cli -- --runInBand --verbose",
  },
  {
    name: "Suite command tests",
    command: "npm run test:cli -- --runInBand --verbose src/cli/__tests__/commands.suite.test.ts",
  },
  {
    name: "Namespace enforcement tests",
    command: "npm run test:cli -- --runInBand --verbose src/testdata/__tests__/namespace-enforcement.test.ts",
  },
  {
    name: "RunState lifecycle tests",
    command: "npm run test:cli -- --runInBand --verbose src/testdata/__tests__/runstate-lifecycle.test.ts",
  },
  {
    name: "Last-run metadata tests",
    command: "npm run test:cli -- --runInBand --verbose src/utils/__tests__/last-run-metadata.test.ts",
  },
  {
    name: "TOOLS-001 user defaults",
    command: 'npm run test -- --grep="TOOLS-001" --reporter=list',
    env: { PILOT_SEED: "12345", PILOT_KEEP_RUNSTATE: "true" },
  },
  {
    name: "TOOLS-002 tools surface",
    command: 'npm run test -- --grep="TOOLS-002" --reporter=list',
    env: { PILOT_SEED: "12345", PILOT_KEEP_RUNSTATE: "true" },
  },
  {
    name: "TOOLS-003 parallel determinism + collision stress",
    command: 'npm run test -- --grep="TOOLS-003-WRITE|TOOLS-003-COLLECT" --reporter=list --workers=4',
    env: { PILOT_SEED: "12345", PILOT_KEEP_RUNSTATE: "true" },
  },
];

/**
 * Executor function for running commands - can be overridden for testing.
 */
export let commandExecutor = (command: string, options: ExecSyncOptions): void => {
  execSync(command, options);
};

/**
 * Sets the command executor (for testing).
 */
export function setCommandExecutor(executor: (command: string, options: ExecSyncOptions) => void): void {
  commandExecutor = executor;
}

/**
 * Resets the command executor to default (for testing cleanup).
 */
export function resetCommandExecutor(): void {
  commandExecutor = (command: string, options: ExecSyncOptions): void => {
    execSync(command, options);
  };
}

/**
 * Quiet executor that captures output - can be overridden for testing.
 */
export let quietCommandExecutor = (command: string, options: SpawnSyncOptions): { stdout: string; stderr: string; exitCode: number | null } => {
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
 * Sets the quiet command executor (for testing).
 */
export function setQuietCommandExecutor(executor: (command: string, options: SpawnSyncOptions) => { stdout: string; stderr: string; exitCode: number | null }): void {
  quietCommandExecutor = executor;
}

/**
 * Resets the quiet command executor to default (for testing cleanup).
 */
export function resetQuietCommandExecutor(): void {
  quietCommandExecutor = (command: string, options: SpawnSyncOptions): { stdout: string; stderr: string; exitCode: number | null } => {
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

interface FeatureConfig {
  [key: string]: {
    tag: string;
    planId: number;
    suites: Record<string, string>;
  };
}

interface HealthCheckResult {
  type: "error" | "warning" | "info";
  message: string;
}

/**
 * Runs health checks on the framework structure.
 */
export async function runAttendant(options: AttendantOptions = {}): Promise<void> {
  const { verbose = false } = options;
  const results: HealthCheckResult[] = [];

  console.log("🔍 Running health checks...\n");

  // ─────────────────────────────────────────────────────────────────
  // PHASE 1: Static checks (feature config, directories, fixtures, exports)
  // ─────────────────────────────────────────────────────────────────

  await checkFeatureConfig(results);
  await checkTestDirectories(results);
  await checkPageFixtures(results);
  await checkFactoryExports(results);
  await checkSpecImports(results);

  // Print static check results
  console.log("\n📊 Static Check Results:\n");

  const errors = results.filter((r) => r.type === "error");
  const warnings = results.filter((r) => r.type === "warning");
  const infos = results.filter((r) => r.type === "info");

  if (errors.length > 0) {
    console.log("❌ Errors:\n");
    errors.forEach((r) => console.log(`   ${r.message}`));
    console.log();
  }

  if (warnings.length > 0) {
    console.log("⚠️  Warnings:\n");
    warnings.forEach((r) => console.log(`   ${r.message}`));
    console.log();
  }

  if (infos.length > 0) {
    console.log("ℹ️  Info:\n");
    infos.forEach((r) => console.log(`   ${r.message}`));
    console.log();
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ All static checks passed!\n");
  } else {
    console.log(`Summary: ${errors.length} error(s), ${warnings.length} warning(s)\n`);
    if (errors.length > 0) {
      throw new Error(`Static checks failed with ${errors.length} error(s)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PHASE 2: Run authoritative test suites (health gate)
  // ─────────────────────────────────────────────────────────────────

  console.log("🧪 Running authoritative test suites...\n");

  await runTestSuites({ verbose });

  // ─────────────────────────────────────────────────────────────────
  // SUCCESS: All checks passed
  // ─────────────────────────────────────────────────────────────────

  console.log("\n✅ Attendant check passed: CLI, testdata, utils, and TOOLS validated.\n");
}

/**
 * Runs the authoritative test suites sequentially.
 * In verbose mode: streams output live.
 * In quiet mode: captures output and shows progress indicators.
 */
export async function runTestSuites(options: AttendantOptions = {}): Promise<void> {
  const { verbose = false } = options;

  if (verbose) {
    await runTestSuitesVerbose();
  } else {
    await runTestSuitesQuiet();
  }
}

/**
 * Verbose mode: streams output live (original behavior).
 */
async function runTestSuitesVerbose(): Promise<void> {
  for (let i = 0; i < ATTENDANT_TEST_STEPS.length; i++) {
    const step = ATTENDANT_TEST_STEPS[i];
    const stepNumber = i + 1;

    console.log(`\n[Step ${stepNumber}/${ATTENDANT_TEST_STEPS.length}] ${step.name}`);
    console.log(`Command: ${step.command}\n`);

    try {
      const options: ExecSyncOptions = {
        cwd: REPO_ROOT,
        stdio: "inherit",
        env: step.env ? { ...process.env, ...step.env } : process.env,
      };

      commandExecutor(step.command, options);

      console.log(`✓ Step ${stepNumber} passed: ${step.name}\n`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Step ${stepNumber} FAILED: ${step.name}`);
      console.error(`   Command: ${step.command}`);
      console.error(`   Error: ${errorMsg}\n`);
      throw new Error(`Attendant failed at step ${stepNumber}: ${step.name}\nCommand: ${step.command}`);
    }
  }
}

/**
 * Quiet mode: captures output and shows clean progress.
 */
async function runTestSuitesQuiet(): Promise<void> {
  const logPath = createLogFilePath();
  writeLogHeader(logPath);

  const totalSteps = ATTENDANT_TEST_STEPS.length;
  const stepResults: StepResult[] = [];
  const overallStart = Date.now();

  console.log(`  Log file: ${logPath}\n`);
  console.log("─".repeat(70));

  for (let i = 0; i < totalSteps; i++) {
    const step = ATTENDANT_TEST_STEPS[i];
    const stepNumber = i + 1;

    // Log step header
    writeStepHeader(logPath, stepNumber, totalSteps, step.name, step.command);

    const stepStart = Date.now();
    let result: StepResult;

    try {
      const spawnOptions: SpawnSyncOptions = {
        cwd: REPO_ROOT,
        env: step.env ? { ...process.env, ...step.env } : process.env,
      };

      const execResult = quietCommandExecutor(step.command, spawnOptions);
      const durationMs = Date.now() - stepStart;
      const output = execResult.stdout + execResult.stderr;

      // Log output
      appendToLog(logPath, output);

      const passed = execResult.exitCode === 0;
      result = {
        stepNumber,
        stepName: step.name,
        command: step.command,
        passed,
        durationMs,
        output,
        exitCode: execResult.exitCode,
      };

      writeStepResult(logPath, stepNumber, step.name, passed, durationMs);

      // Show result
      console.log(`  ${formatStepResult(stepNumber, totalSteps, step.name, passed, durationMs)}`);

      if (!passed) {
        stepResults.push(result);
        printFailureSummary(result, logPath);
        throw new Error(`Attendant failed at step ${stepNumber}: ${step.name}`);
      }

      stepResults.push(result);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Attendant failed")) {
        throw error;
      }
      // Unexpected error during execution
      const durationMs = Date.now() - stepStart;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.log(`  ${formatStepResult(stepNumber, totalSteps, step.name, false, durationMs)}`);

      result = {
        stepNumber,
        stepName: step.name,
        command: step.command,
        passed: false,
        durationMs,
        output: errorMsg,
        exitCode: null,
      };
      stepResults.push(result);
      appendToLog(logPath, `\nError: ${errorMsg}\n`);
      writeStepResult(logPath, stepNumber, step.name, false, durationMs);

      printFailureSummary(result, logPath);
      throw new Error(`Attendant failed at step ${stepNumber}: ${step.name}\nCommand: ${step.command}`);
    }
  }

  // All steps passed
  const totalDuration = Date.now() - overallStart;
  const passed = stepResults.filter((r) => r.passed).length;
  const failed = stepResults.filter((r) => !r.passed).length;

  writeLogFooter(logPath, passed, failed, totalDuration);

  console.log("─".repeat(70));
  console.log();
  console.log("  ✈️  CLEAR FOR TAKEOFF");
  console.log();
  console.log(`  Steps:    ${passed}/${totalSteps} passed`);
  console.log(`  Duration: ${formatDuration(totalDuration)}`);
  console.log(`  Log:      ${logPath}`);
  console.log();
}

/**
 * Prints failure summary with tail output and rerun hint.
 */
function printFailureSummary(result: StepResult, logPath: string): void {
  console.log();
  console.log("─".repeat(70));
  console.log("  ❌ STEP FAILED");
  console.log("─".repeat(70));
  console.log();
  console.log(`  Step:     ${result.stepNumber} - ${result.stepName}`);
  console.log(`  Command:  ${result.command}`);
  console.log(`  Exit:     ${result.exitCode ?? "N/A"}`);
  console.log(`  Duration: ${formatDuration(result.durationMs)}`);
  console.log();
  console.log("  Last 60 lines of output:");
  console.log("─".repeat(70));
  console.log(tailOutput(result.output, 60));
  console.log("─".repeat(70));
  console.log();
  console.log(`  💡 Rerun with --verbose for full output: pilot attendant --verbose`);
  console.log(`  📄 Full log: ${logPath}`);
  console.log();
}

/**
 * Checks featureConfig.json entries.
 */
async function checkFeatureConfig(results: HealthCheckResult[]): Promise<void> {
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  if (!config) {
    results.push({
      type: "error",
      message: "featureConfig.json not found or invalid",
    });
    return;
  }

  for (const [featureKey, feature] of Object.entries(config)) {
    if (!feature.tag || !feature.tag.startsWith("@")) {
      results.push({
        type: "error",
        message: `Feature "${featureKey}": tag must start with "@"`,
      });
    }
    if (typeof feature.planId !== "number" || feature.planId <= 0) {
      results.push({
        type: "error",
        message: `Feature "${featureKey}": planId must be a positive number`,
      });
    }
    const suiteIds = getSuiteIds(feature.suites);
    if (suiteIds.length === 0) {
      results.push({
        type: "error",
        message: `Feature "${featureKey}": suites must contain at least one suite ID`,
      });
    }
  }
}

/**
 * Checks that test directories exist for each feature.
 */
async function checkTestDirectories(results: HealthCheckResult[]): Promise<void> {
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  if (!config) return;

  for (const featureKey of Object.keys(config)) {
    const testDir = paths.testDir(featureKey);
    if (!dirExists(testDir)) {
      results.push({
        type: "error",
        message: `Feature "${featureKey}": test directory not found: ${testDir}`,
      });
    }
  }
}

/**
 * Checks page fixtures wiring.
 */
async function checkPageFixtures(results: HealthCheckResult[]): Promise<void> {
  const fixturesContent = await readFileSafe(paths.fixtures());
  if (!fixturesContent) {
    results.push({
      type: "error",
      message: "test-fixtures.ts not found",
    });
    return;
  }

  const pageDirs = await glob("src/pages/*", { cwd: REPO_ROOT, onlyDirectories: true });
  const pageFiles = await glob("src/pages/*/*Page.ts", { cwd: REPO_ROOT });

  for (const pageFile of pageFiles) {
    const parts = pageFile.split("/");
    const featureKey = parts[2];
    const pageFileName = parts[3];
    const PageName = pageFileName.replace(".ts", "");
    const baseName = PageName.replace("Page", "");
    const fixtureName = baseName.charAt(0).toLowerCase() + baseName.slice(1) + "Page";

    if (!fixturesContent.includes(PageName)) {
      results.push({
        type: "error",
        message: `Page "${PageName}": import missing in test-fixtures.ts`,
      });
    }

    if (!fixturesContent.includes(`${fixtureName}:`)) {
      results.push({
        type: "error",
        message: `Page "${PageName}": fixture type entry missing in test-fixtures.ts`,
      });
    }

    if (!fixturesContent.includes(`${fixtureName}: async`)) {
      results.push({
        type: "error",
        message: `Page "${PageName}": fixture extend entry missing in test-fixtures.ts`,
      });
    }
  }

  const fixtureMatches = Array.from(fixturesContent.matchAll(/^\s+(\w+Page):\s+(\w+Page);/gm));
  for (const match of fixtureMatches) {
    const fixtureName = match[1];
    const pageName = match[2];
    const pageFile = pageFiles.find((f) => f.includes(`${pageName}.ts`));
    if (!pageFile) {
      results.push({
        type: "warning",
        message: `Fixture "${fixtureName}": page file not found (orphaned fixture)`,
      });
    }
  }
}

/**
 * Checks factory exports.
 */
async function checkFactoryExports(results: HealthCheckResult[]): Promise<void> {
  const indexPath = paths.factoriesIndex();
  const indexContent = await readFileSafe(indexPath);
  if (!indexContent) {
    results.push({
      type: "error",
      message: "factories/index.ts not found",
    });
    return;
  }

  const factoryFiles = await glob("src/testdata/factories/*.factory.ts", { cwd: REPO_ROOT });
  const exportedFactories = new Set<string>();

  const exportMatches = Array.from(indexContent.matchAll(/export \* from ['"]\.\/(\w+)\.factory['"];/g));
  for (const match of exportMatches) {
    exportedFactories.add(match[1]);
  }

  for (const factoryFile of factoryFiles) {
    const factoryName = path.basename(factoryFile, ".factory.ts");
    if (!exportedFactories.has(factoryName)) {
      results.push({
        type: "error",
        message: `Factory "${factoryName}": not exported in factories/index.ts`,
      });
    }
  }

  for (const exported of Array.from(exportedFactories)) {
    const factoryFile = factoryFiles.find((f) => f.includes(`${exported}.factory.ts`));
    if (!factoryFile) {
      results.push({
        type: "warning",
        message: `Factory export "${exported}": factory file not found (stale export)`,
      });
    }
  }
}

/**
 * Checks spec file imports.
 */
async function checkSpecImports(results: HealthCheckResult[]): Promise<void> {
  const specFiles = await glob("tests/**/*.spec.ts", { cwd: REPO_ROOT });

  for (const specFile of specFiles) {
    if (specFile.includes("/tools/") || specFile.includes("\\tools\\")) {
      continue;
    }

    const content = await readFileSafe(path.join(REPO_ROOT, specFile));
    if (!content) continue;

    if (!content.includes('from "../../fixtures/test-fixtures"') && !content.includes('from "../fixtures/test-fixtures"')) {
      results.push({
        type: "warning",
        message: `Spec "${specFile}": missing test-fixtures import`,
      });
    }

    if (!content.includes('from "../../../src/testdata/factories"') && !content.includes('from "../../src/testdata/factories"')) {
      results.push({
        type: "warning",
        message: `Spec "${specFile}": missing factories import`,
      });
    }

    if (!content.includes('from "../../../src/utils/dataStore"') && !content.includes('from "../../src/utils/dataStore"')) {
      results.push({
        type: "warning",
        message: `Spec "${specFile}": missing dataStore import`,
      });
    }
  }
}

/**
 * Converts to camelCase.
 */
function toCamelCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
}
