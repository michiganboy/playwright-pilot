// CLI commands for managing canonical system entries.
import { readFileSafe, writeFileSafe, fileExists } from "../utils/fileOps";
import { paths, REPO_ROOT } from "../utils/paths";
import { input, confirm } from "@inquirer/prompts";
import { updateSystemRegistry, readCanonicalStore } from "../../utils/dataStore";
import { system } from "../../testdata/system";
import { glob } from "fast-glob";
import path from "path";

/**
 * Normalizes input to dot-path format (lowercase, dots only).
 */
function normalizeToDotPath(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s\/_\-]+/g, ".") // Replace spaces/slashes/underscores/dashes with dots
    .replace(/\.+/g, ".") // Collapse multiple dots
    .replace(/^\.|\.$/g, ""); // Trim leading/trailing dots
}

/**
 * Checks if a system key exists in the registry.
 */
function systemKeyExists(dotPath: string): boolean {
  const fullKey = `system.${dotPath}`;
  const parts = dotPath.split(".");
  
  let current: any = system;
  for (const part of parts) {
    if (current[part] === undefined) {
      return false;
    }
    if (typeof current[part] === "string") {
      return current[part] === fullKey;
    }
    current = current[part];
  }
  
  return false;
}

/**
 * Finds a system key in the registry and returns its path.
 */
function findSystemKeyPath(dotPath: string): string[] | null {
  const parts = dotPath.split(".");
  let current: any = system;
  const path: string[] = [];
  
  for (const part of parts) {
    if (current[part] === undefined) {
      return null;
    }
    path.push(part);
    if (typeof current[part] === "string") {
      return path;
    }
    current = current[part];
  }
  
  return null;
}

/**
 * Scans repo for usage of a system key.
 */
