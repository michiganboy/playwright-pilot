// Command handlers for factory operations.
import { readFileSafe, writeFileSafe, fileExists, deleteFileSafe } from "../utils/fileOps";
import { paths } from "../utils/paths";
import { normalizeAndPrint, toPascalCase } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { isFactoryReferenced } from "../utils/validation";
import { input } from "@inquirer/prompts";

/**
 * Adds a new factory.
 */
export async function addFactory(modelName: string): Promise<void> {
  const modelKey = normalizeAndPrint(modelName, "model name");
  const ModelName = toPascalCase(modelName);

  const factoryPath = paths.factory(modelKey);
  if (fileExists(factoryPath)) {
    throw new Error(`Factory already exists: ${factoryPath}`);
  }

  // Check if export already exists in index
  const indexPath = paths.factoriesIndex();
  const indexContent = await readFileSafe(indexPath);
  if (indexContent && indexContent.includes(`${modelKey}.factory`)) {
    throw new Error(`Factory export already exists in ${indexPath}`);
  }

  // Load template and render
  const template = await loadTemplate("factory.ts");
  const content = renderTemplate(template, {
    ModelName,
    modelKey,
  });

  await writeFileSafe(factoryPath, content);

  // Add to barrel export
  await addFactoryExport(modelKey);

  console.log(`✓ Created factory: ${factoryPath}`);
  console.log(`✓ Added export to ${indexPath}`);
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

  const exportLine = `export * from "./${modelKey}.factory";`;
  if (content.includes(exportLine)) {
    return; // Already exported
  }

  // Add export at the end
  if (content.trim()) {
    content += "\n" + exportLine + "\n";
  } else {
    content = exportLine + "\n";
  }

  await writeFileSafe(indexPath, content, true);
}

/**
 * Deletes a factory.
 */
export async function deleteFactory(factoryName: string): Promise<void> {
  const modelKey = normalizeAndPrint(factoryName, "factory name");

  // Check if referenced
  const factoryFunctionName = `create${toPascalCase(factoryName)}`;
  const isReferenced = await isFactoryReferenced(factoryFunctionName);
  if (isReferenced) {
    throw new Error(
      `Cannot delete factory: "${factoryFunctionName}" is referenced in test files. Remove references first.`
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

  const exportPattern = new RegExp(`export \\* from "\\./${modelKey}\\.factory";\\n?`, "g");
  content = content.replace(exportPattern, "");

  await writeFileSafe(indexPath, content, true);
}
