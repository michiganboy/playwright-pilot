// Command handlers for factory operations.
import { readFileSafe, writeFileSafe, fileExists, deleteFileSafe } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { normalizeAndPrint, normalizeToKey, toPascalCase } from "../utils/normalize";
import { getFactoryReferencedFiles } from "../utils/validation";
import { input, select } from "@inquirer/prompts";
import path from "path";

/**
 * Checks if a factory already exists (by file or export).
 */
function factoryExists(modelKey: string, indexPath: string, indexContent: string | null): boolean {
  const factoryPath = paths.factory(modelKey);
  if (fileExists(factoryPath)) {
    return true;
  }
  if (indexContent && indexContent.includes(`${modelKey}.factory`)) {
    return true;
  }
  return false;
}

/**
 * Adds a new factory.
 */
export async function addFactory(factoryName?: string): Promise<void> {
  // Prompt for factory name if not provided, and keep prompting until unique
  let finalFactoryName = factoryName;
  let modelKey: string;
  let ModelName: string;

  const indexPath = paths.factoriesIndex();
  const indexContent = await readFileSafe(indexPath);

  while (true) {
    if (!finalFactoryName || !finalFactoryName.trim()) {
      finalFactoryName = await input({
        message: "Enter factory name (or press Enter to exit):",
      });
      if (!finalFactoryName.trim()) {
        // User pressed Enter to exit
        throw new Error("Factory creation cancelled.");
      }
    }

    // Normalize without printing (we'll print after validation)
    const tempModelKey = normalizeToKey(finalFactoryName);
    if (!tempModelKey) {
      console.log("⚠️  Invalid factory name. Please enter a valid name.");
      finalFactoryName = "";
      continue;
    }

    // Check if factory exists BEFORE showing any success indicators
    if (factoryExists(tempModelKey, indexPath, indexContent)) {
      const tempModelName = toPascalCase(finalFactoryName);
      console.log(`⚠️  Factory "${tempModelName}" already exists. Please enter a different factory name or press Enter to exit.`);
      finalFactoryName = ""; // Reset to prompt again
      continue;
    }

    // Factory name is unique, now normalize and print
    modelKey = normalizeAndPrint(finalFactoryName, "factory name");
    ModelName = toPascalCase(finalFactoryName);
    break;
  }

  // Ensure model exists before creating a factory
  const modelPath = paths.model(modelKey);
  if (!fileExists(modelPath)) {
    throw new Error(
      `Model "${ModelName}" does not exist. Create the model first before creating a factory.`
    );
  }
}

/**
 * Creates a factory file.
 */
async function createFactoryFile(modelKey: string, ModelName: string): Promise<void> {

  const factoryPath = paths.factory(modelKey);

  const templatePath = paths.templates("factory.ts");
  const template = await readFileSafe(templatePath);

  if (!template) {
    throw new Error(`Factory template not found: ${templatePath}`);
  }

  const factoryContent = template
    .replace(/{{ModelName}}/g, ModelName)
    .replace(/{{modelKey}}/g, modelKey);

  await writeFileSafe(factoryPath, factoryContent);
}

/**
 * Adds a factory export to the barrel file.
 */
async function addFactoryExport(modelKey: string): Promise<void> {
  const indexPath = paths.factoriesIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    content = "";
  }

  // Use single quotes for consistency
  const exportLine = `export * from './${modelKey}.factory';`;
  // Check if export exists (handle both quote styles)
  const exportPattern = new RegExp(`export \\* from ['"]\\./${modelKey}\\.factory['"];`, "g");
  if (exportPattern.test(content)) {
    return; // Already exported
  }

  // Add export at the end, ensuring proper newline spacing
  const trimmed = content.trim();
  if (trimmed) {
    // Add newline if content doesn't end with one
    content = trimmed.endsWith("\n") ? trimmed + exportLine + "\n" : trimmed + "\n" + exportLine + "\n";
  } else {
    content = exportLine + "\n";
  }

  await writeFileSafe(indexPath, content, true);
}

/**
 * Deletes a factory.
 */
