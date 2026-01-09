// Command handlers for factory operations.
import { readFileSafe, writeFileSafe, fileExists, deleteFileSafe } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { normalizeAndPrint, toPascalCase } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { isFactoryReferenced } from "../utils/validation";
import { input, select, confirm } from "@inquirer/prompts";
import { suggestFakerMethod, getFieldTypes } from "../utils/fakerSuggestions";
import path from "path";

interface ModelField {
  name: string;
  type: string;
  fakerMethod: string;
}

/**
 * Adds a new factory.
 */
export async function addFactory(modelName?: string): Promise<void> {
  // Prompt for model name if not provided
  let finalModelName = modelName;
  if (!finalModelName || !finalModelName.trim()) {
    finalModelName = await input({
      message: "Enter model name:",
    });
    if (!finalModelName.trim()) {
      throw new Error("Model name is required");
    }
  }

  let modelKey = normalizeAndPrint(finalModelName, "model name");
  let ModelName = toPascalCase(finalModelName);

  // Check if model exists
  const modelPath = paths.model(modelKey);
  let modelFields: ModelField[] = [];
  let useExistingModel = false;

  if (fileExists(modelPath)) {
    useExistingModel = await confirm({
      message: `Model "${ModelName}" already exists. Use existing model?`,
      default: true,
    });

    if (!useExistingModel) {
      // User wants to create a new model with different name
      let newModelName = "";
      while (!newModelName.trim()) {
        newModelName = await input({
          message: "Enter new model name:",
        });
        if (!newModelName.trim()) {
          console.log("⚠️  Model name is required. Please enter a name.");
        }
      }
      const newModelKey = normalizeAndPrint(newModelName, "model name");
      const newModelPath = paths.model(newModelKey);
      if (fileExists(newModelPath)) {
        throw new Error(`Model "${newModelName}" already exists: ${newModelPath}`);
      }
      // Update to use the new model name for factory too
      modelKey = newModelKey;
      ModelName = toPascalCase(newModelName);
      modelFields = await promptForModelFields(ModelName);
      await createModelFile(modelKey, ModelName, modelFields);
      await updateModelsIndex(modelKey, ModelName);
    } else {
      // Parse existing model to extract fields
      modelFields = await parseModelFields(modelPath);
    }
  } else {
    // Model doesn't exist, prompt for fields
    modelFields = await promptForModelFields(ModelName);
    await createModelFile(modelKey, ModelName, modelFields);
    await updateModelsIndex(modelKey, ModelName);
  }

  // Now check factory (after model name is finalized)
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

  // Create factory with fields
  await createFactoryFile(modelKey, ModelName, modelFields);

  // Add to barrel export
  await addFactoryExport(modelKey);

  console.log(`✓ Created factory: ${paths.factory(modelKey)}`);
  if (!useExistingModel) {
    console.log(`✓ Created model: ${paths.model(modelKey)}`);
    console.log(`✓ Updated models/index.ts`);
  }
  console.log(`✓ Added export to ${indexPath}`);

  // Print import string
  console.log(`\n📋 Import this in your test:`);
  console.log(`import * as factories from "../../../src/testdata/factories";`);
  console.log(`// Usage: const ${modelKey} = await factories.create${ModelName}().save("test.${modelKey}");`);
}

/**
 * Prompts user for model fields.
 */
async function promptForModelFields(modelName: string): Promise<ModelField[]> {
  const fields: ModelField[] = [];
  const fieldTypes = getFieldTypes();

  console.log(`\n💡 Enter fields for ${modelName} model (press Enter with empty name to finish).\n`);

  while (true) {
    const fieldName = await input({
      message: fields.length === 0 ? "Enter field name:" : "Enter field name (or press Enter to finish):",
    });

    if (!fieldName.trim()) {
      if (fields.length === 0) {
        console.log("⚠️  At least one field is required.");
        continue;
      } else {
        break;
      }
    }

    const fieldType = await select({
      message: `Select type for "${fieldName}":`,
      choices: fieldTypes,
    });

    const suggestedFaker = suggestFakerMethod(fieldName, fieldType);
    const useSuggested = await confirm({
      message: `Suggested faker method: ${suggestedFaker}\n  Use suggested?`,
      default: true,
    });

    let fakerMethod = suggestedFaker;
    if (!useSuggested) {
      fakerMethod = await input({
        message: `Enter faker method for "${fieldName}" (e.g., faker.string.uuid()):`,
      });
      if (!fakerMethod.trim()) {
        fakerMethod = suggestedFaker;
        console.log(`⚠️  Using suggested method: ${suggestedFaker}`);
      }
    }

    fields.push({ name: fieldName.trim(), type: fieldType, fakerMethod });
    console.log(`✓ Added field: ${fieldName} (${fieldType})\n`);
  }

  return fields;
}

/**
 * Creates a model file with the specified fields.
 */
async function createModelFile(modelKey: string, ModelName: string, fields: ModelField[]): Promise<void> {
  const modelPath = paths.model(modelKey);
  const fieldsString = fields.map((f) => `  ${f.name}: ${f.type};`).join("\n");
  const modelContent = `export interface ${ModelName} {\n${fieldsString}\n}\n`;

  await writeFileSafe(modelPath, modelContent);
}

