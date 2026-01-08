// Safe file operations utilities.
import { promises as fs } from "fs";
import path from "path";
import { existsSync } from "fs";

/**
 * Reads a file, returning null if it doesn't exist.
 */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Writes a file, creating directories if needed. Throws if file exists (unless overwrite=true).
 */
export async function writeFileSafe(
  filePath: string,
  content: string,
  overwrite: boolean = false
): Promise<void> {
  if (existsSync(filePath) && !overwrite) {
    throw new Error(`File already exists: ${filePath}`);
  }

  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Deletes a file safely.
 */
export async function deleteFileSafe(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
  }
}

/**
 * Deletes a directory recursively.
 */
export async function deleteDirSafe(dirPath: string): Promise<void> {
  if (existsSync(dirPath)) {
    await fs.rm(dirPath, { recursive: true, force: true });
  }
}

/**
 * Reads JSON file safely.
 */
export async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  const content = await readFileSafe(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Writes JSON file atomically (writes to temp file then renames).
 */
export async function writeJsonSafe(
  filePath: string,
  data: unknown,
  overwrite: boolean = false
): Promise<void> {
  if (existsSync(filePath) && !overwrite) {
    throw new Error(`File already exists: ${filePath}`);
  }

  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  await fs.rename(tempPath, filePath);
}

/**
 * Checks if a file exists.
 */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Checks if a directory exists.
 */
export function dirExists(dirPath: string): boolean {
  return existsSync(dirPath);
}
