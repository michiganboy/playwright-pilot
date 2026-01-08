// Command handlers for spec operations.
import { readJsonSafe, writeFileSafe, fileExists } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { normalizeAndPrint, toPascalCase, toCamelCase } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { input } from "@inquirer/prompts";
import path from "path";

interface FeatureConfig {
  [key: string]: {
    tag: string;
    planId: number;
    suites: number[];
  };
}

/**
 * Adds a new spec file to an existing feature.
 */
export async function addSpec(specName: string, featureKey: string): Promise<void> {
  const normalizedSpecName = normalizeAndPrint(specName, "spec name");
  const normalizedFeatureKey = normalizeAndPrint(featureKey, "feature key");

  // Verify feature exists
  const config = await readJsonSafe<FeatureConfig>(paths.featureConfig());
  if (!config || !config[normalizedFeatureKey]) {
    throw new Error(`Feature not found: ${normalizedFeatureKey}. Create it first with 'pilot add:feature'.`);
  }

  const feature = config[normalizedFeatureKey];
  const testDir = paths.testDir(normalizedFeatureKey);

  // Generate spec ID (use feature prefix + increment)
  const featureTestDir = paths.testDir(normalizedFeatureKey);
  const existingSpecs = await import("fast-glob").then((m) =>
    m.glob("*.spec.ts", { cwd: featureTestDir }).catch(() => [])
  );
  const specNumber = existingSpecs.length + 1;
  const specId = normalizedFeatureKey.toUpperCase().slice(0, 4) + `-${100 + specNumber}`;
  const testId1 = `${10000 + specNumber * 2}`;
  const testId2 = `${10000 + specNumber * 2 + 1}`;

  // Try to find a page fixture for this feature
  const pageFixture = await findPageFixtureForFeature(normalizedFeatureKey);

  // Load template and render
  const specTemplate = await loadTemplate("spec.ts");
  const specContent = renderTemplate(specTemplate, {
    featureKey: normalizedFeatureKey,
    tag: feature.tag,
    planId: feature.planId.toString(),
    suites: feature.suites.join(", "),
    specId,
    description: normalizedSpecName.replace(/-/g, " "),
    testId1,
    testId2,
    pageFixture,
  });

  const specFileName = `${specId}-${normalizedSpecName}.spec.ts`;
  const specPath = path.join(featureTestDir, specFileName);

  if (fileExists(specPath)) {
    throw new Error(`Spec file already exists: ${specPath}`);
  }

  await writeFileSafe(specPath, specContent);

  console.log(`✓ Created spec: ${specPath}`);
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
    const pageFiles = await import("fast-glob").then((m) =>
      m.glob("*.ts", { cwd: pageDir })
    );
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
