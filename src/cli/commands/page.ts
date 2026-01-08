// Command handlers for page operations.
import { readFileSafe, writeFileSafe, fileExists, deleteFileSafe } from "../utils/fileOps";
import { paths } from "../utils/paths";
import { normalizeAndPrint, toPascalCase, toCamelCase } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { isPageReferenced } from "../utils/validation";
import { input, confirm } from "@inquirer/prompts";
import path from "path";

interface FeatureConfig {
  [key: string]: {
    tag: string;
    planId: number;
    suites: number[];
  };
}

/**
 * Adds a new page object.
 */
export async function addPage(pageName: string, featureKey?: string): Promise<void> {
  const normalizedPageName = normalizeAndPrint(pageName, "page name");
  const pageKey = featureKey ? normalizeAndPrint(featureKey, "feature key") : normalizedPageName;
  const PageName = toPascalCase(normalizedPageName);
  const fixtureName = toCamelCase(normalizedPageName) + "Page";

  const pagePath = paths.pages(pageKey, PageName);
  if (fileExists(pagePath)) {
    throw new Error(`Page already exists: ${pagePath}`);
  }

  // Load template
  const template = await loadTemplate("page.ts");
  const content = renderTemplate(template, {
    PageName,
    pageKey: normalizedPageName,
    description: normalizedPageName.replace(/-/g, " "),
    modelImports: "", // Can be enhanced later
  });

  await writeFileSafe(pagePath, content);

  // Wire into fixtures
  await wirePageFixture(PageName, fixtureName, pageKey);

  console.log(`✓ Created page: ${pagePath}`);
  console.log(`✓ Wired fixture: ${fixtureName}`);
}

/**
 * Wires a page into the test fixtures file.
 */
async function wirePageFixture(PageName: string, fixtureName: string, featureKey: string): Promise<void> {
  const fixturesPath = paths.fixtures();
  let content = await readFileSafe(fixturesPath);
  if (!content) {
    throw new Error(`Fixtures file not found: ${fixturesPath}`);
  }

  // Add import - insert after the last import line
  const importLine = `import { ${PageName}Page } from "../../src/pages/${featureKey}/${PageName}Page";`;
  if (!content.includes(importLine)) {
    // Find the last import line (before GlobalActions or any other non-page import)
    const lines = content.split("\n");
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("import ") && lines[i].includes("Page")) {
        lastImportIndex = i;
      }
    }
    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, importLine);
      content = lines.join("\n");
    } else {
      // Insert after the first import
      const firstImportIndex = lines.findIndex((line) => line.trim().startsWith("import "));
      if (firstImportIndex >= 0) {
        lines.splice(firstImportIndex + 1, 0, importLine);
        content = lines.join("\n");
      }
    }
  }

  // Add to Fixtures type - insert before the closing brace
  if (!content.includes(`${fixtureName}:`)) {
    const newTypeEntry = `  ${fixtureName}: ${PageName}Page;\n`;
    // Find the closing brace of the Fixtures type and insert before it
    const lines = content.split("\n");
    let inFixturesType = false;
    let fixturesTypeEndIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("type Fixtures = {")) {
        inFixturesType = true;
      }
      if (inFixturesType && (lines[i].trim() === "};" || lines[i].trim().endsWith("};"))) {
        fixturesTypeEndIndex = i;
        break;
      }
    }
    
    if (fixturesTypeEndIndex >= 0) {
      lines.splice(fixturesTypeEndIndex, 0, newTypeEntry.trimEnd());
      content = lines.join("\n");
    }
  }

  // Add to base.extend - insert before the closing brace
  if (!content.includes(`${fixtureName}: async`)) {
    const newExtendEntry = `  ${fixtureName}: async ({ page }, use) => {\n    await use(new ${PageName}Page(page));\n  },\n`;
    // Find the closing brace/paren of base.extend and insert before it
    const lines = content.split("\n");
    let inExtend = false;
    let extendEndIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("export const test = base.extend<Fixtures>({")) {
        inExtend = true;
      }
      if (inExtend && (lines[i].trim() === "});" || lines[i].trim().endsWith("});"))) {
        extendEndIndex = i;
        break;
      }
    }
    
    if (extendEndIndex >= 0) {
      const extendLines = newExtendEntry.trimEnd().split("\n");
      lines.splice(extendEndIndex, 0, ...extendLines);
      content = lines.join("\n");
    }
  }

  await writeFileSafe(fixturesPath, content, true);
}

/**
 * Deletes a page object.
 */
export async function deletePage(pageName: string): Promise<void> {
  const normalizedPageName = normalizeAndPrint(pageName, "page name");
  const PageName = toPascalCase(normalizedPageName);
  const fixtureName = toCamelCase(normalizedPageName) + "Page";

  // Check if referenced
  const isReferenced = await isPageReferenced(fixtureName);
  if (isReferenced) {
    throw new Error(
      `Cannot delete page: fixture "${fixtureName}" is referenced in test files. Remove references first.`
    );
  }

  // Find the page file
  const { REPO_ROOT } = await import("../utils/paths");
  const glob = (await import("fast-glob")).default;
  const pageDirs = await glob("src/pages/*", { cwd: REPO_ROOT, onlyDirectories: true });
  let pagePath: string | null = null;
  let featureKey: string | null = null;

  for (const dir of pageDirs) {
    const pageFile = path.join(REPO_ROOT, dir, `${PageName}Page.ts`);
    if (fileExists(pageFile)) {
      pagePath = pageFile;
      featureKey = dir.split("/").pop() || null;
      break;
    }
  }

  if (!pagePath || !featureKey) {
    throw new Error(`Page not found: ${PageName}`);
  }

  // Confirm deletion
  const confirmation = await input({
    message: `Type "delete page ${normalizedPageName}" to confirm deletion:`,
  });

  if (confirmation !== `delete page ${normalizedPageName}`) {
    throw new Error("Deletion cancelled: confirmation text did not match");
  }

  // Delete file
  await deleteFileSafe(pagePath);

  // Delete empty directory if it exists
  const pageDir = path.dirname(pagePath);
  try {
    const fs = await import("fs");
    const dirContents = await fs.promises.readdir(pageDir);
    if (dirContents.length === 0) {
      await fs.promises.rmdir(pageDir);
      console.log(`✓ Removed empty directory: ${pageDir}`);
    }
  } catch {
    // Directory might not exist or might not be empty, ignore
  }

  // Unwire from fixtures
  await unwirePageFixture(PageName, fixtureName);

  console.log(`✓ Deleted page: ${pagePath}`);
  console.log(`✓ Removed fixture: ${fixtureName}`);
}

/**
 * Unwires a page from the test fixtures file.
 */
async function unwirePageFixture(PageName: string, fixtureName: string): Promise<void> {
  const fixturesPath = paths.fixtures();
  let content = await readFileSafe(fixturesPath);
  if (!content) {
    return;
  }

  // Remove import (tolerate different line endings)
  const importPattern = new RegExp(`import \\{ ${PageName}Page \\} from "[^"]+";\\r?\\n?`, "g");
  content = content.replace(importPattern, "");

  // Remove from Fixtures type
  const typePattern = new RegExp(`\\s+${fixtureName}: ${PageName}Page;`, "g");
  content = content.replace(typePattern, "");

  // Remove from base.extend
  const extendPattern = new RegExp(
    `\\s+${fixtureName}: async \\(\\{ page \\}, use\\) => \\{[\\s\\S]+?\\},?`,
    "g"
  );
  content = content.replace(extendPattern, "");

  await writeFileSafe(fixturesPath, content, true);
}
