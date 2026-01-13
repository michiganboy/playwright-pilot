// Command handlers for factory operations.
import { readFileSafe, writeFileSafe, fileExists, deleteFileSafe } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { normalizeAndPrint, normalizeToKey, toPascalCase } from "../utils/normalize";
import { getFactoryReferencedFiles } from "../utils/validation";
import { input, select, confirm } from "@inquirer/prompts";
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
 * Checks if a model already exists.
 */
function modelExists(modelKey: string): boolean {
  const modelPath = paths.model(modelKey);
  return fileExists(modelPath);
}


/**
 * Adds a new factory.
 */
export async function addFactory(factoryName?: string): Promise<void> {
  const indexPath = paths.factoriesIndex();
  const indexContent = await readFileSafe(indexPath);

  // Step 1: Factory name validation
  let finalFactoryName = factoryName;
  let factoryKey: string;
  let FactoryName: string;

  while (true) {
    if (!finalFactoryName || !finalFactoryName.trim()) {
      finalFactoryName = await input({
        message: "Enter factory name (or press Enter to exit):",
      });
      if (!finalFactoryName.trim()) {
        throw new Error("Factory creation cancelled.");
      }
    }

    const tempFactoryKey = normalizeToKey(finalFactoryName);
    if (!tempFactoryKey) {
      console.log("⚠️  Invalid factory name. Please enter a valid name.");
      finalFactoryName = "";
      continue;
    }

    // Check if factory exists
    if (factoryExists(tempFactoryKey, indexPath, indexContent)) {
      const tempFactoryName = toPascalCase(finalFactoryName);
      const useExisting = await confirm({
        message: `Factory "${tempFactoryName}" already exists. Use existing factory?`,
        default: false,
      });
      if (useExisting) {
        console.log(`No new factory created. User chose to use existing factory "${tempFactoryName}".`);
        return;
      }
      // User declined, prompt for new name
      finalFactoryName = "";
      continue;
    }

    // Factory name is unique
    factoryKey = normalizeAndPrint(finalFactoryName, "factory name");
    FactoryName = toPascalCase(finalFactoryName);
    break;
  }

  // Step 2: Model name resolution
  let modelKey: string;
  let ModelName: string;

  // Check if model exists (using factory name as model name)
  if (modelExists(factoryKey)) {
    const useExistingModel = await confirm({
      message: `Model "${FactoryName}" already exists. Reuse model?`,
      default: true,
    });
    if (useExistingModel) {
      modelKey = factoryKey;
      ModelName = FactoryName;
    } else {
      // Prompt for new model name (with validation loop)
      while (true) {
        const newModelName = await input({
          message: "Enter model name:",
        });
        if (!newModelName.trim()) {
          console.log("⚠️  Model name is required. Please enter a name.");
          continue;
        }

        const tempModelKey = normalizeToKey(newModelName);
        if (!tempModelKey) {
          console.log("⚠️  Invalid model name. Please enter a valid name.");
          continue;
        }

        // Check if this model name exists
        if (modelExists(tempModelKey)) {
          const tempModelName = toPascalCase(newModelName);
          const reuseModel = await confirm({
            message: `Model "${tempModelName}" already exists. Reuse model?`,
            default: true,
          });
          if (reuseModel) {
            modelKey = tempModelKey;
            ModelName = tempModelName;
            break;
          }
          // User declined, continue loop to prompt again
          continue;
        }

        // Model name is unique
        modelKey = normalizeAndPrint(newModelName, "model name");
        ModelName = toPascalCase(newModelName);
        break;
      }
    }
  } else {
    // Model doesn't exist, auto-create it using factory name
    modelKey = factoryKey;
    ModelName = FactoryName;
  }

  // Step 3: Create model if it doesn't exist
  if (!modelExists(modelKey)) {
    await createModelFile(modelKey, ModelName);
    await addModelToIndex(modelKey, ModelName);
  }

  // Step 4: Check if factory already exists for this model
  if (factoryExists(modelKey, indexPath, indexContent)) {
    const existingFactoryName = toPascalCase(modelKey);
    throw new Error(
      `A factory already exists for model "${ModelName}". Cannot create another factory for the same model.`
    );
  }

  // Step 5: Create builder file
  await createBuilderFile(modelKey, ModelName);

  // Step 6: Create factory (factory file is named after model, not factory name)
  await createFactoryFile(modelKey, ModelName);
  await addFactoryExport(modelKey);

  // Step 7: Success message
  console.log(`✓ Factory "${FactoryName}" created and associated to model "${ModelName}"`);
  console.log(`\n📋 Usage example:`);
  console.log(`\n  const ${modelKey} = factories.create${ModelName}();`);
  console.log(`  await set("test.${modelKey}", ${modelKey});`);
  console.log(`  const ${modelKey}Data = await get("test.${modelKey}");`);
  console.log(`\n  test("Example test", async ({ page }) => {`);
  console.log(`    const id = ${modelKey}Data.id;`);
  console.log(`    const email = ${modelKey}Data.email;`);
  console.log(`    // Use ${modelKey}Data in your test`);
  console.log(`  });`);
}

