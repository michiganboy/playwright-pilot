// Health check command (attendant).
import { readJsonSafe, readFileSafe, fileExists, dirExists } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { getSuiteIds, hasSuiteId } from "../../utils/featureConfig";
import { glob } from "fast-glob";
import path from "path";

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

  // Print results
  console.log("\n📊 Health Check Results:\n");

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
    console.log("✅ All checks passed!\n");
  } else {
    console.log(`Summary: ${errors.length} error(s), ${warnings.length} warning(s)\n`);
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

  // Extract exports from index
  const exportMatches = Array.from(indexContent.matchAll(/export \* from "\.\/(\w+)\.factory";/g));
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
 */
async function checkSpecImports(results: HealthCheckResult[]): Promise<void> {
  const specFiles = await glob("tests/**/*.spec.ts", { cwd: REPO_ROOT });

  for (const specFile of specFiles) {
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
