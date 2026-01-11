// Utility to update DataStoreMap type when creating and deleting features.
import { readFileSafe, writeFileSafe } from "./fileOps";
import { REPO_ROOT } from "./paths";
import path from "path";

/**
 * Adds a feature's data store key to the DataStoreMap type.
 */
export async function addFeatureToDataStoreMap(featureKey: string): Promise<void> {
  const dataStorePath = path.join(REPO_ROOT, "src", "utils", "dataStore.ts");
  
  let content = await readFileSafe(dataStorePath);
  if (!content) {
    throw new Error(`DataStore file not found: ${dataStorePath}`);
  }

  const keyToAdd = `"${featureKey}.user": models.User;`;
  
  // Check if key already exists
  if (content.includes(`"${featureKey}.user"`)) {
    return; // Already exists
  }

  // Find the DataStoreMap type and add the new key before the closing brace
  const lines = content.split("\n");
  let inDataStoreMap = false;
  let dataStoreMapEndIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("export type DataStoreMap = {")) {
      inDataStoreMap = true;
    }
    if (inDataStoreMap && lines[i].trim() === "};") {
      dataStoreMapEndIndex = i;
      break;
    }
  }

  if (dataStoreMapEndIndex >= 0) {
    // Add the new key with proper indentation
    const newEntry = `  ${keyToAdd}`;
    lines.splice(dataStoreMapEndIndex, 0, newEntry);
    content = lines.join("\n");
    await writeFileSafe(dataStorePath, content, true);
  }
}

/**
 * Removes a feature's data store key from the DataStoreMap type.
 */
export async function removeFeatureFromDataStoreMap(featureKey: string): Promise<void> {
  const dataStorePath = path.join(REPO_ROOT, "src", "utils", "dataStore.ts");
  
  let content = await readFileSafe(dataStorePath);
  if (!content) {
    return; // File doesn't exist, nothing to remove
  }

  const keyToRemove = `"${featureKey}.user": models.User;`;
  
  // Check if key exists
  if (!content.includes(`"${featureKey}.user"`)) {
    return; // Doesn't exist, nothing to remove
  }

  // Remove the line containing the key
  const lines = content.split("\n");
  const filteredLines = lines.filter((line) => !line.includes(`"${featureKey}.user"`));
  
  if (filteredLines.length < lines.length) {
    content = filteredLines.join("\n");
    await writeFileSafe(dataStorePath, content, true);
  }
}