/**
 * Updates models/index.ts to include the new model.
 */
async function updateModelsIndex(modelKey: string, ModelName: string): Promise<void> {
  const indexPath = paths.modelsIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    content = "";
  }

  // Add export
  const exportLine = `export * from "./${modelKey}";`;
  if (!content.includes(exportLine)) {
    // Find the last export line and add after it
    const exportLines = content.match(/export \* from ['"].*['"];/g) || [];
    if (exportLines.length > 0) {
      const lastExportIndex = content.lastIndexOf(exportLines[exportLines.length - 1]);
      const insertIndex = content.indexOf("\n", lastExportIndex);
      if (insertIndex !== -1) {
        content = content.slice(0, insertIndex + 1) + exportLine + "\n" + content.slice(insertIndex + 1);
      } else {
        content += "\n" + exportLine + "\n";
      }
    } else {
      content = exportLine + "\n" + content;
    }
  }

  // Update ModelMap
  const modelMapRegex = /export interface ModelMap \{([\s\S]*?)\}/;
  const modelMapMatch = content.match(modelMapRegex);

  if (modelMapMatch) {
    const modelMapContent = modelMapMatch[1];
    const importLine = `import type { ${ModelName} } from './${modelKey}';`;
    
    // Add import if not exists
    if (!content.includes(importLine)) {
      const imports = content.match(/import type \{ .* \} from ['"].*['"];/g) || [];
      if (imports.length > 0) {
        const lastImportIndex = content.lastIndexOf(imports[imports.length - 1]);
        const insertIndex = content.indexOf("\n", lastImportIndex);
        if (insertIndex !== -1) {
          content = content.slice(0, insertIndex + 1) + importLine + "\n" + content.slice(insertIndex + 1);
        } else {
          content = importLine + "\n" + content;
        }
      } else {
        // Find where to insert (before ModelMap)
        const modelMapIndex = content.indexOf("export interface ModelMap");
        if (modelMapIndex !== -1) {
          content = content.slice(0, modelMapIndex) + importLine + "\n\n" + content.slice(modelMapIndex);
        }
      }
    }

    // Add to ModelMap
    const modelMapEntry = `  ${ModelName}: ${ModelName};`;
    if (!modelMapContent.includes(modelMapEntry)) {
      const newModelMapContent = modelMapContent.trim() + "\n" + modelMapEntry;
      content = content.replace(modelMapRegex, `export interface ModelMap {${newModelMapContent}\n}`);
    }
  } else {
    // ModelMap doesn't exist, create it
    const importLine = `import type { ${ModelName} } from './${modelKey}';`;
    if (!content.includes(importLine)) {
      content += "\n" + importLine + "\n";
    }
    content += `\nexport interface ModelMap {\n  ${ModelName}: ${ModelName};\n}\n`;
  }

  await writeFileSafe(indexPath, content, true);
}

/**
 * Parses an existing model file to extract fields.
 */
async function parseModelFields(modelPath: string): Promise<ModelField[]> {
  const content = await readFileSafe(modelPath);
  if (!content) {
    return [];
  }

  // Extract interface content
  const interfaceMatch = content.match(/export interface \w+ \{([\s\S]*?)\}/);
  if (!interfaceMatch) {
    return [];
  }

  const fieldsContent = interfaceMatch[1];
  const fieldLines = fieldsContent.split("\n").filter((line) => line.trim());

  const fields: ModelField[] = [];
  for (const line of fieldLines) {
    // Match: "  fieldName: type;"
    const fieldMatch = line.match(/\s+(\w+):\s+(\w+);/);
    if (fieldMatch) {
      const [, fieldName, fieldType] = fieldMatch;
      const fakerMethod = suggestFakerMethod(fieldName, fieldType);
      fields.push({ name: fieldName, type: fieldType, fakerMethod });
    }
  }

  return fields;
}

/**
 * Creates a factory file with the specified fields and faker methods.
 */
async function createFactoryFile(modelKey: string, ModelName: string, fields: ModelField[]): Promise<void> {
  const factoryPath = paths.factory(modelKey);
  
  let factoryFields = "";
  if (fields.length > 0) {
    factoryFields = fields.map((f) => `    ${f.name}: ${f.fakerMethod},`).join("\n") + "\n";
  } else {
    // No fields parsed, use placeholder
    factoryFields = "    // TODO: Add your model fields here with faker data\n    id: faker.string.uuid(),\n";
  }
  
  const factoryContent = `import { faker } from "@faker-js/faker";
import type * as models from "../models";
import { save } from "../../utils/dataStore";
import type { DataStoreMap } from "../../utils/dataStore";

export function create${ModelName}(overrides?: Partial<models.${ModelName}>) {
  const ${modelKey}: models.${ModelName} = {
${factoryFields}    ...overrides,
  };

  return {
    ...${modelKey},
    async save<K extends keyof DataStoreMap>(key: K): Promise<models.${ModelName}> {
      await save(key, ${modelKey} as unknown as DataStoreMap[K]);
      return ${modelKey};
    },
  };
}
`;

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