/**
 * Creates a model file with placeholder fields.
 */
async function createModelFile(modelKey: string, ModelName: string): Promise<void> {
  const modelPath = paths.model(modelKey);
  const templatePath = paths.templates("model.ts");
  const template = await readFileSafe(templatePath);

  if (!template) {
    throw new Error(`Model template not found: ${templatePath}`);
  }

  // Special case: User model gets full default field set
  // WHY: User is the most common model in test automation. Providing a complete
  // default shape (id, email, role, firstName, lastName, fullName, phone, address)
  // reduces boilerplate and ensures consistency across projects. Other models
  // start with minimal fields (id, email) and can be extended as needed.
  let placeholderFields: string;
  if (modelKey === "user") {
    placeholderFields = `  id: string;
  email: string;
  role: "admin" | "agent" | "viewer";
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  address: {
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  };`;
  } else {
    placeholderFields = "  id: string;\n  email: string;";
  }

  const modelContent = template
    .replace(/{{ModelName}}/g, ModelName)
    .replace(/{{fields}}/g, placeholderFields);

  await writeFileSafe(modelPath, modelContent);
}

/**
 * Adds a model to models/index.ts (export, import, and ModelMap entry).
 */
async function addModelToIndex(modelKey: string, ModelName: string): Promise<void> {
  const indexPath = paths.modelsIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    content = "";
  }

  const lines = content.split("\n");

  // Add export line if it doesn't exist
  const exportLine = `export * from './${modelKey}';`;
  const exportPattern = new RegExp(`export \\* from ['"]\\./${modelKey}['"];`, "g");
  if (!exportPattern.test(content)) {
    // Find the last export line and add after it
    let lastExportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("export * from")) {
        lastExportIndex = i;
      }
    }
    if (lastExportIndex >= 0) {
      lines.splice(lastExportIndex + 1, 0, exportLine);
    } else {
      // No exports yet, add at the beginning
      lines.unshift(exportLine);
    }
  }

  // Rebuild content from lines
  content = lines.join("\n");

  // Add import line if it doesn't exist
  const importLine = `import type { ${ModelName} } from './${modelKey}';`;
  const importPattern = new RegExp(`import type \\{ ${ModelName} \\} from ['"]\\./${modelKey}['"];`, "g");
  if (!importPattern.test(content)) {
    // Find where ModelMap starts to insert import before it
    const modelMapIndex = content.indexOf("export interface ModelMap");
    if (modelMapIndex >= 0) {
      // Insert import before ModelMap (with proper spacing)
      const beforeModelMap = content.substring(0, modelMapIndex).trim();
      const afterModelMap = content.substring(modelMapIndex);
      content = beforeModelMap + "\n\n" + importLine + "\n\n" + afterModelMap;
    } else {
      // No ModelMap, add import at the end
      content = content.trim() + "\n\n" + importLine;
    }
  }

  // Add to ModelMap if it doesn't exist
  const modelMapRegex = /export interface ModelMap \{([\s\S]*?)\}/;
  const modelMapMatch = content.match(modelMapRegex);
  if (modelMapMatch) {
    const modelMapContent = modelMapMatch[1];
    const modelMapEntry = `  ${ModelName}: ${ModelName};`;
    if (!modelMapContent.includes(modelMapEntry)) {
      // Add entry before closing brace
      const trimmedContent = modelMapContent.trim();
      const newModelMapContent = trimmedContent
        ? trimmedContent + "\n" + modelMapEntry
        : modelMapEntry;
      content = content.replace(modelMapRegex, `export interface ModelMap {\n${newModelMapContent}\n}`);
    }
  } else {
    // ModelMap doesn't exist, create it
    const modelMapSection = `\n\nexport interface ModelMap {\n  ${ModelName}: ${ModelName};\n}`;
    content = content.trim() + modelMapSection;
  }

  await writeFileSafe(indexPath, content, true);
}

