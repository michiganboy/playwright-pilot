// Health check command (attendant).
// Attendant is a HEALTH GATE - if it succeeds, the repo is in a known-good state.
import { readJsonSafe, readFileSafe, fileExists, dirExists } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { getSuiteIds, hasSuiteId } from "../../utils/featureConfig";
import { glob } from "fast-glob";
import path from "path";
import { execSync, type ExecSyncOptions } from "child_process";

/**
 * Test suite step definition for the health gate.
 */
export interface TestStep {
  name: string;
  command: string;
  env?: Record<string, string>;
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

interface FeatureConfig {
  [key: string]: {
    tag: string;
    planId: number;
    suites: Record<string, string>; // Suite ID (as string) -> Suite Name
  };
}

interface HealthCheckResult {
  type: "error" | "warning" | "info";
  message: string;
}

/**
 * Runs health checks on the framework structure.
 */
export async function runAttendant(): Promise<void> {
  const results: HealthCheckResult[] = [];

  console.log("🔍 Running health checks...\n");

  // ─────────────────────────────────────────────────────────────────
  // PHASE 1: Static checks (feature config, directories, fixtures, exports)
  // ─────────────────────────────────────────────────────────────────

  // Check featureConfig.json
  await checkFeatureConfig(results);

  // Check test directories
  await checkTestDirectories(results);

  // Check page fixtures
  await checkPageFixtures(results);

  // Check factory exports
  await checkFactoryExports(results);

  // Check spec imports
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
    // Don't fail on warnings, but fail on errors
    if (errors.length > 0) {
      throw new Error(`Static checks failed with ${errors.length} error(s)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PHASE 2: Run authoritative test suites (health gate)
  // ─────────────────────────────────────────────────────────────────

  console.log("🧪 Running authoritative test suites...\n");

  await runTestSuites();

  // ─────────────────────────────────────────────────────────────────
  // SUCCESS: All checks passed
  // ─────────────────────────────────────────────────────────────────

  console.log("\n✅ Attendant check passed: CLI, testdata, utils, and TOOLS validated.\n");
}

/**
 * Runs the authoritative test suites sequentially.
 * Stops immediately if any step fails.
 */
export async function runTestSuites(): Promise<void> {
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

  // Find all page directories
  const pageDirs = await glob("src/pages/*", { cwd: REPO_ROOT, onlyDirectories: true });
  const pageFiles = await glob("src/pages/*/*Page.ts", { cwd: REPO_ROOT });

  for (const pageFile of pageFiles) {
    const parts = pageFile.split("/");
    const featureKey = parts[2];
    const pageFileName = parts[3];
    // Extract PageName from filename (e.g., "AppointmentPage.ts" -> "AppointmentPage")
    const PageName = pageFileName.replace(".ts", "");
    // Extract base name for fixture (e.g., "AppointmentPage" -> "appointmentPage")
    const baseName = PageName.replace("Page", "");
    const fixtureName = baseName.charAt(0).toLowerCase() + baseName.slice(1) + "Page";

    // Check import (flexible matching - just check if the page class is imported)
    if (!fixturesContent.includes(PageName)) {
      results.push({
        type: "error",
        message: `Page "${PageName}": import missing in test-fixtures.ts`,
      });
    }

    // Check type entry
    if (!fixturesContent.includes(`${fixtureName}:`)) {
      results.push({
        type: "error",
        message: `Page "${PageName}": fixture type entry missing in test-fixtures.ts`,
      });
    }

    // Check extend entry
    if (!fixturesContent.includes(`${fixtureName}: async`)) {
      results.push({
        type: "error",
        message: `Page "${PageName}": fixture extend entry missing in test-fixtures.ts`,
      });
    }
  }

  // Check for orphaned fixtures (wired but page doesn't exist)
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

  // Find all factory files
  const factoryFiles = await glob("src/testdata/factories/*.factory.ts", { cwd: REPO_ROOT });
  const exportedFactories = new Set<string>();

  // Extract exports from index (handle both single and double quotes)
  const exportMatches = Array.from(indexContent.matchAll(/export \* from ['"]\.\/(\w+)\.factory['"];/g));
  for (const match of exportMatches) {
    exportedFactories.add(match[1]);
  }

  // Check each factory is exported
  for (const factoryFile of factoryFiles) {
    const factoryName = path.basename(factoryFile, ".factory.ts");
    if (!exportedFactories.has(factoryName)) {
      results.push({
        type: "error",
        message: `Factory "${factoryName}": not exported in factories/index.ts`,
      });
    }
  }

  // Check for stale exports
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
 * Note: tests/tools/ specs are excluded - they are framework internals tests
 * that don't require the standard imports.
 */
async function checkSpecImports(results: HealthCheckResult[]): Promise<void> {
  const specFiles = await glob("tests/**/*.spec.ts", { cwd: REPO_ROOT });

  for (const specFile of specFiles) {
    // Skip /tools/ specs - they are framework internals tests
    if (specFile.includes("/tools/") || specFile.includes("\\tools\\")) {
      continue;
    }

    const content = await readFileSafe(path.join(REPO_ROOT, specFile));
    if (!content) continue;

    // Check for required imports
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
