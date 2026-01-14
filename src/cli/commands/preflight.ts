// Preflight check command - validates framework readiness before takeoff.
// Preflight grants authority. Does not execute tests.
import { readJsonSafe, readFileSafe, fileExists, dirExists } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { getSuiteIds } from "../../utils/featureConfig";
import { glob } from "fast-glob";
import path from "path";
import { spawnSync, type SpawnSyncOptions } from "child_process";
import {
  createLogFilePath,
  writeLogHeader,
  writeChecklistItemHeader,
  appendToLog,
  writeChecklistItemResult,
  writeLogFooter,
  tailOutput,
  formatDuration,
  formatChecklistResult,
} from "../utils/preflightLogger";

/**
 * Checklist item definition for preflight verification.
 */
export interface ChecklistItem {
  name: string;
  command: string;
  env?: Record<string, string>;
}

/**
 * Checklist item execution result.
 */
export interface ChecklistResult {
  itemNumber: number;
  itemName: string;
  command: string;
  verified: boolean;
  durationMs: number;
  output: string;
  exitCode: number | null;
}

/**
 * The preflight checklist - authoritative verification steps.
 * Each item must pass for clearance.
 */
export const PREFLIGHT_CHECKLIST: ChecklistItem[] = [
  {
    name: "CLI and unit integrity",
    command: "npm run test:cli -- --runInBand --verbose",
  },
  {
    name: "Suite command verification",
    command: "npm run test:cli -- --runInBand --verbose src/cli/__tests__/commands.suite.test.ts",
  },
  {
    name: "Namespace enforcement",
    command: "npm run test:cli -- --runInBand --verbose src/testdata/__tests__/namespace-enforcement.test.ts",
  },
  {
    name: "RunState lifecycle",
    command: "npm run test:cli -- --runInBand --verbose src/testdata/__tests__/runstate-lifecycle.test.ts",
  },
  {
    name: "Last-run metadata",
    command: "npm run test:cli -- --runInBand --verbose src/utils/__tests__/last-run-metadata.test.ts",
  },
  {
    name: "TOOLS defaults",
    command: 'npm run test -- --grep="TOOLS-001" --reporter=list',
    env: { PILOT_SEED: "12345", PILOT_KEEP_RUNSTATE: "true" },
  },
  {
    name: "TOOLS surface",
    command: 'npm run test -- --grep="TOOLS-002" --reporter=list',
    env: { PILOT_SEED: "12345", PILOT_KEEP_RUNSTATE: "true" },
  },
  {
    name: "Parallel determinism and collision stress",
    command: 'npm run test -- --grep="TOOLS-003-WRITE|TOOLS-003-COLLECT" --reporter=list --workers=4',
    env: { PILOT_SEED: "12345", PILOT_KEEP_RUNSTATE: "true" },
  },
];

/**
 * Command executor - can be overridden for testing.
 */