export async function deleteFactory(factoryName?: string): Promise<void> {
  // Find all available factories
  const glob = (await import("fast-glob")).default;
  const factoryFiles = await glob("src/testdata/factories/*.factory.ts", { cwd: REPO_ROOT }).catch(() => []);

  const availableFactories: Array<{ value: string; name: string; modelKey: string }> = [];

  for (const factoryFile of factoryFiles) {
    const modelKey = path.basename(factoryFile, ".factory.ts");
    const ModelName = toPascalCase(modelKey);
    availableFactories.push({
      value: modelKey,
      name: ModelName,
      modelKey,
    });
  }

  if (availableFactories.length === 0) {
    throw new Error("No factories found to delete");
  }

  // Select factory if not provided or show dropdown
  let selectedModelKey: string;
  if (factoryName && factoryName.trim()) {
    const normalizedInput = normalizeAndPrint(factoryName, "factory name");
    const matching = availableFactories.find((f) => f.modelKey === normalizedInput);
    if (!matching) {
      throw new Error(`Factory not found: ${normalizedInput}`);
    }
    selectedModelKey = matching.modelKey;
  } else {
    const factoryOptions = availableFactories.map((f) => ({
      value: f.modelKey,
      name: f.name,
    }));
    selectedModelKey = await select({
      message: "Select which factory to delete:",
      choices: factoryOptions,
    });
  }

  const modelKey = selectedModelKey;

  // Check if referenced
  const factoryFunctionName = `create${toPascalCase(modelKey)}`;
  const referencedFiles = await getFactoryReferencedFiles(factoryFunctionName);
  if (referencedFiles.length > 0) {
    const fileList = referencedFiles.map((f) => `  - ${f}`).join("\n");
    throw new Error(
      `Cannot delete factory: "${factoryFunctionName}" is being used in the following file(s):\n${fileList}\n\nRemove references first.`
    );
  }

  const factoryPath = paths.factory(modelKey);
  if (!fileExists(factoryPath)) {
    throw new Error(`Factory not found: ${factoryPath}`);
  }

  // Confirm deletion
  const confirmation = await input({
    message: `Type "delete factory ${modelKey}" to confirm deletion:`,
  });

  if (confirmation !== `delete factory ${modelKey}`) {
    throw new Error("Deletion cancelled: confirmation text did not match");
  }

  // Delete file
  await deleteFileSafe(factoryPath);

  // Remove export
  await removeFactoryExport(modelKey);

  // Delete matching model file and remove from models/index.ts
  const modelPath = paths.model(modelKey);
  if (fileExists(modelPath)) {
    await deleteFileSafe(modelPath);
    await removeModelFromIndex(modelKey, toPascalCase(modelKey));
    console.log(`✓ Deleted model: ${modelPath}`);
    console.log(`✓ Removed model from ${paths.modelsIndex()}`);
  }

  console.log(`✓ Deleted factory: ${factoryPath}`);
  console.log(`✓ Removed export from ${paths.factoriesIndex()}`);
}

/**
 * Removes a factory export from the barrel file.
 */
async function removeFactoryExport(modelKey: string): Promise<void> {
  const indexPath = paths.factoriesIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    return;
  }

  // Remove export line (handle both single and double quotes)
  const exportPattern = new RegExp(`export \\* from ['"]\\./${modelKey}\\.factory['"];\\n?`, "g");
  content = content.replace(exportPattern, "");

  await writeFileSafe(indexPath, content, true);
}

/**
 * Removes a model from models/index.ts (both export and ModelMap entry).
 */
async function removeModelFromIndex(modelKey: string, ModelName: string): Promise<void> {
  const indexPath = paths.modelsIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    return;
  }

  // Remove export line (handle both single and double quotes)
  const exportPattern = new RegExp(`export \\* from ['"]\\./${modelKey}['"];\\n?`, "g");
  content = content.replace(exportPattern, "");

  // Remove import line (handle both single and double quotes)
  const importPattern = new RegExp(`import type \\{ ${ModelName} \\} from ['"]\\./${modelKey}['"];\\n?`, "g");
  content = content.replace(importPattern, "");

  // Remove from ModelMap
  const modelMapRegex = /export interface ModelMap \{([\s\S]*?)\}/;
  const modelMapMatch = content.match(modelMapRegex);
  if (modelMapMatch) {
    const modelMapContent = modelMapMatch[1];
    const modelMapEntry = `  ${ModelName}: ${ModelName};`;
    const newModelMapContent = modelMapContent
      .split("\n")
      .filter((line) => !line.includes(modelMapEntry))
      .join("\n")
      .trim();

    if (newModelMapContent) {
      content = content.replace(modelMapRegex, `export interface ModelMap {\n${newModelMapContent}\n}`);
    } else {
      // ModelMap is empty, remove it entirely
      content = content.replace(modelMapRegex, "");
    }
  }

  await writeFileSafe(indexPath, content, true);
}
