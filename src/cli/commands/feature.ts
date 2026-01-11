// Command handlers for feature operations.
import { readJsonSafe, writeJsonSafe, fileExists, dirExists, writeFileSafe } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { normalizeAndPrint, toPascalCase, toCamelCase, normalizeSuiteName } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { findMatchingPages } from "../utils/validation";
import { addFeatureToDataStoreMap, removeFeatureFromDataStoreMap } from "../utils/dataStoreUpdater";
import { input, confirm, select } from "@inquirer/prompts";
import { addPage } from "./page";
import path from "path";

interface FeatureConfig {
  [key: string]: {
    tag: string;
    planId: number;
    suites: Record<string, string>; // Suite ID (as string) -> Suite Name
  };
}

/**
 * Adds a new feature with pre-provided suite mapping (used when creating feature from spec flow).
 */
export async function addFeatureWithSuites(
  featureKey: string,
  suiteMapping: Record<string, string>,
  planId?: number
): Promise<void> {
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

  const finalSuites = Object.keys(suiteMapping).map((id) => parseInt(id, 10));

  // Check for matching pages
  const matchingPages = await findMatchingPages(featureKey);
  let pageName: string;

  if (matchingPages.length > 0) {
    const useExisting = await confirm({
      message: `Found existing page object(s): ${matchingPages.join(", ")}. Use as primary page object?`,
      default: true,
    });
    if (!useExisting) {
      // User declined existing page, must provide a new page name
      let pageNameInput = "";
      while (!pageNameInput.trim()) {
        pageNameInput = await input({
          message: "Enter page name (required):",
        });
        if (!pageNameInput.trim()) {
          console.log("⚠️  Page name is required. Please enter a name.");
        }
      }
      pageName = pageNameInput.trim();
    } else {
      // User accepted existing page, use the first matching one
      pageName = matchingPages[0];
    }
  } else {
    // No matching pages found, automatically use feature name as page name
    // If featureKey ends with "-page", strip it to avoid double "Page" suffix
    pageName = featureKey.toLowerCase().endsWith("-page") 
      ? featureKey.slice(0, -5) 
      : featureKey;
    console.log(`✓ Will create page: ${pageName}`);
  }

  // Add to featureConfig.json
  const updatedConfig: FeatureConfig = config || {};
  updatedConfig[featureKey] = {
    tag: `@${featureKey}`,
    planId: finalPlanId,
    suites: suiteMapping,
  };
  await writeJsonSafe(paths.featureConfig(), updatedConfig, true);

  // Add feature key to DataStoreMap
  await addFeatureToDataStoreMap(featureKey);

  // Create test directory (by creating a file in it)
  const gitkeepPath = path.join(testDir, ".gitkeep");
  await writeFileSafe(gitkeepPath, "", true);
  // Remove .gitkeep immediately after creating directory
  try {
    await import("fs").then((fs) => fs.promises.unlink(gitkeepPath));
  } catch {
    // Ignore if already deleted
  }

  // Create a spec file for each suite
  // pageName is always defined at this point (either from existing match, user input, or feature name)
  const pageFixture = toCamelCase(pageName) + "Page";

  // Generate navigate method name from page fixture
  // Convert "newAppointmentsPage" -> "newAppointments" -> "new-appointments" -> "NewAppointments" -> "navigateToNewAppointments"
  const pageNameForMethod = pageFixture.replace("Page", "");
  // Convert camelCase to kebab-case first, then to PascalCase
  const kebabCase = pageNameForMethod.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "").replace(/-+/g, "-");
  const pascalCase = toPascalCase(kebabCase);
  const navigateMethod = `navigateTo${pascalCase}`;

  const specTemplate = await loadTemplate("spec.ts");
  const createdSpecFiles: string[] = [];

  // Create a spec file for each suite
  for (let i = 0; i < finalSuites.length; i++) {
    const suiteId = finalSuites[i];
    const suiteName = suiteMapping[suiteId.toString()];
    const specNumber = i + 1;
    const specId = featureKey.toUpperCase().slice(0, 4) + `-${100 + specNumber}`;
    const testId = `${10000 + specNumber}`;
    const fileNameBase = normalizeAndPrint(suiteName, "suite name");

    const specContent = renderTemplate(specTemplate, {
      featureKey,
      tag: `@${featureKey}`,
      planId: finalPlanId.toString(),
      suites: suiteId.toString(), // Only show the specific suite ID for this spec
      specId,
      description: suiteName.replace(/-/g, " "),
      testId,
      pageFixture,
      navigateMethod,
    });

    const specFileName = `${specId}-${fileNameBase}.spec.ts`;
    await writeFileSafe(path.join(testDir, specFileName), specContent);
    createdSpecFiles.push(specFileName);
  }

  // Create page if it's a new one (not an existing match)
  const isNewPage = !matchingPages.includes(pageName);
  if (isNewPage) {
    try {
      await addPage(pageName, featureKey);
      console.log(`✓ Created page: ${pageName}`);
    } catch (error) {
      console.warn(`Warning: Could not create page: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log(`✓ Using existing page: ${pageName}`);
  }

  console.log(`✓ Created feature: ${featureKey}`);
  console.log(`✓ Added to featureConfig.json`);
  console.log(`✓ Created test directory: ${testDir}`);
  for (const specFile of createdSpecFiles) {
    console.log(`✓ Created spec: ${specFile}`);
  }
}

/**
 * Adds a new feature.
 */
export async function addFeature(
  featureName: string | undefined,
  planId?: number
): Promise<void> {
  // Prompt for feature name if not provided
  let finalFeatureName = featureName;
  if (!finalFeatureName || !finalFeatureName.trim()) {
    finalFeatureName = await input({
      message: "Enter feature name:",
    });
    if (!finalFeatureName.trim()) {
      throw new Error("Feature name is required");
    }
  }

  const featureKey = normalizeAndPrint(finalFeatureName, "feature name");

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

  // Prompt for suite names first, then IDs (more intuitive - names are meaningful)
  const suiteMapping: Record<string, string> = {};
  
  // Interactive mode: prompt for names first
  console.log("\n💡 Enter suite names first (what you named your test suites), then their ADO IDs.\n");
  
  while (true) {
      const suiteName = await input({
        message: Object.keys(suiteMapping).length === 0
          ? "Enter suite name:"
          : "Enter suite name (or press Enter to finish):",
      });
      
      if (!suiteName.trim()) {
        if (Object.keys(suiteMapping).length === 0) {
          console.log("⚠️  At least one suite is required.");
          continue;
        } else {
          break; // User finished adding suites
        }
      }
      
      // Normalize suite name to Title Case for consistent storage
      const normalizedSuiteName = normalizeSuiteName(suiteName);
      if (normalizedSuiteName !== suiteName.trim()) {
        console.log(`  Normalized suite name: "${suiteName.trim()}" → "${normalizedSuiteName}"`);
      }
      
      // Check if suite name already exists (case-insensitive)
      const existingSuiteNames = Object.values(suiteMapping);
      const normalizedSuiteNameLower = normalizedSuiteName.toLowerCase();
      const duplicateName = existingSuiteNames.find(
        (name) => name.toLowerCase() === normalizedSuiteNameLower
      );
      if (duplicateName) {
        console.log(`⚠️  Suite name "${normalizedSuiteName}" is already used (case-insensitive match with "${duplicateName}"). Please enter a different name.`);
        continue; // Skip to next iteration to prompt for a new name
      }
      
      // Prompt for ID for this suite name
      let suiteId: number | null = null;
      while (suiteId === null || isNaN(suiteId)) {
        const idInput = await input({
          message: `Enter Azure DevOps Suite ID for "${normalizedSuiteName}":`,
        });
        suiteId = parseInt(idInput.trim(), 10);
        if (isNaN(suiteId)) {
          console.log("⚠️  Suite ID must be a number.");
        } else if (suiteId.toString() in suiteMapping) {
          console.log("⚠️  This suite ID is already used. Please enter a different ID.");
          suiteId = null;
        }
      }
      suiteMapping[suiteId.toString()] = normalizedSuiteName; // Store normalized name
      console.log(`✓ Added suite: ${suiteId} - "${normalizedSuiteName}"\n`);
    }
  
  const finalSuites = Object.keys(suiteMapping).map((id) => parseInt(id, 10));

  // Check for matching pages
  const matchingPages = await findMatchingPages(featureKey);
  let pageName: string;

  if (matchingPages.length > 0) {
    const useExisting = await confirm({
      message: `Found existing page object(s): ${matchingPages.join(", ")}. Use as primary page object?`,
      default: true,
    });
    if (!useExisting) {
      // User declined existing page, must provide a new page name
      let pageNameInput = "";
      while (!pageNameInput.trim()) {
        pageNameInput = await input({
          message: "Enter page name (required):",
        });
        if (!pageNameInput.trim()) {
          console.log("⚠️  Page name is required. Please enter a name.");
        }
      }
      pageName = pageNameInput.trim();
    } else {
      // User accepted existing page, use the first matching one
      pageName = matchingPages[0];
    }
  } else {
    // No matching pages found, automatically use feature name as page name
    // If featureKey ends with "-page", strip it to avoid double "Page" suffix
    pageName = featureKey.toLowerCase().endsWith("-page") 
      ? featureKey.slice(0, -5) 
      : featureKey;
    console.log(`✓ Will create page: ${pageName}`);
  }

  // Add to featureConfig.json
  const updatedConfig: FeatureConfig = config || {};
  updatedConfig[featureKey] = {
    tag: `@${featureKey}`,
    planId: finalPlanId,
    suites: suiteMapping,
  };
  await writeJsonSafe(paths.featureConfig(), updatedConfig, true);

  // Add feature key to DataStoreMap
  await addFeatureToDataStoreMap(featureKey);

  // Create test directory (by creating a file in it)
  const gitkeepPath = path.join(testDir, ".gitkeep");
  await writeFileSafe(gitkeepPath, "", true);
  // Remove .gitkeep immediately after creating directory
  try {
    await import("fs").then((fs) => fs.promises.unlink(gitkeepPath));
  } catch {
    // Ignore if already deleted
  }

  // Create a spec file for each suite
  // pageName is always defined at this point (either from existing match, user input, or feature name)
  const pageFixture = toCamelCase(pageName) + "Page";

  // Generate navigate method name from page fixture
  // Convert "newAppointmentsPage" -> "newAppointments" -> "new-appointments" -> "NewAppointments" -> "navigateToNewAppointments"
  const pageNameForMethod = pageFixture.replace("Page", "");
  // Convert camelCase to kebab-case first, then to PascalCase
  const kebabCase = pageNameForMethod.replace(/([A-Z])/g, "-$1").toLowerCase();
  const pascalCase = toPascalCase(kebabCase);
  const navigateMethod = `navigateTo${pascalCase}`;

  const specTemplate = await loadTemplate("spec.ts");
  const createdSpecFiles: string[] = [];

  // Create a spec file for each suite
  for (let i = 0; i < finalSuites.length; i++) {
    const suiteId = finalSuites[i];
    const suiteName = suiteMapping[suiteId.toString()];
    const specNumber = i + 1;
    const specId = featureKey.toUpperCase().slice(0, 4) + `-${100 + specNumber}`;
    const testId = `${10000 + specNumber}`;
    const fileNameBase = normalizeAndPrint(suiteName, "suite name");

    const specContent = renderTemplate(specTemplate, {
      featureKey,
      tag: `@${featureKey}`,
      planId: finalPlanId.toString(),
      suites: suiteId.toString(), // Only show the specific suite ID for this spec
      specId,
      description: suiteName.replace(/-/g, " "),
      testId,
      pageFixture,
      navigateMethod,
    });

    const specFileName = `${specId}-${fileNameBase}.spec.ts`;
    await writeFileSafe(path.join(testDir, specFileName), specContent);
    createdSpecFiles.push(specFileName);
  }

  // Create page if it's a new one (not an existing match)
  const isNewPage = !matchingPages.includes(pageName);
  if (isNewPage) {
    try {
      await addPage(pageName, featureKey);
      console.log(`✓ Created page: ${pageName}`);
    } catch (error) {
      console.warn(`Warning: Could not create page: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log(`✓ Using existing page: ${pageName}`);
  }

  console.log(`✓ Created feature: ${featureKey}`);
  console.log(`✓ Added to featureConfig.json`);
  console.log(`✓ Created test directory: ${testDir}`);
  for (const specFile of createdSpecFiles) {
    console.log(`✓ Created spec: ${specFile}`);
  }
}

/**
 * Deletes a feature.
 */
export async function deleteFeature(featureName: string | undefined): Promise<void> {
  // Get all available features
  const { getAvailableFeatureKeys } = await import("../../utils/featureConfig");
  const availableFeatures = getAvailableFeatureKeys();

  if (availableFeatures.length === 0) {
    throw new Error("No features found to delete");
  }

  // Select feature if not provided or show dropdown
  let featureKey: string;
  if (featureName && featureName.trim()) {
    featureKey = normalizeAndPrint(featureName, "feature name");
    if (!availableFeatures.includes(featureKey)) {
      throw new Error(`Feature not found: ${featureKey}`);
    }
  } else {
    const featureOptions = availableFeatures.map((key) => ({
      value: key,
      name: key,
    }));
    featureKey = await select({
      message: "Select which feature to delete:",
      choices: featureOptions,
    });
  }

  // Confirm deletion
  const confirmation = await input({
    message: `Type "delete ${featureKey}" to confirm deletion:`,
  });

  if (confirmation !== `delete ${featureKey}`) {
    throw new Error("Deletion cancelled: confirmation text did not match");
  }

  // Find and handle pages for this feature
  // Find all pages in the feature's directory (not just matching by name)
  const { REPO_ROOT } = await import("../utils/paths");
  const glob = (await import("fast-glob")).default;
  const pageDir = paths.pageDir(featureKey);
  const { isPageReferenced } = await import("../utils/validation");
  const { unwirePageFixture } = await import("./page");
  const { deleteFileSafe, fileExists, dirExists } = await import("../utils/fileOps");

  // Find all page files in the feature's directory
  let pagesToProcess: Array<{ pageName: string; PageName: string; fixtureName: string }> = [];
  if (dirExists(pageDir)) {
    const pageFiles = await glob("*.ts", { cwd: pageDir }).catch(() => []);
    for (const pageFile of pageFiles) {
      if (pageFile.endsWith("Page.ts")) {
        // Extract the class name from filename (e.g., "NewAppointmentsPage.ts" -> "NewAppointments")
        const className = pageFile.replace("Page.ts", "");
        // Convert PascalCase back to kebab-case to derive fixture name correctly
        // "NewAppointments" -> "new-appointments" -> then to camelCase -> "newAppointments"
        const normalized = className
          .replace(/([A-Z])/g, "-$1")
          .toLowerCase()
          .replace(/^-/, "")
          .replace(/-+/g, "-"); // Collapse multiple dashes
        const PageName = className; // Already PascalCase
        const fixtureName = toCamelCase(normalized) + "Page";
        pagesToProcess.push({ pageName: normalized, PageName, fixtureName });
      }
    }
  }

  // If no pages found in directory, try matching by name (for backwards compatibility)
  if (pagesToProcess.length === 0) {
    const matchingPages = await findMatchingPages(featureKey);
    for (const pageName of matchingPages) {
      const PageName = toPascalCase(pageName);
      const fixtureName = toCamelCase(pageName) + "Page";
      pagesToProcess.push({ pageName, PageName, fixtureName });
    }
  }

  for (const { pageName, PageName, fixtureName } of pagesToProcess) {
    const pagePath = paths.pages(featureKey, PageName);

    // Check if page is referenced in test files (excluding the feature being deleted)
    // Pass featureKey to exclude tests from the feature being deleted
    const isReferenced = await isPageReferenced(fixtureName, featureKey);
    
    if (isReferenced) {
      // Page is still referenced elsewhere, keep it and its fixtures
      console.log(`⚠️  Page "${PageName}" is still referenced in other test files. Keeping page and fixtures.`);
    } else {
      // Page is not referenced elsewhere, safe to delete and unwire
      if (fileExists(pagePath)) {
        await deleteFileSafe(pagePath);
        console.log(`✓ Deleted page: ${pagePath}`);
      }
      
      // Always unwire from fixtures (even if file doesn't exist, in case fixture is orphaned)
      // This ensures fixtures are cleaned up even if the page file was already deleted
      try {
        await unwirePageFixture(PageName, fixtureName);
        console.log(`✓ Removed fixture: ${fixtureName}`);
      } catch (error) {
        console.warn(`⚠️  Could not unwire fixture "${fixtureName}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Delete empty directory after processing all pages
  if (dirExists(pageDir)) {
    try {
      const fs = await import("fs");
      const dirContents = await fs.promises.readdir(pageDir);
      if (dirContents.length === 0) {
        await fs.promises.rmdir(pageDir);
        console.log(`✓ Removed empty directory: ${pageDir}`);
      }
    } catch {
      // Directory might not exist or might not be empty, ignore
    }
  }

  // Remove from featureConfig
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  if (config && config[featureKey]) {
    delete config[featureKey];
    await writeJsonSafe(paths.featureConfig(), config, true);
  }

  // Remove feature key from DataStoreMap
  await removeFeatureFromDataStoreMap(featureKey);

  // Delete test directory
  const testDir = paths.testDir(featureKey);
  if (dirExists(testDir)) {
    await import("fs").then((fs) => fs.promises.rm(testDir, { recursive: true, force: true }));
  }

  console.log(`✓ Deleted feature: ${featureKey}`);
  console.log(`✓ Removed from featureConfig.json`);
  console.log(`✓ Removed from DataStoreMap`);
  console.log(`✓ Deleted test directory: ${testDir}`);
}
