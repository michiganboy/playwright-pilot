// Command handlers for feature operations.
import { readJsonSafe, writeJsonSafe, fileExists, dirExists, writeFileSafe } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { normalizeAndPrint, toPascalCase, toCamelCase } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { findMatchingPages } from "../utils/validation";
import { input, confirm, select } from "@inquirer/prompts";
import { addPage } from "./page";
import path from "path";

interface FeatureConfig {
  [key: string]: {
    tag: string;
    planId: number;
    suites: number[];
  };
}

/**
 * Adds a new feature.
 */
export async function addFeature(
  featureName: string,
  planId?: number,
  suites?: number[]
): Promise<void> {
  const featureKey = normalizeAndPrint(featureName, "feature name");

  // Check if feature already exists
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  if (config && config[featureKey]) {
    throw new Error(`Feature already exists: ${featureKey}`);
  }

  const testDir = paths.testDir(featureKey);
  if (dirExists(testDir)) {
    throw new Error(`Test directory already exists: ${testDir}`);
  }

  // Prompt for planId if not provided
  let finalPlanId = planId;
  if (finalPlanId === undefined) {
    const planIdInput = await input({
      message: "Enter Azure DevOps Plan ID (number):",
    });
    finalPlanId = parseInt(planIdInput, 10);
    if (isNaN(finalPlanId)) {
      throw new Error("Plan ID must be a number");
    }
  }

  // Prompt for suites if not provided
  let finalSuites = suites;
  if (!finalSuites || finalSuites.length === 0) {
    const suitesInput = await input({
      message: "Enter Azure DevOps Suite IDs (comma-separated numbers):",
    });
    finalSuites = suitesInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (finalSuites.length === 0) {
      throw new Error("At least one suite ID is required");
    }
  }

  // Check for matching pages
  const matchingPages = await findMatchingPages(featureKey);
  let shouldCreatePage = false;
  let pageName: string | undefined;

  if (matchingPages.length > 0) {
    const useExisting = await confirm({
      message: `Found existing page object(s): ${matchingPages.join(", ")}. Use as primary page object?`,
      default: true,
    });
    if (!useExisting) {
      shouldCreatePage = true;
    }
  } else {
    shouldCreatePage = true;
  }

  if (shouldCreatePage) {
    const pageNameInput = await input({
      message: "Enter page name (or press Enter to skip):",
    });
    if (pageNameInput.trim()) {
      pageName = pageNameInput.trim();
    }
  }

  // Add to featureConfig.json
  const updatedConfig: FeatureConfig = config || {};
  updatedConfig[featureKey] = {
    tag: `@${featureKey}`,
    planId: finalPlanId,
    suites: finalSuites,
  };
  await writeJsonSafe(paths.featureConfig(), updatedConfig, true);

  // Create test directory (by creating a file in it)
  const gitkeepPath = path.join(testDir, ".gitkeep");
  await writeFileSafe(gitkeepPath, "", true);
  // Remove .gitkeep immediately after creating directory
  try {
    await import("fs").then((fs) => fs.promises.unlink(gitkeepPath));
  } catch {
    // Ignore if already deleted
  }

  // Create initial spec file
  const specId = featureKey.toUpperCase().slice(0, 4) + "-101";
  const testId1 = "10001";
  const testId2 = "10002";
  const pageFixture = pageName
    ? toCamelCase(pageName) + "Page"
    : matchingPages.length > 0
    ? toCamelCase(matchingPages[0]) + "Page"
    : "page"; // fallback

  const specTemplate = await loadTemplate("spec.ts");
  const specContent = renderTemplate(specTemplate, {
    featureKey,
    tag: `@${featureKey}`,
    planId: finalPlanId.toString(),
    suites: finalSuites.join(", "),
    specId,
    description: featureName.replace(/-/g, " "),
    testId1,
    testId2,
    pageFixture,
  });

  const specFileName = `${specId}-${featureKey.replace(/-/g, "-")}.spec.ts`;
  await writeFileSafe(path.join(testDir, specFileName), specContent);

  // Create page if requested
  if (pageName) {
    try {
      await addPage(pageName, featureKey);
    } catch (error) {
      console.warn(`Warning: Could not create page: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`✓ Created feature: ${featureKey}`);
  console.log(`✓ Added to featureConfig.json`);
  console.log(`✓ Created test directory: ${testDir}`);
  console.log(`✓ Created initial spec: ${specFileName}`);
  if (pageName) {
    console.log(`✓ Created page: ${pageName}`);
  }
}

/**
 * Deletes a feature.
 */
export async function deleteFeature(featureName: string): Promise<void> {
  const featureKey = normalizeAndPrint(featureName, "feature name");

  // Confirm deletion
  const confirmation = await input({
    message: `Type "delete ${featureKey}" to confirm deletion:`,
  });

  if (confirmation !== `delete ${featureKey}`) {
    throw new Error("Deletion cancelled: confirmation text did not match");
  }

  // Remove from featureConfig
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  if (config && config[featureKey]) {
    delete config[featureKey];
    await writeJsonSafe(paths.featureConfig(), config, true);
  }

  // Delete test directory
  const testDir = paths.testDir(featureKey);
  if (dirExists(testDir)) {
    await import("fs").then((fs) => fs.promises.rm(testDir, { recursive: true, force: true }));
  }

  console.log(`✓ Deleted feature: ${featureKey}`);
  console.log(`✓ Removed from featureConfig.json`);
  console.log(`✓ Deleted test directory: ${testDir}`);
}
