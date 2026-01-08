// Validation utilities for checking references and dependencies.
import { readFileSafe } from "./fileOps";
import { glob } from "fast-glob";
import path from "path";
import { REPO_ROOT } from "./paths";

/**
 * Checks if a page fixture is referenced in any test files.
 */
export async function isPageReferenced(fixtureName: string): Promise<boolean> {
  const testFiles = await glob("tests/**/*.spec.ts", { cwd: REPO_ROOT });
  for (const file of testFiles) {
    const content = await readFileSafe(path.join(REPO_ROOT, file));
    if (content && content.includes(fixtureName)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a factory is referenced in any test files.
 */
export async function isFactoryReferenced(factoryName: string): Promise<boolean> {
  const testFiles = await glob("tests/**/*.spec.ts", { cwd: REPO_ROOT });
  for (const file of testFiles) {
    const content = await readFileSafe(path.join(REPO_ROOT, file));
    if (content && content.includes(factoryName)) {
      return true;
    }
  }
  return false;
}

/**
 * Finds existing pages that might match a feature name.
 */
export async function findMatchingPages(featureKey: string): Promise<string[]> {
  const pageDirs = await glob("src/pages/*", { cwd: REPO_ROOT, onlyDirectories: true });
  const matches: string[] = [];
  for (const dir of pageDirs) {
    const dirName = dir.split("/").pop() || "";
    if (dirName === featureKey) {
      // Check for Page.ts files in this directory
      const pageFiles = await glob(`${dir}/*Page.ts`, { cwd: REPO_ROOT });
      for (const pageFile of pageFiles) {
        const pageName = pageFile.split("/").pop()?.replace("Page.ts", "") || "";
        matches.push(pageName);
      }
    }
  }
  return matches;
}