export let checklistExecutor = (command: string, options: SpawnSyncOptions): { stdout: string; stderr: string; exitCode: number | null } => {
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
 * Sets the checklist executor (for testing).
 */
export function setChecklistExecutor(executor: (command: string, options: SpawnSyncOptions) => { stdout: string; stderr: string; exitCode: number | null }): void {
  checklistExecutor = executor;
}

/**
 * Resets the checklist executor to default (for testing cleanup).
 */
export function resetChecklistExecutor(): void {
  checklistExecutor = (command: string, options: SpawnSyncOptions): { stdout: string; stderr: string; exitCode: number | null } => {
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

interface InspectionResult {
  type: "error" | "warning" | "info";
  message: string;
}

/**
 * Runs preflight check - validates framework readiness.
 * Returns true if cleared for takeoff, false otherwise.
 */
export async function runPreflight(): Promise<boolean> {
  const LINE = "\u2500".repeat(70);
  
  console.log("PILOT PREFLIGHT");
  console.log(LINE);
  console.log("Preflight check in progress");
  console.log();

  // Phase 1: Inspections
  const inspectionResults: InspectionResult[] = [];
  await runInspections(inspectionResults);

  console.log("INSPECTIONS");
  console.log("\u2500".repeat(11));
  
  const errors = inspectionResults.filter((r) => r.type === "error");
  const warnings = inspectionResults.filter((r) => r.type === "warning");

  if (errors.length > 0) {
    for (const e of errors) {
      console.log(`${e.message}`);
    }
    console.log();
    console.log(LINE);
    console.log();
    console.log("NOT CLEARED FOR TAKEOFF");
    return false;
  }

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.log(`${w.message}`);
    }
  } else {
    console.log("Configuration inspection verified");
  }
  console.log();

  // Phase 2: Checklist execution
  const cleared = await runChecklist();
  
  return cleared;
}

/**
 * Runs all inspections (static checks).
 */
async function runInspections(results: InspectionResult[]): Promise<void> {
  await checkFeatureConfig(results);
  await checkTestDirectories(results);
  await checkPageFixtures(results);
  await checkFactoryExports(results);
  await checkSpecImports(results);
}

/**
 * Runs the preflight checklist.
 * Returns true if all items verified, false otherwise.
 */
async function runChecklist(): Promise<boolean> {
  const LINE = "\u2500".repeat(70);
  const logPath = createLogFilePath("preflight");
  writeLogHeader(logPath, "preflight");

  const totalItems = PREFLIGHT_CHECKLIST.length;
  const itemResults: ChecklistResult[] = [];
  const overallStart = Date.now();

  console.log("CHECKLIST");
  console.log("\u2500".repeat(9));

  for (let i = 0; i < totalItems; i++) {
    const item = PREFLIGHT_CHECKLIST[i];
    const itemNumber = i + 1;

    writeChecklistItemHeader(logPath, itemNumber, totalItems, item.name, item.command);

    const itemStart = Date.now();
    let result: ChecklistResult;

    try {
      const spawnOptions: SpawnSyncOptions = {
        cwd: REPO_ROOT,
        env: item.env ? { ...process.env, ...item.env } : process.env,
      };

      const execResult = checklistExecutor(item.command, spawnOptions);
      const durationMs = Date.now() - itemStart;
      const output = execResult.stdout + execResult.stderr;

      appendToLog(logPath, output);

      const verified = execResult.exitCode === 0;
      result = {
        itemNumber,
        itemName: item.name,
        command: item.command,
        verified,
        durationMs,
        output,
        exitCode: execResult.exitCode,
      };

      writeChecklistItemResult(logPath, itemNumber, item.name, verified, durationMs);
      console.log(formatChecklistResult(itemNumber, totalItems, item.name, verified, durationMs));

      if (!verified) {
        itemResults.push(result);
        printFailureSummary(result, logPath);
        
        const totalDuration = Date.now() - overallStart;
        const verifiedCount = itemResults.filter((r) => r.verified).length;
        const failedCount = itemResults.filter((r) => !r.verified).length;
        writeLogFooter(logPath, verifiedCount, failedCount, totalDuration, false);
        
        console.log(LINE);
        console.log();
        console.log(`Items:      ${verifiedCount}/${totalItems} verified`);
        console.log(`Duration:   ${formatDuration(totalDuration)}`);
        console.log(`Flight log: ${logPath}`);
        console.log();
        console.log("NOT CLEARED FOR TAKEOFF");
        return false;
      }

      itemResults.push(result);
    } catch (error) {
      const durationMs = Date.now() - itemStart;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.log(formatChecklistResult(itemNumber, totalItems, item.name, false, durationMs));

      result = {
        itemNumber,
        itemName: item.name,
        command: item.command,
        verified: false,
        durationMs,
        output: errorMsg,
        exitCode: null,
      };
      itemResults.push(result);
      appendToLog(logPath, `\nError: ${errorMsg}\n`);
      writeChecklistItemResult(logPath, itemNumber, item.name, false, durationMs);

      printFailureSummary(result, logPath);
      
      const totalDuration = Date.now() - overallStart;
      const verifiedCount = itemResults.filter((r) => r.verified).length;
      const failedCount = itemResults.filter((r) => !r.verified).length;
      writeLogFooter(logPath, verifiedCount, failedCount, totalDuration, false);
      
      console.log(LINE);
      console.log();
      console.log(`Items:      ${verifiedCount}/${totalItems} verified`);
      console.log(`Duration:   ${formatDuration(totalDuration)}`);
      console.log(`Flight log: ${logPath}`);
      console.log();
      console.log("NOT CLEARED FOR TAKEOFF");
      return false;
    }
  }

  // All items verified
  const totalDuration = Date.now() - overallStart;
  const verifiedCount = itemResults.filter((r) => r.verified).length;
  writeLogFooter(logPath, verifiedCount, 0, totalDuration, true);

  console.log(LINE);
  console.log();
  console.log(`Items:      ${verifiedCount}/${totalItems} verified`);
  console.log(`Duration:   ${formatDuration(totalDuration)}`);
  console.log(`Flight log: ${logPath}`);
  console.log();
  console.log("CLEAR FOR TAKEOFF");
  return true;
}

/**
 * Prints failure summary with tail output.
 */
function printFailureSummary(result: ChecklistResult, logPath: string): void {
  const LINE = "\u2500".repeat(70);
  console.log();
  console.log(LINE);
  console.log("ITEM FAILED");
  console.log(LINE);
  console.log();
  console.log(`Item:     ${result.itemNumber} - ${result.itemName}`);
  console.log(`Command:  ${result.command}`);
  console.log(`Exit:     ${result.exitCode ?? "N/A"}`);
  console.log(`Duration: ${formatDuration(result.durationMs)}`);
  console.log();
  console.log("Last 60 lines of output:");
  console.log(LINE);
  console.log(tailOutput(result.output, 60));
  console.log(LINE);
  console.log();
  console.log(`Flight log: ${logPath}`);
  console.log();
}

/**
 * Checks featureConfig.json entries.
 */
async function checkFeatureConfig(results: InspectionResult[]): Promise<void> {
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
async function checkTestDirectories(results: InspectionResult[]): Promise<void> {
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
async function checkPageFixtures(results: InspectionResult[]): Promise<void> {
  const fixturesContent = await readFileSafe(paths.fixtures());
  if (!fixturesContent) {
    results.push({
      type: "error",
      message: "test-fixtures.ts not found",
    });
    return;
  }

  const pageFiles = await glob("src/pages/*/*Page.ts", { cwd: REPO_ROOT });

  for (const pageFile of pageFiles) {
    const parts = pageFile.split("/");
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
async function checkFactoryExports(results: InspectionResult[]): Promise<void> {
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
async function checkSpecImports(results: InspectionResult[]): Promise<void> {
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
