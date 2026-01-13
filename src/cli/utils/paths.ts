// Path discovery and path building utilities for the CLI.
import path from "path";
import { existsSync } from "fs";

/**
 * Finds the repository root by looking for package.json or other markers.
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current !== root) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }

  return process.cwd();
}

/**
 * Gets the repository root path.
 */
export const REPO_ROOT = findRepoRoot();

/**
 * Path builders for common locations.
 */
export const paths = {
  pages: (featureKey: string, pageName: string) =>
    path.join(REPO_ROOT, "src", "pages", featureKey, `${pageName}Page.ts`),
  pageDir: (featureKey: string) =>
    path.join(REPO_ROOT, "src", "pages", featureKey),
  fixtures: () => path.join(REPO_ROOT, "tests", "fixtures", "test-fixtures.ts"),
  featureConfig: () => path.join(REPO_ROOT, "src", "testdata", "featureConfig.json"),
  testDir: (featureKey: string) => path.join(REPO_ROOT, "tests", featureKey),
  factory: (modelKey: string) =>
    path.join(REPO_ROOT, "src", "testdata", "factories", `${modelKey}.factory.ts`),
  factoriesIndex: () => path.join(REPO_ROOT, "src", "testdata", "factories", "index.ts"),
  model: (modelKey: string) =>
    path.join(REPO_ROOT, "src", "testdata", "models", `${modelKey}.ts`),
  modelsIndex: () => path.join(REPO_ROOT, "src", "testdata", "models", "index.ts"),
  builder: (modelKey: string) =>
    path.join(REPO_ROOT, "src", "testdata", "builders", `${modelKey}.builder.ts`),
  systemRegistry: () => path.join(REPO_ROOT, "src", "testdata", "system.ts"),
  templates: (templateName: string) =>
    path.join(REPO_ROOT, "src", "cli", "templates", templateName),
};
