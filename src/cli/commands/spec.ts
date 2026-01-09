// Command handlers for spec operations.
import { readJsonSafe, writeFileSafe, fileExists, deleteFileSafe } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { normalizeAndPrint, toPascalCase, toCamelCase, normalizeSuiteName } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { input, select, confirm } from "@inquirer/prompts";
import path from "path";
import { getSuiteIds, getSuiteName, getSuiteNames, hasSuiteId, getAvailableFeatureKeys } from "../../utils/featureConfig";
import { writeJsonSafe } from "../utils/fileOps";
import { addFeatureWithSuites } from "./feature";

// ANSI color codes
const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m"; // Warning
const RED = "\x1b[31m"; // Error

function warning(message: string): string {
  return `${YELLOW}${message}${RESET}`;
}

function error(message: string): string {
  return `${RED}${message}${RESET}`;
}

interface FeatureConfig {
  [key: string]: {
    tag: string;
    planId: number;
    suites: Record<string, string>; // Suite ID (as string) -> Suite Name
  };
}

/**
 * Adds a new spec file to an existing feature.
 */
export async function addSpec(featureKey?: string): Promise<void> {
  // Get all available features
  const availableFeatures = getAvailableFeatureKeys();
  
  if (availableFeatures.length === 0) {
    throw new Error("No features found. Create a feature first using 'pilot add:feature'.");
  }

  // Select feature if not provided or show dropdown
  let normalizedFeatureKey: string;
  if (featureKey && featureKey.trim()) {
    normalizedFeatureKey = normalizeAndPrint(featureKey, "feature key");
    // Don't validate existence here - let the create-feature flow handle it after collecting suite data
    // This allows users to use --feature flag with non-existent features and create them on-the-fly
  } else {
    const featureOptions = availableFeatures.map((key) => ({
      value: key,
      name: key,
    }));
    normalizedFeatureKey = await select({
      message: "Select which feature:",
      choices: featureOptions,
    });
  }

  // Prompt for suite name and ID first (before checking if feature exists)
  // We'll validate against existing feature config if it exists
  let suiteName: string | null = null;
  let suiteId: number | null = null;
  
  // Load config early to check for duplicates
  const earlyConfig = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  const existingFeature = earlyConfig && earlyConfig[normalizedFeatureKey] ? earlyConfig[normalizedFeatureKey] : null;

  // Prompt for suite name with duplicate checking
  while (!suiteName) {
    const suiteNameInput = await input({
      message: "Enter suite name:",
    });
    
    if (!suiteNameInput.trim()) {
      console.log(warning("Suite name is required. Please enter a name."));
      continue;
    }

    // Normalize suite name to Title Case for consistent storage
    const normalizedName = normalizeSuiteName(suiteNameInput);
    if (normalizedName !== suiteNameInput.trim()) {
      console.log(`  Normalized suite name: "${suiteNameInput.trim()}" → "${normalizedName}"`);
    }

    // Check for duplicates if feature exists
    if (existingFeature) {
      const suiteNames = getSuiteNames(existingFeature.suites);
      const normalizedNameLower = normalizedName.toLowerCase();
      const duplicateName = suiteNames.find(
        (name) => name.toLowerCase() === normalizedNameLower
      );
      if (duplicateName) {
        const existingId = Object.keys(existingFeature.suites).find(
          (id) => existingFeature.suites[id].toLowerCase() === normalizedNameLower
        );
        console.log(`    ${warning(`Suite name "${normalizedName}" already exists in this feature`)}`);
        if (existingId) {
          console.log(`    ${warning(`with ID ${existingId} (as "${existingFeature.suites[existingId]}")`)}`);
        }
        console.log(`  Please enter a different suite name.`);
        continue; // Re-prompt for suite name
      }
    }
    
    suiteName = normalizedName;
  }

  // Prompt for suite ID with duplicate checking
  while (suiteId === null || isNaN(suiteId)) {
    const idInput = await input({
      message: `Enter Azure DevOps Suite ID for "${suiteName}":`,
    });
    const parsedId = parseInt(idInput.trim(), 10);
    
    if (isNaN(parsedId)) {
      console.log(warning("Suite ID must be a number. Please enter a valid number."));
      continue;
    }

    // Check for duplicate ID if feature exists
    if (existingFeature && hasSuiteId(existingFeature.suites, parsedId)) {
      const existingName = getSuiteName(existingFeature.suites, parsedId);
      if (existingName && existingName !== suiteName) {
        console.log(`    ${warning(`Suite ID ${parsedId} already exists in this feature`)}`);
        console.log(`    ${warning(`with name "${existingName}"`)}`);
        console.log(`  Please enter a different suite ID.`);
        continue; // Re-prompt for suite ID
      }
      // If same ID and name, that's fine (reusing existing suite)
    }
    
    suiteId = parsedId;
  }

  // Check if feature exists (duplicate validation already done above via re-prompting)
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  
  // If feature exists and we're reusing an existing suite (same ID and name), let user know
  if (config && config[normalizedFeatureKey]) {
    const feature = config[normalizedFeatureKey];
    if (hasSuiteId(feature.suites, suiteId!)) {
      const existingName = getSuiteName(feature.suites, suiteId!);
      if (existingName === suiteName) {
        // Same ID and name - this is fine, just use the existing one
        console.log(`ℹ️  Suite ID ${suiteId} with name "${suiteName}" already exists. Using existing suite.`);
      }
    }
  }
  
  if (!config || !config[normalizedFeatureKey]) {
    // Feature doesn't exist - offer to create it
    const shouldCreate = await confirm({
      message: `Feature "${normalizedFeatureKey}" doesn't exist. Would you like to create it?`,
      default: true,
    });

    if (shouldCreate) {
      // Create feature with the suite we already collected (normalized)
      const suiteMapping: Record<string, string> = {
        [suiteId.toString()]: suiteName, // Already normalized above
      };
      await addFeatureWithSuites(normalizedFeatureKey, suiteMapping);
      // Feature is now created with the spec file, we're done
      return;
    } else {
      throw new Error("Feature creation cancelled. Please create the feature first using 'pilot add:feature'.");
    }
  }

  // Feature exists - continue with spec creation
  const feature = config[normalizedFeatureKey];
  const testDir = paths.testDir(normalizedFeatureKey);

  // Add suite to feature config if it doesn't exist (store normalized name)
  // Duplicate validation already happened above, so this should be safe
  if (!hasSuiteId(feature.suites, suiteId!)) {
    feature.suites[suiteId!.toString()] = suiteName!;
    await writeJsonSafe(paths.featureConfig(), config, true);
    console.log(`✓ Added suite to feature config: ${suiteId} - "${suiteName}"`);
  }

  const selectedSuiteId = suiteId!;
  const suiteNameForFile = suiteName!; // Normalized at the start

  // Generate spec ID (use feature prefix + increment)
  const featureTestDir = paths.testDir(normalizedFeatureKey);
  const glob = (await import("fast-glob")).default;
  const existingSpecs = await glob("*.spec.ts", { cwd: featureTestDir }).catch(() => []);
  const specNumber = existingSpecs.length + 1;
  const specId = normalizedFeatureKey.toUpperCase().slice(0, 4) + `-${100 + specNumber}`;
  const testId = `${10000 + specNumber}`;

  // Try to find a page fixture for this feature
  const pageFixture = await findPageFixtureForFeature(normalizedFeatureKey);
  
  // Generate navigate method name from page fixture
  // Convert "newAppointmentsPage" -> "newAppointments" -> "new-appointments" -> "NewAppointments" -> "navigateToNewAppointments"
  let navigateMethod = "goto"; // fallback
  if (pageFixture !== "page" && pageFixture.endsWith("Page")) {
    const pageNameForMethod = pageFixture.replace("Page", "");
    // Convert camelCase to kebab-case first, then to PascalCase
    const kebabCase = pageNameForMethod.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "").replace(/-+/g, "-");
    const pascalCase = toPascalCase(kebabCase);
    navigateMethod = `navigateTo${pascalCase}`;
  }

  // Use suite name for filename
  const fileNameBase = normalizeAndPrint(suiteNameForFile, "suite name");

  // Load template and render
  const specTemplate = await loadTemplate("spec.ts");
  const specContent = renderTemplate(specTemplate, {
    featureKey: normalizedFeatureKey,
    tag: feature.tag,
    planId: feature.planId.toString(),
    suites: selectedSuiteId.toString(), // Only show the specific suite ID for this spec
    specId,
    description: suiteNameForFile.replace(/-/g, " "),
    testId,
    pageFixture,
    navigateMethod,
  });

  const specFileName = `${specId}-${fileNameBase}.spec.ts`;
  const specPath = path.join(featureTestDir, specFileName);

  if (fileExists(specPath)) {
    throw new Error(`Spec file already exists: ${specPath}`);
  }

  await writeFileSafe(specPath, specContent);

  // Show relative path from repo root (normalize to forward slashes for clickability)
  const relativePath = path.relative(REPO_ROOT, specPath).replace(/\\/g, "/");
  console.log(`✓ Created spec: ${relativePath}`);
}

