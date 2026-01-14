// Non-interactive factory utilities for test setup/teardown.
// These functions create and delete factories programmatically without user prompts.
import { readFileSafe, writeFileSafe, fileExists, deleteFileSafe } from "./fileOps";
import { paths } from "./paths";
import { toPascalCase } from "./normalize";

/**
 * Creates a factory programmatically (no prompts).
 * Used by TOOLS tests for setup.
 */
export async function createFactoryForTest(modelKey: string): Promise<void> {
  const ModelName = toPascalCase(modelKey);

  // Create model
  await createModelFile(modelKey, ModelName);
  await addModelToIndex(modelKey, ModelName);

  // Create builder
  await createBuilderFile(modelKey, ModelName);

  // Create factory
  await createFactoryFile(modelKey, ModelName);
  await addFactoryExport(modelKey);
}

/**
 * Deletes a factory programmatically (no prompts).
 * Used by TOOLS tests for teardown.
 */
export async function deleteFactoryForTest(modelKey: string): Promise<void> {
  const ModelName = toPascalCase(modelKey);

  // Delete factory file
  const factoryPath = paths.factory(modelKey);
  if (fileExists(factoryPath)) {
    await deleteFileSafe(factoryPath);
  }

  // Delete builder file
  const builderPath = paths.builder(modelKey);
  if (fileExists(builderPath)) {
    await deleteFileSafe(builderPath);
  }

  // Delete model file
  const modelPath = paths.model(modelKey);
  if (fileExists(modelPath)) {
    await deleteFileSafe(modelPath);
  }

  // Remove from index files
  await removeFactoryExport(modelKey);
  await removeModelFromIndex(modelKey, ModelName);
}

/**
 * Checks if a factory exists.
 */
export function factoryExistsForTest(modelKey: string): boolean {
  return fileExists(paths.factory(modelKey));
}

// --- Internal helpers (copied from factory.ts to avoid circular deps) ---

async function createModelFile(modelKey: string, ModelName: string): Promise<void> {
  const modelPath = paths.model(modelKey);
  const templatePath = paths.templates("model.ts");
  const template = await readFileSafe(templatePath);

  if (!template) {
    throw new Error(`Model template not found: ${templatePath}`);
  }

  // Special case: User model gets full default field set
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
    let lastExportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("export * from")) {
        lastExportIndex = i;
      }
    }
    if (lastExportIndex >= 0) {
      lines.splice(lastExportIndex + 1, 0, exportLine);
    } else {
      lines.unshift(exportLine);
    }
  }

  content = lines.join("\n");

  // Add import line if it doesn't exist
  const importLine = `import type { ${ModelName} } from './${modelKey}';`;
  const importPattern = new RegExp(`import type \\{ ${ModelName} \\} from ['"]\\./${modelKey}['"];`, "g");
  if (!importPattern.test(content)) {
    const modelMapIndex = content.indexOf("export interface ModelMap");
    if (modelMapIndex >= 0) {
      const beforeModelMap = content.substring(0, modelMapIndex).trim();
      const afterModelMap = content.substring(modelMapIndex);
      content = beforeModelMap + "\n\n" + importLine + "\n\n" + afterModelMap;
    } else {
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
      const trimmedContent = modelMapContent.trim();
      const newModelMapContent = trimmedContent
        ? trimmedContent + "\n" + modelMapEntry
        : modelMapEntry;
      content = content.replace(modelMapRegex, `export interface ModelMap {\n${newModelMapContent}\n}`);
    }
  } else {
    const modelMapSection = `\n\nexport interface ModelMap {\n  ${ModelName}: ${ModelName};\n}`;
    content = content.trim() + modelMapSection;
  }

  await writeFileSafe(indexPath, content, true);
}

async function createBuilderFile(modelKey: string, ModelName: string): Promise<void> {
  const builderPath = paths.builder(modelKey);

  // Special case: User builder gets full default field set
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
  traits: {},
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
export const userTraits = {} as const;
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

async function addFactoryExport(modelKey: string): Promise<void> {
  const indexPath = paths.factoriesIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    content = "";
  }

  const exportLine = `export * from './${modelKey}.factory';`;
  const exportPattern = new RegExp(`export \\* from ['"]\\./${modelKey}\\.factory['"];`, "g");
  if (exportPattern.test(content)) {
    return;
  }

  const trimmed = content.trim();
  // Remove empty export if present
  const cleanedContent = trimmed.replace(/export \{ \};?\n?/g, "").trim();
  
  if (cleanedContent) {
    content = cleanedContent + "\n" + exportLine + "\n";
  } else {
    content = exportLine + "\n";
  }

  await writeFileSafe(indexPath, content, true);
}

async function removeFactoryExport(modelKey: string): Promise<void> {
  const indexPath = paths.factoriesIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    return;
  }

  const exportPattern = new RegExp(`export \\* from ['"]\\./${modelKey}\\.factory['"];\\n?`, "g");
  content = content.replace(exportPattern, "");

  // If content is nearly empty, restore default empty export
  const trimmed = content.trim();
  if (!trimmed || trimmed === "// Factory exports will be added here automatically by the CLI") {
    content = "// Factory exports will be added here automatically by the CLI\n\nexport { };\n";
  }

  await writeFileSafe(indexPath, content, true);
}

async function removeModelFromIndex(modelKey: string, ModelName: string): Promise<void> {
  const indexPath = paths.modelsIndex();
  let content = await readFileSafe(indexPath);
  if (!content) {
    return;
  }

  // Remove export line
  const exportPattern = new RegExp(`export \\* from ['"]\\./${modelKey}['"];\\n?`, "g");
  content = content.replace(exportPattern, "");

  // Remove import line
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

    content = content.replace(modelMapRegex, `export interface ModelMap {\n${newModelMapContent}\n}`);
  }

  await writeFileSafe(indexPath, content, true);
}
