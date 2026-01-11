// Command handlers for page operations.
import { readFileSafe, writeFileSafe, fileExists, deleteFileSafe } from "../utils/fileOps";
import { paths } from "../utils/paths";
import { normalizeAndPrint, normalizeToKey, toPascalCase, toCamelCase } from "../utils/normalize";
import { loadTemplate, renderTemplate } from "../utils/templates";
import { isPageReferenced } from "../utils/validation";
import { input, confirm, select } from "@inquirer/prompts";
import path from "path";

// ANSI color codes
const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m"; // Warning

function warning(message: string): string {
  return `${YELLOW}${message}${RESET}`;
}

/**
 * Adds a new page object.
 */
export async function addPage(pageName: string | undefined, featureKey?: string): Promise<void> {
  // Prompt for page name with duplicate checking
  let finalPageName: string | null = null;
  let normalizedPageName: string | null = null;
  let pageKey: string | null = null;
  let PageName: string | null = null;
  let fixtureName: string | null = null;
  let pagePath: string | null = null;

  // Load fixtures early to check for duplicates
  const fixturesPath = paths.fixtures();
  const fixturesContent = await readFileSafe(fixturesPath);

  while (!finalPageName || !normalizedPageName) {
    // Prompt for page name if not provided or if duplicate found
    let pageNameInput = pageName;
    if (!pageNameInput || !pageNameInput.trim()) {
      pageNameInput = await input({
        message: finalPageName ? "Enter a different page name:" : "Enter page name:",
      });
    }

    if (!pageNameInput.trim()) {
      console.log(warning("Page name is required. Please enter a name."));
      continue;
    }

    let normalized = normalizeAndPrint(pageNameInput, "page name");
    // If normalized name ends with "-page", strip it to avoid double "Page" suffix
    // This handles cases where user enters "login-page" or feature name is "login-page"
    if (normalized.toLowerCase().endsWith("-page")) {
      normalized = normalized.slice(0, -5);
    }
    const pageKeyCandidate = featureKey ? normalizeAndPrint(featureKey, "feature key") : normalized;
    const PageNameCandidate = toPascalCase(normalized);
    const fixtureNameCandidate = toCamelCase(normalized) + "Page";
    const pagePathCandidate = paths.pages(pageKeyCandidate, PageNameCandidate);

    // Check if page file already exists
    if (fileExists(pagePathCandidate)) {
      // Show relative path from src/pages
      const { REPO_ROOT } = await import("../utils/paths");
      const pagesDir = path.join(REPO_ROOT, "src", "pages");
      const relativePath = path.relative(pagesDir, pagePathCandidate).replace(/\\/g, "/");
      console.log(`    ${warning(`Page "${PageNameCandidate}" already exists`)}`);
      console.log(`    ${warning(`at /pages/${relativePath}`)}`);
      console.log(`  Please enter a different page name.`);
      pageName = undefined; // Reset so it prompts again
      continue;
    }

    // Check if fixture already exists in fixtures file
    if (fixturesContent && fixturesContent.includes(fixtureNameCandidate)) {
      console.log(`    ${warning(`Page fixture "${fixtureNameCandidate}" already exists`)}`);
      console.log(`    ${warning(`in test fixtures`)}`);
      console.log(`  Please enter a different page name.`);
      pageName = undefined; // Reset so it prompts again
      continue;
    }

    // All checks passed, use this page name
    finalPageName = pageNameInput.trim();
    normalizedPageName = normalized;
    pageKey = pageKeyCandidate;
    PageName = PageNameCandidate;
    fixtureName = fixtureNameCandidate;
    pagePath = pagePathCandidate;
  }

  // Load template
  const template = await loadTemplate("page.ts");
  const loginDriverHelper =
    PageName === "Login"
      ? `
        // Creates a LoginDriver adapter for GlobalActions.login().
        toLoginDriver() {
          return {
            goto: async () => {
              await this.navigateToLogin();
            },
            submit: async (username: string, password: string) => {
              throw new Error(
                "Login submission is not configured. Implement submit() in LoginPage.toLoginDriver() using your app's locators."
              );
            },
          };
        }
      `
      : "";

  const content = renderTemplate(template, {
    PageName: PageName!,
    pageKey: normalizedPageName!,
    description: normalizedPageName!.replace(/-/g, " "),
    modelImports: "", // Can be enhanced later
    loginDriverHelper,
  });


  await writeFileSafe(pagePath!, content);

  // Wire into fixtures
  await wirePageFixture(PageName!, fixtureName!, pageKey!);

  // Show relative path from src directory
  const { REPO_ROOT } = await import("../utils/paths");
  const srcDir = path.join(REPO_ROOT, "src");
  const relativePath = path.relative(srcDir, pagePath!).replace(/\\/g, "/");
  console.log(`✓ Created page: src/${relativePath}`);
  console.log(`✓ Wired fixture: ${fixtureName!}`);
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
      // Ensure the previous entry has a trailing comma
      // Look backwards from extendEndIndex to find the last non-empty line before the closing brace
      for (let i = extendEndIndex - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.length > 0 && !line.startsWith("//")) {
          // If the last non-empty line doesn't end with a comma, add one on the same line
          if (!line.endsWith(",") && !line.endsWith("{") && !line.endsWith("(")) {
            // Check if it's a closing brace - add comma on same line
            if (line === "}") {
              lines[i] = "  },";
            } else {
              lines[i] = lines[i] + ",";
            }
          }
          break;
        }
      }

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
export async function deletePage(pageName: string | undefined): Promise<void> {
  // Find all available pages
  const { REPO_ROOT } = await import("../utils/paths");
  const glob = (await import("fast-glob")).default;
  const pageDirs = await glob("src/pages/*", { cwd: REPO_ROOT, onlyDirectories: true });

  const availablePages: Array<{ value: string; name: string; pagePath: string; featureKey: string; fixtureName: string }> = [];

  for (const dir of pageDirs) {
    const pageFiles = await glob("*.ts", { cwd: path.join(REPO_ROOT, dir) }).catch(() => []);
    for (const pageFile of pageFiles) {
      if (pageFile.endsWith("Page.ts")) {
        const PageName = pageFile.replace("Page.ts", "");
        // Normalize PageName to kebab-case for comparison
        const normalizedPageName = normalizeToKey(PageName);
        if (!normalizedPageName) continue;

        const fixtureName = toCamelCase(normalizedPageName) + "Page";
        const pagePath = path.join(REPO_ROOT, dir, pageFile);
        const featureKey = dir.split("/").pop() || "";

        availablePages.push({
          value: normalizedPageName,
          name: `${PageName} (${featureKey})`,
          pagePath,
          featureKey,
          fixtureName,
        });
      }
    }
  }

  if (availablePages.length === 0) {
    throw new Error("No pages found to delete");
  }

  // Select page if not provided or show dropdown
  let selectedPage: typeof availablePages[0];
  if (pageName && pageName.trim()) {
    const normalizedInput = normalizeAndPrint(pageName, "page name");
    const found = availablePages.find((p) => p.value === normalizedInput);
    if (!found) {
      throw new Error(`Page not found: ${pageName}`);
    }
    selectedPage = found;
  } else {
    const selectedValue = await select({
      message: "Select which page to delete:",
      choices: availablePages.map((p) => ({ value: p.value, name: p.name })),
    });
    selectedPage = availablePages.find((p) => p.value === selectedValue)!;
  }

  const normalizedPageName = selectedPage.value;
  const PageName = toPascalCase(selectedPage.value);
  const fixtureName = selectedPage.fixtureName;
  const pagePath = selectedPage.pagePath;
  const featureKey = selectedPage.featureKey;

  // Check if referenced
  const isReferenced = await isPageReferenced(fixtureName);
  if (isReferenced) {
    throw new Error(
      `Cannot delete page: fixture "${fixtureName}" is referenced in test files. Remove references first.`
    );
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
export async function unwirePageFixture(PageName: string, fixtureName: string): Promise<void> {
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