/**
 * Deletes a spec file and removes its suite from feature config.
 */
export async function deleteSpec(featureKey?: string, suiteName?: string): Promise<void> {
  // Get all available features
  const availableFeatures = getAvailableFeatureKeys();
  
  if (availableFeatures.length === 0) {
    throw new Error("No features found");
  }

  // Select feature if not provided or show dropdown
  let normalizedFeatureKey: string;
  if (featureKey && featureKey.trim()) {
    normalizedFeatureKey = normalizeAndPrint(featureKey, "feature key");
    if (!availableFeatures.includes(normalizedFeatureKey)) {
      throw new Error(`Feature not found: ${normalizedFeatureKey}`);
    }
  } else {
    const featureOptions = availableFeatures.map((key) => ({
      value: key,
      name: key,
    }));
    normalizedFeatureKey = await select({
      message: "Select which feature:",
      choices: featureOptions,
    });
  }

  // Load config and verify feature exists
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  if (!config || !config[normalizedFeatureKey]) {
    throw new Error(`Feature not found: ${normalizedFeatureKey}`);
  }

  const feature = config[normalizedFeatureKey];
  const suiteIds = getSuiteIds(feature.suites);
  
  if (suiteIds.length === 0) {
    throw new Error(`Feature "${normalizedFeatureKey}" has no suites to delete`);
  }

  // Determine which suite to delete
  let selectedSuiteId: number;
  let selectedSuiteName: string;

  if (suiteIds.length === 1) {
    // Only one suite, use it
    selectedSuiteId = suiteIds[0];
    selectedSuiteName = getSuiteName(feature.suites, selectedSuiteId) || "";
  } else {
    // Multiple suites - prompt for selection
    if (suiteName) {
      // Suite name provided, find matching suite
      const normalizedSuiteName = normalizeSuiteName(suiteName);
      const matchingId = suiteIds.find((id) => {
        const name = getSuiteName(feature.suites, id);
        return name && name.toLowerCase() === normalizedSuiteName.toLowerCase();
      });
      
      if (!matchingId) {
        throw new Error(`Suite "${suiteName}" not found in feature "${normalizedFeatureKey}"`);
      }
      selectedSuiteId = matchingId;
      selectedSuiteName = getSuiteName(feature.suites, selectedSuiteId) || "";
    } else {
      // No suite name provided, show selection menu
      const suiteOptions = suiteIds.map((id) => {
        const name = getSuiteName(feature.suites, id);
        return {
          value: id,
          name: name ? `${id} - ${name}` : id.toString(),
        };
      });
      selectedSuiteId = await select({
        message: "Select which suite/spec to delete:",
        choices: suiteOptions,
      });
      selectedSuiteName = getSuiteName(feature.suites, selectedSuiteId) || "";
    }
  }

  // Find the spec file(s) for this suite
  const featureTestDir = paths.testDir(normalizedFeatureKey);
  const glob = (await import("fast-glob")).default;
  const allSpecs = await glob("*.spec.ts", { cwd: featureTestDir }).catch(() => []);
  
  // Find specs that match this suite (by suite name in the file or by suite ID in comments)
  const normalizedSuiteNameForFile = normalizeAndPrint(selectedSuiteName, "suite name");
  const matchingSpecs = allSpecs.filter((specFile) => {
    // Check if spec filename contains the suite name (normalized to kebab-case)
    const specNameBase = specFile.replace(/\.spec\.ts$/, "").toLowerCase();
    const suiteNameKebab = normalizedSuiteNameForFile.toLowerCase().replace(/\s+/g, "-");
    return specNameBase.includes(suiteNameKebab);
  });

  if (matchingSpecs.length === 0) {
    throw new Error(`No spec file found for suite "${selectedSuiteName}" in feature "${normalizedFeatureKey}"`);
  }

  // If multiple specs match, let user choose or delete all
  let specsToDelete: string[];
  if (matchingSpecs.length === 1) {
    specsToDelete = matchingSpecs;
  } else {
    // Multiple specs match - ask user
    const specOptions = matchingSpecs.map((spec) => ({
      value: spec,
      name: spec,
    }));
    specOptions.push({
      value: "__all__",
      name: "Delete all matching specs",
    });
    
    const selected = await select({
      message: `Multiple specs found for suite "${selectedSuiteName}". Which to delete?`,
      choices: specOptions,
    });
    
    if (selected === "__all__") {
      specsToDelete = matchingSpecs;
    } else {
      specsToDelete = [selected];
    }
  }

  // Confirm deletion (case-sensitive suite name)
  const confirmationText = specsToDelete.length === 1
    ? `delete ${selectedSuiteName}`
    : `delete ${specsToDelete.length} specs`;
  
  const confirmation = await input({
    message: `Type "${confirmationText}" to confirm deletion:`,
  });

  if (confirmation !== confirmationText) {
    throw new Error("Deletion cancelled: confirmation text did not match");
  }

  // Delete spec files
  for (const specFile of specsToDelete) {
    const specPath = path.join(featureTestDir, specFile);
    if (fileExists(specPath)) {
      await deleteFileSafe(specPath);
      const testsDir = path.join(REPO_ROOT, "tests");
      const relativePath = path.relative(testsDir, specPath).replace(/\\/g, "/");
      console.log(`✓ Deleted spec: tests/${relativePath}`);
    }
  }

  // Remove suite from feature config
  delete feature.suites[selectedSuiteId.toString()];
  
  // If this was the last suite, warn but don't delete the feature
  if (Object.keys(feature.suites).length === 0) {
    console.log(warning(`Warning: This was the last suite in feature "${normalizedFeatureKey}". The feature config entry remains but has no suites.`));
  }
  
  await writeJsonSafe(paths.featureConfig(), config, true);
  console.log(`✓ Removed suite "${selectedSuiteName}" (ID ${selectedSuiteId}) from feature config`);
}

/**
 * Finds a page fixture that matches the feature key.
 */
async function findPageFixtureForFeature(featureKey: string): Promise<string> {
  // Check if there's a page in the same feature directory
  const pageDir = paths.pageDir(featureKey);
  try {
    const fs = await import("fs");
    await fs.promises.access(pageDir);
    const glob = (await import("fast-glob")).default;
    const pageFiles = await glob("*.ts", { cwd: pageDir });
    if (pageFiles.length > 0) {
      const pageFile = pageFiles.find((f) => f.endsWith("Page.ts"));
      if (pageFile) {
        const pageName = pageFile.replace("Page.ts", "");
        return toCamelCase(pageName) + "Page";
      }
    }
  } catch {
    // Directory doesn't exist, continue
  }

  // Fallback to generic page
  return "page";
}