/**
 * Creates a builder file.
 */
async function createBuilderFile(modelKey: string, ModelName: string): Promise<void> {
  const builderPath = paths.builder(modelKey);

  // Special case: User builder gets full default field set
  // WHY: User is the most common model in test automation. Providing a complete
  // builder with all field generators and postBuild hook ensures new User factories
  // ship with production-ready defaults. Other models use the generic template.
  if (modelKey === "user") {
    const userBuilderContent = `// User builder using mimicry-js (private - used by factories only)
import { build } from "mimicry-js";
import type * as models from "../../testdata/models";
import { createTools } from "../../testdata/tools";

// Define the User model for the builder
interface UserModel {
  id: string;
  email: string;
  role: "admin" | "agent" | "viewer";
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  address: {
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

// Create tools with idPrefix - tools are created per-builder to support per-test seeding
function getTools() {
  return createTools("user");
}

// Create the builder with default values
const userBuilder = build<UserModel>({
  fields: {
    id: () => getTools().id.short(),
    email: () => getTools().person.email(),
    role: () => getTools().pick.one(["admin", "agent", "viewer"]) || "admin",
    firstName: () => getTools().person.firstName(),
    lastName: () => getTools().person.lastName(),
    fullName: () => "", // Set in postBuild
    phone: () => getTools().person.phone(),
    address: () => ({
      streetAddress: getTools().person.streetAddress(),
      city: getTools().person.city(),
      state: getTools().person.state(),
      zipCode: getTools().person.zipCode(),
    }),
  },
  traits: {
    // Define traits (optional variations) here
    // Example:
    // admin: {
    //   overrides: {
    //     role: () => "admin" as const,
    //     email: () => "admin@example.com",
    //   },
    // },
  },
  // Post-build hook: derive fullName from firstName and lastName
  postBuild: (user) => {
    user.fullName = \`\${user.firstName} \${user.lastName}\`;
    return user;
  },
});

// Export builder methods for factory use
export function buildUser(overrides?: Partial<UserModel>): models.User {
  return userBuilder.one({ overrides });
}

export function buildUsers(count: number, overrides?: Partial<UserModel>): models.User[] {
  return userBuilder.many(count, { overrides });
}

// Export traits for factory use (if any)
export const userTraits = {
  // Example: admin: "admin" as const,
} as const;
`;
    await writeFileSafe(builderPath, userBuilderContent);
    return;
  }

  // Generic builder for other models
  const templatePath = paths.templates("builder.ts");
  const template = await readFileSafe(templatePath);

  if (!template) {
    throw new Error(`Builder template not found: ${templatePath}`);
  }

  const builderContent = template
    .replace(/{{ModelName}}/g, ModelName)
    .replace(/{{modelKey}}/g, modelKey);

  await writeFileSafe(builderPath, builderContent);
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

  // Delete builder file if it exists
  const builderPath = paths.builder(modelKey);
  if (fileExists(builderPath)) {
    await deleteFileSafe(builderPath);
    console.log(`✓ Deleted builder: ${builderPath}`);
  }

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

