// SelectionManifest persistence utility (Slice 7)
// Handles reading and writing selection manifests for MCP proposals.

import path from "path";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import { REPO_ROOT } from "../../utils/paths";
import type { SelectionManifest } from "../types";

/**
 * Base directory for selection manifests.
 */
const SELECTION_DIR = path.join(REPO_ROOT, ".pilot", "proposals", "selection");

/**
 * Gets the path to a selection manifest file for a given proposal ID.
 */
export function getSelectionManifestPath(proposalId: string): string {
  return path.join(SELECTION_DIR, `${proposalId}.selection.json`);
}

/**
 * Ensures the selection directory exists.
 */
async function ensureSelectionDir(): Promise<void> {
  await fs.mkdir(SELECTION_DIR, { recursive: true });
}

/**
 * Saves a SelectionManifest to disk using atomic write (temp + rename).
 * Overwrites existing manifest if present.
 */
export async function saveSelectionManifest(manifest: SelectionManifest): Promise<string> {
  await ensureSelectionDir();
  
  const filePath = getSelectionManifestPath(manifest.proposalId);
  const tempPath = `${filePath}.tmp`;
  
  // Validate manifest before writing
  if (typeof manifest.proposalId !== "string" || manifest.proposalId.length === 0) {
    throw new Error("Invalid manifest: proposalId must be a non-empty string");
  }
  if (!Array.isArray(manifest.selectedItemIds)) {
    throw new Error("Invalid manifest: selectedItemIds must be an array");
  }
  if (typeof manifest.createdAt !== "string" || manifest.createdAt.length === 0) {
    throw new Error("Invalid manifest: createdAt must be a non-empty ISO string");
  }
  
  // Write to temp file first
  await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), "utf-8");
  
  // Atomic rename
  await fs.rename(tempPath, filePath);
  
  return filePath;
}

/**
 * Loads a SelectionManifest from disk for a given proposal ID.
 * Returns null if manifest doesn't exist.
 * Throws Error if manifest exists but is invalid (invalid JSON or schema).
 */
export async function loadSelectionManifest(proposalId: string): Promise<SelectionManifest | null> {
  const filePath = getSelectionManifestPath(proposalId);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read selection manifest: ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  let manifest: SelectionManifest;
  try {
    manifest = JSON.parse(content) as SelectionManifest;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in selection manifest: ${filePath}`);
    }
    throw error;
  }
  
  // Validate schema
  if (typeof manifest.proposalId !== "string" || manifest.proposalId.length === 0) {
    throw new Error(`Invalid selection manifest: missing or invalid proposalId in ${filePath}`);
  }
  
  if (manifest.proposalId !== proposalId) {
    throw new Error(`Invalid selection manifest: proposalId mismatch (expected ${proposalId}, got ${manifest.proposalId}) in ${filePath}`);
  }
  
  if (!Array.isArray(manifest.selectedItemIds)) {
    throw new Error(`Invalid selection manifest: selectedItemIds must be an array in ${filePath}`);
  }
  
  if (typeof manifest.createdAt !== "string" || manifest.createdAt.length === 0) {
    throw new Error(`Invalid selection manifest: missing or invalid createdAt in ${filePath}`);
  }
  
  return manifest;
}