async function scanForSystemKeyUsage(key: string, registryPath: string[]): Promise<string[]> {
  const usageFiles: string[] = [];
  
  // Search for literal key string
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const files = await glob("**/*.{ts,js,tsx,jsx}", {
    cwd: REPO_ROOT,
    ignore: ["node_modules/**", "dist/**", "test-results/**"],
  });
  
  for (const file of files) {
    const filePath = path.join(REPO_ROOT, file);
    try {
      const content = await readFileSafe(filePath);
      if (content) {
        // Check for literal key
        if (content.includes(key)) {
          usageFiles.push(file);
          continue;
        }
        
        // Check for registry path usage (e.g., system.salesforce.users.admin)
        const registryPattern = `system.${registryPath.join(".")}`;
        if (content.includes(registryPattern)) {
          usageFiles.push(file);
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }
  
  return usageFiles;
}

/**
 * Adds a system entry to the registry and dataStore.json.
 */
export async function addSystemEntry(name?: string): Promise<void> {
  console.log("System entries are canonical, repo-backed data (non-secrets only).");
  console.log("Suggested format: lowercase dot-path (e.g., 'salesforce.users.admin')\n");
  
  let finalName = name;
  let dotPath: string;
  
  while (true) {
    if (!finalName || !finalName.trim()) {
      finalName = await input({
        message: "Enter system key path (or press Enter to exit):",
      });
      if (!finalName.trim()) {
        throw new Error("System entry creation cancelled.");
      }
    }
    
    dotPath = normalizeToDotPath(finalName);
    if (!dotPath) {
      console.log("⚠️  Invalid system key path. Please enter a valid path.");
      finalName = "";
      continue;
    }
    
    const fullKey = `system.${dotPath}`;
    
    if (systemKeyExists(dotPath)) {
      const useExisting = await confirm({
        message: `System key "${fullKey}" already exists. Use existing entry?`,
        default: false,
      });
      if (useExisting) {
        console.log(`No new entry created. Using existing system key "${fullKey}".`);
        return;
      }
      finalName = "";
      continue;
    }
    
    break;
  }
  
  const fullKey = `system.${dotPath}`;
  
  // Prompt for value
  const valueInput = await input({
    message: `Enter value for "${fullKey}" (JSON object or string):`,
  });
  
  let value: unknown;
  try {
    value = JSON.parse(valueInput);
  } catch {
    value = valueInput;
  }
  
  // Update system.ts registry (simplified - manual edit recommended for complex structures)
  await updateSystemRegistryFile(dotPath, fullKey);
  
  // Update dataStore.json
  await updateSystemRegistry(fullKey as any, value);
  
  console.log(`✓ System entry "${fullKey}" created`);
  console.log(`  Registry: src/testdata/system.ts`);
  console.log(`  Data: src/testdata/dataStore.json`);
}

/**
 * Updates system.ts registry file (simplified approach).
 */
async function updateSystemRegistryFile(dotPath: string, fullKey: string): Promise<void> {
  const systemPath = paths.systemRegistry();
  let content = await readFileSafe(systemPath);
  
  if (!content) {
    content = `// System registry: canonical system.* keys for repo-backed data.
// This is the ONLY place where system.* key strings are defined.
// Tests should not import this directly; system values flow through fixtures.

export const system = {} as const;

type Leaves<T> = T extends string
  ? T
  : { [K in keyof T]: Leaves<T[K]> }[keyof T];

export type SystemKey = Leaves<typeof system>;
`;
  }
  
  // Simple approach: append comment with manual instruction
  // For robust AST-based updates, consider using a proper TypeScript parser
  const parts = dotPath.split(".");
  const comment = `// TODO: Add "${fullKey}" to system registry manually:
// Example structure:
// ${parts.map((p, i) => "  ".repeat(i + 1) + `${p}: ${i === parts.length - 1 ? `"${fullKey}"` : "{"}`).join("\n")}
// ${parts.map((_, i) => "  ".repeat(parts.length - i)).join("\n")}${parts.map(() => "}").join("")}
`;
  
  // Insert comment before closing brace
  const insertPoint = content.lastIndexOf("} as const;");
  if (insertPoint >= 0) {
    content = content.substring(0, insertPoint) + comment + content.substring(insertPoint);
  }
  
  await writeFileSafe(systemPath, content);
  console.log(`⚠️  Manual update needed: Edit src/testdata/system.ts to add "${fullKey}" to the registry structure.`);
}

/**
 * Deletes a system entry from registry and dataStore.json.
 */
export async function deleteSystemEntry(name?: string): Promise<void> {
  let finalName = name;
  let dotPath: string;
  
  while (true) {
    if (!finalName || !finalName.trim()) {
      finalName = await input({
        message: "Enter system key path to delete (or press Enter to exit):",
      });
      if (!finalName.trim()) {
        throw new Error("System entry deletion cancelled.");
      }
    }
    
    dotPath = normalizeToDotPath(finalName);
    if (!dotPath) {
      console.log("⚠️  Invalid system key path. Please enter a valid path.");
      finalName = "";
      continue;
    }
    
    const fullKey = `system.${dotPath}`;
    const registryPath = findSystemKeyPath(dotPath);
    
    if (!systemKeyExists(dotPath)) {
      console.log(`⚠️  System key "${fullKey}" not found.`);
      finalName = "";
      continue;
    }
    
    // Scan for usage
    const usageFiles = await scanForSystemKeyUsage(fullKey, registryPath || dotPath.split("."));
    
    if (usageFiles.length > 0) {
      console.log(`\n⚠️  Cannot delete "${fullKey}" - it is being used in:`);
      for (const file of usageFiles) {
        console.log(`  - ${file}`);
      }
      console.log("\nRemove references before deleting.");
      throw new Error(`System key "${fullKey}" is in use and cannot be deleted.`);
    }
    
    break;
  }
  
  const fullKey = `system.${dotPath}`;
  
  // Remove from dataStore.json
  await updateSystemRegistry(fullKey as any, undefined);
  
  // Note: Manual cleanup needed for system.ts (AST parsing would be needed for robust deletion)
  console.log(`✓ System entry "${fullKey}" removed from dataStore.json`);
  console.log(`⚠️  Manual cleanup needed: Edit src/testdata/system.ts to remove "${fullKey}" from the registry structure.`);
}
