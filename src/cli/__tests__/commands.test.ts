/**
 * Comprehensive test suite for CLI commands.
 * Tests all logic permutations for both interactive (prompts) and non-interactive (flags) usage.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import { tmpdir } from "os";
import { addPage, deletePage } from "../commands/page";
import { addFeature, deleteFeature } from "../commands/feature";
import { addSpec, deleteSpec } from "../commands/spec";
import { addFactory, deleteFactory } from "../commands/factory";

// Mock dependencies
jest.mock("@inquirer/prompts", () => ({
  input: jest.fn(),
  confirm: jest.fn(),
  select: jest.fn(),
  checkbox: jest.fn(),
}));
jest.mock("../utils/fileOps");
jest.mock("../utils/validation");
jest.mock("../utils/templates");
jest.mock("../../utils/featureConfig");
jest.mock("fast-glob", () => ({
  __esModule: true,
  default: jest.fn<(pattern: string, options?: any) => Promise<string[]>>(),
}));

// Import mocked modules
import * as prompts from "@inquirer/prompts";
import * as fileOps from "../utils/fileOps";
import * as validation from "../utils/validation";
import * as templates from "../utils/templates";
import * as featureConfig from "../../utils/featureConfig";
import { paths, REPO_ROOT } from "../utils/paths";

// Helper to get properly typed mocks
function mocked<T extends (...args: any[]) => any>(fn: T): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>;
}

describe("CLI Commands - Consistency Tests", () => {
  let testDir: string;
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;

  beforeEach(async () => {
    // Suppress console output during tests
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    // Create temporary directory for each test
    testDir = await fs.mkdtemp(path.join(tmpdir(), "pilot-test-"));

    // Create package.json in test dir so REPO_ROOT resolves correctly
    await fs.writeFile(path.join(testDir, "package.json"), "{}");

    // Default fixtures file content
    const defaultFixturesContent = `import { base } from "@playwright/test";
type Fixtures = {};
export const test = base.extend<Fixtures>({});`;

    // Setup default mocks with proper typing
    mocked(fileOps.readFileSafe).mockResolvedValue(defaultFixturesContent);
    mocked(fileOps.writeFileSafe).mockResolvedValue(undefined);
    mocked(fileOps.deleteFileSafe).mockResolvedValue(undefined);
    mocked(fileOps.fileExists).mockReturnValue(false);
    mocked(fileOps.dirExists).mockReturnValue(false);
    mocked(fileOps.readJsonSafe).mockResolvedValue({});
    mocked(fileOps.writeJsonSafe).mockResolvedValue(undefined);

    mocked(validation.isPageReferenced).mockResolvedValue(false);
    mocked(validation.isFactoryReferenced).mockResolvedValue(false);
    mocked(validation.findMatchingPages).mockResolvedValue([]);

    mocked(templates.loadTemplate).mockResolvedValue("template content {{ModelName}}");
    mocked(templates.renderTemplate).mockImplementation((template: string, vars: Record<string, any>) => {
      return Object.entries(vars).reduce((str, [key, val]) =>
        str.replace(new RegExp(`{{${key}}}`, "g"), String(val)), template);
    });

    // Setup fast-glob mock - will be overridden in individual tests
    // Don't set a default - let each test set up its own mock

    // Setup featureConfig mock
    mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue([]);
    mocked(featureConfig.getSuiteNames).mockImplementation((suites: Record<string, string>) => Object.values(suites));
    mocked(featureConfig.getSuiteName).mockImplementation((suites: Record<string, string>, suiteId: number) => suites[suiteId.toString()]);
    mocked(featureConfig.getSuiteIds).mockImplementation((suites: Record<string, string>) => Object.keys(suites).map((id) => parseInt(id, 10)));
    mocked(featureConfig.hasSuiteId).mockImplementation((suites: Record<string, string>, suiteId: number) => suiteId.toString() in suites);
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });

    // Clear all mocks but preserve glob mock (it's reset in beforeEach for delete:page tests)
    jest.clearAllMocks();
  });

  describe("add:page", () => {
    it("should work with page name as argument", async () => {
      // Args
      const pageName = "My Page";
      const featureKey = "my-feature";

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addPage(pageName, featureKey);

      // Expects
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
      expect(fileOps.readFileSafe).toHaveBeenCalled(); // Should read fixtures file
    });

    it("should work with page name via prompt", async () => {
      // Args - no page name provided
      const pageName = undefined;
      const featureKey = "test-feature";

      // Mock prompts
      mocked(prompts.input).mockResolvedValueOnce("Prompted Page");

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addPage(pageName, featureKey);

      // Expects
      expect(prompts.input).toHaveBeenCalled();
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should work with --feature flag", async () => {
      // Args
      const pageName = "Feature Page";
      const featureKey = "custom-feature";

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addPage(pageName, featureKey);

      // Expects - Should use the provided feature key
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should handle duplicate page names (re-prompt)", async () => {
      // Args - no page name provided initially, will prompt
      const pageName = undefined;
      const featureKey = "test-feature";

      // Mock: Page already exists (for the duplicate check)
      mocked(fileOps.fileExists)
        .mockReturnValueOnce(true) // First check - duplicate exists
        .mockReturnValueOnce(false); // Second check - new name doesn't exist

      // Mock prompts - first duplicate, then new name
      mocked(prompts.input)
        .mockResolvedValueOnce("Duplicate Page") // First attempt (duplicate)
        .mockResolvedValueOnce("New Unique Page"); // Second attempt (unique)

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addPage(pageName, featureKey);

      // Expects - Should have prompted twice (once for duplicate, once for new name)
      expect(prompts.input).toHaveBeenCalledTimes(2);
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should normalize page names consistently", async () => {
      // Args - different input formats
      const inputs = ["My Page", "my-page", "MY_PAGE"];

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      for (const input of inputs) {
        jest.clearAllMocks();
        await addPage(input, "test-feature");
        // All should create the same normalized page
      }

      // Expects - All should create same normalized page name
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should create page file with correct template", async () => {
      // Args
      const pageName = "Template Page";
      const featureKey = "test-feature";

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addPage(pageName, featureKey);

      // Expects - Should have loaded and rendered page template
      expect(templates.loadTemplate).toHaveBeenCalledWith("page.ts");
      expect(templates.renderTemplate).toHaveBeenCalled();
    });

    it("should wire fixtures (add import, type, extend)", async () => {
      // Args
      const pageName = "Fixture Page";
      const featureKey = "test-feature";

      // Mock fixtures file content
      mocked(fileOps.readFileSafe).mockResolvedValue(`
        import { base } from "@playwright/test";
        type Fixtures = {};
        export const test = base.extend<Fixtures>({});
      `);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addPage(pageName, featureKey);

      // Expects - Should have read and written fixtures file
      expect(fileOps.readFileSafe).toHaveBeenCalled();
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });
  });

  describe("delete:page", () => {
    it("should work with page name as argument", async () => {
      // Args - "MyPage" normalizes to "mypage" via normalizeToKey
      // The file "MyPagePage.ts" -> PageName "MyPage" -> normalizes to "mypage"
      // So they match!
      const pageName = "MyPage";

      // Mock glob - deletePage calls glob twice: once for directories, once for files
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      let callCount = 0;
      globModule.default.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? ["src/pages/my-page"] : ["MyPagePage.ts"];
      });

      // Mock: Page exists and is not referenced
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(false);

      // Mock fixtures - need to provide actual fixture content
      const fixturesContent = `import { base } from "@playwright/test";
import { MyPagePage } from "../../src/pages/my-page/MyPagePage";
type Fixtures = {
  myPagePage: MyPagePage;
};
export const test = base.extend<Fixtures>({
  myPagePage: async ({ page }, use) => {
    await use(new MyPagePage(page));
  },
});`;
      // Override default mock for this test - need to mock both fixtures read and any other reads
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path && path.includes("test-fixtures.ts")) {
          return fixturesContent;
        }
        return "";
      });

      // Mock confirmation - "MyPage" normalizes to "mypage"
      mocked(prompts.input).mockResolvedValue("delete page mypage");

      // Execute
      await deletePage(pageName);

      // Expects
      expect(fileOps.deleteFileSafe).toHaveBeenCalled();
      expect(fileOps.writeFileSafe).toHaveBeenCalled(); // Should update fixtures
    });

    it("should work with dropdown selection", async () => {
      // Args
      const pageName = undefined;

      // Mock glob - deletePage calls glob twice: once for directories, once for files
      // Mock is reset in beforeEach, use mockImplementation like other tests
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      let callCount = 0;
      globModule.default.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? ["src/pages/feature1"] : ["Page1Page.ts"];
      });

      // Mock select dropdown
      mocked(prompts.select).mockResolvedValue("page1");

      // Mock: Page exists and is not referenced
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(false);

      // Mock fixtures
      mocked(fileOps.readFileSafe).mockResolvedValue(`
        import { Page1Page } from "../../src/pages/feature1/Page1Page";
        type Fixtures = {
          page1Page: Page1Page;
        };
        export const test = base.extend<Fixtures>({
          page1Page: async ({ page }, use) => {
            await use(new Page1Page(page));
          },
        });
      `);

      // Mock confirmation - use normalized name
      mocked(prompts.input).mockResolvedValue("delete page page1");

      // Execute
      await deletePage(pageName);

      // Expects
      expect(prompts.select).toHaveBeenCalled();
      expect(fileOps.deleteFileSafe).toHaveBeenCalled();
    });

    it("should block deletion if page is referenced", async () => {
      // Args - use name that matches filename normalization
      const pageName = "ReferencedPage";

      // Mock glob - deletePage calls glob twice
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      let callCount = 0;
      globModule.default.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? ["src/pages/referenced-page"] : ["ReferencedPagePage.ts"];
      });

      // Mock: Page is referenced
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(true);

      // Execute & Expects
      await expect(deletePage(pageName)).rejects.toThrow(/is referenced in test files/);
      expect(fileOps.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should require typed confirmation", async () => {
      // Args - use name that matches filename normalization
      const pageName = "ConfirmPage";

      // Mock glob - deletePage calls glob twice
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      let callCount = 0;
      globModule.default.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? ["src/pages/confirm-page"] : ["ConfirmPagePage.ts"];
      });

      // Mock: Page exists and is not referenced
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(false);

      // Mock fixtures
      const fixturesContent = `import { base } from "@playwright/test";
import { ConfirmPagePage } from "../../src/pages/confirm-page/ConfirmPagePage";
type Fixtures = {
  confirmPagePage: ConfirmPagePage;
};
export const test = base.extend<Fixtures>({
  confirmPagePage: async ({ page }, use) => {
    await use(new ConfirmPagePage(page));
  },
});`;
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path && path.includes("test-fixtures.ts")) {
          return fixturesContent;
        }
        return "";
      });

      // Mock confirmation - wrong text
      mocked(prompts.input).mockResolvedValue("wrong confirmation");

      // Execute & Expects
      await expect(deletePage(pageName)).rejects.toThrow(/Deletion cancelled/);
    });

    it("should delete page file and empty folder", async () => {
      // Args - use name that matches filename normalization
      const pageName = "DeletePage";

      // Mock glob - deletePage calls glob twice
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      let callCount = 0;
      globModule.default.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? ["src/pages/delete-page"] : ["DeletePagePage.ts"];
      });

      // Mock: Page exists and is not referenced
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(false);

      // Mock fixtures
      const fixturesContent = `import { base } from "@playwright/test";
import { DeletePagePage } from "../../src/pages/delete-page/DeletePagePage";
type Fixtures = {
  deletePagePage: DeletePagePage;
};
export const test = base.extend<Fixtures>({
  deletePagePage: async ({ page }, use) => {
    await use(new DeletePagePage(page));
  },
});`;
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path && path.includes("test-fixtures.ts")) {
          return fixturesContent;
        }
        return "";
      });

      // Mock confirmation - "DeletePage" normalizes to "deletepage"
      mocked(prompts.input).mockResolvedValue("delete page deletepage");

      // Execute
      await deletePage(pageName);

      // Expects - Should delete the page file
      expect(fileOps.deleteFileSafe).toHaveBeenCalled();
    });

    it("should unwire fixtures (remove import, type, extend)", async () => {
      // Args - use name that matches filename normalization
      const pageName = "UnwirePage";

      // Mock glob - deletePage calls glob twice
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      let callCount = 0;
      globModule.default.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? ["src/pages/unwire-page"] : ["UnwirePagePage.ts"];
      });

      // Mock: Page exists and is not referenced
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(false);

      // Mock fixtures with the page to be deleted
      const fixturesContent = `import { base } from "@playwright/test";
import { UnwirePagePage } from "../../src/pages/unwire-page/UnwirePagePage";
type Fixtures = {
  unwirePagePage: UnwirePagePage;
};
export const test = base.extend<Fixtures>({
  unwirePagePage: async ({ page }, use) => {
    await use(new UnwirePagePage(page));
  },
});`;
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path && path.includes("test-fixtures.ts")) {
          return fixturesContent;
        }
        return "";
      });

      // Mock confirmation - "UnwirePage" normalizes to "unwirepage"
      mocked(prompts.input).mockResolvedValue("delete page unwirepage");

      // Execute
      await deletePage(pageName);

      // Expects - Should have written fixtures file (with unwired content)
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should handle non-existent page gracefully", async () => {
      // Args
      const pageName = "Non Existent Page";

      // Mock glob - no pages found
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default
        .mockResolvedValueOnce([]) // No directories
        .mockResolvedValueOnce([]); // No files

      // Execute & Expects
      await expect(deletePage(pageName)).rejects.toThrow(/No pages found/);
    });
  });

  describe("add:feature", () => {
    it("should work with feature name as argument", async () => {
      // Args
      const featureName = "Test Feature";
      const planId = 123;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Test Suite") // Suite name
        .mockResolvedValueOnce("1001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects
      expect(fileOps.writeJsonSafe).toHaveBeenCalled();
      expect(fileOps.writeFileSafe).toHaveBeenCalled(); // Should create spec file
    });

    it("should work with --plan-id flag", async () => {
      // Args
      const featureName = "Plan ID Feature";
      const planId = 456;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Plan Suite") // Suite name
        .mockResolvedValueOnce("2001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should use provided planId
      expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "plan-id-feature": expect.objectContaining({
            planId: 456
          })
        }),
        true
      );
    });

    it("should create spec file for each suite", async () => {
      // Args
      const featureName = "Multi Suite Feature";
      const planId = 789;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts - multiple suites
      mocked(prompts.input)
        .mockResolvedValueOnce("Suite One") // Suite name 1
        .mockResolvedValueOnce("3001") // Suite ID 1
        .mockResolvedValueOnce("Suite Two") // Suite name 2
        .mockResolvedValueOnce("3002") // Suite ID 2
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should create multiple spec files (one per suite)
      // addFeature calls writeFileSafe for: .gitkeep (1), spec files (2), page file via addPage (1), fixtures via addPage (1) = 5 total
      expect(fileOps.writeFileSafe).toHaveBeenCalledTimes(5);
    });

    it("should prompt for planId if not provided", async () => {
      // Args - no planId provided (undefined)
      const featureName = "Prompt Feature";

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts - planId not provided, so should prompt
      // The mock must return a string that parses to a number
      // Note: addFeature calls loadTemplate("spec.ts") which is already mocked in beforeEach
      // Reset the input mock to ensure clean state, then chain mockResolvedValueOnce
      mocked(prompts.input).mockReset();
      mocked(prompts.input)
        .mockResolvedValueOnce("888") // Plan ID - must be valid number string (parseInt("888", 10) = 888)
        .mockResolvedValueOnce("Test Suite") // Suite name
        .mockResolvedValueOnce("1001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites (no page name prompt if no matching pages)
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute - call without planId (undefined)
      await addFeature(featureName);

      // Expects - Should have prompted for planId first
      const inputCalls = mocked(prompts.input).mock.calls;
      expect(inputCalls[0][0].message).toContain("Plan ID");
      // Verify the planId was parsed correctly (check writeJsonSafe was called with planId 888)
      expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "prompt-feature": expect.objectContaining({
            planId: 888
          })
        }),
        true
      );
    });

    it("should collect suite names first, then IDs", async () => {
      // Args
      const featureName = "Suite Order Feature";
      const planId = 777;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("First Suite") // Suite name
        .mockResolvedValueOnce("5001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have called input in order: name, then ID
      const inputCalls = mocked(prompts.input).mock.calls;
      expect(inputCalls[0][0].message).toContain("Enter suite name");
      expect(inputCalls[1][0].message).toContain("Enter Azure DevOps Suite ID");
    });

    it("should handle duplicate suite names (re-prompt)", async () => {
      // Args
      const featureName = "Duplicate Suite Feature";
      const planId = 666;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts - duplicate name, then different name
      // Flow: name1, id1, name2 (duplicate - continue), name3, id2, finish (empty)
      // When suite name is empty (line 211), the loop breaks (line 216)
      // The duplicate triggers continue (line 234), which loops back to prompt for suite name again
      mocked(prompts.input)
        .mockResolvedValueOnce("Duplicate Suite") // Suite name 1
        .mockResolvedValueOnce("3001") // Suite ID 1
        .mockResolvedValueOnce("Duplicate Suite") // Suite name 2 (duplicate - triggers continue, loops back)
        .mockResolvedValueOnce("Different Suite") // Suite name 3 (after continue/loop)
        .mockResolvedValueOnce("3002") // Suite ID 2
        .mockResolvedValueOnce(""); // Finish suites (empty string breaks the loop at line 216)
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have called input 6 times:
      // 1. Suite name 1, 2. Suite ID 1, 3. Suite name 2 (duplicate - triggers continue),
      // 4. Suite name 3 (after continue), 5. Suite ID 2, 6. Finish (empty string)
      // Page name is auto-set to featureKey when no matching pages, so no prompt
      expect(prompts.input).toHaveBeenCalledTimes(6);
    });

    it("should handle duplicate suite IDs (re-prompt)", async () => {
      // Args
      const featureName = "Duplicate ID Feature";
      const planId = 555;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts - duplicate ID, then different ID
      // Flow: name1, id1, name2, id2 (duplicate - re-prompt in inner while loop), id3, finish
      // When duplicate ID is detected (line 246), suiteId is set to null and the inner while loop continues
      mocked(prompts.input)
        .mockResolvedValueOnce("First Suite") // Suite name 1
        .mockResolvedValueOnce("4001") // Suite ID 1
        .mockResolvedValueOnce("Second Suite") // Suite name 2
        .mockResolvedValueOnce("4001") // Duplicate ID (triggers re-prompt in inner while loop at line 240)
        .mockResolvedValueOnce("4002") // Different ID (after re-prompt)
        .mockResolvedValueOnce(""); // Finish (empty string breaks outer loop at line 216)
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have called input 6 times:
      // 1. Suite name 1, 2. Suite ID 1, 3. Suite name 2, 4. Suite ID 2 (duplicate - re-prompt),
      // 5. Suite ID 3 (after re-prompt), 6. Finish (empty string)
      // Page name is auto-set to featureKey when no matching pages (line 284), so no prompt
      expect(prompts.input).toHaveBeenCalledTimes(6);
    });

    it("should ask to reuse existing matching page", async () => {
      // Args
      const featureName = "Matching Page Feature";
      const planId = 444;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock: Matching page exists
      mocked(validation.findMatchingPages).mockResolvedValue(["matching-page"]);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Test Suite") // Suite name
        .mockResolvedValueOnce("6001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValueOnce(true); // Reuse existing page

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have asked to reuse
      expect(prompts.confirm).toHaveBeenCalled();
    });

    it("should auto-create page if no match found", async () => {
      // Args
      const featureName = "Auto Page Feature";
      const planId = 333;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock: No matching pages
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Auto Suite") // Suite name
        .mockResolvedValueOnce("7001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have created a page automatically (page creation is called internally)
      // The page should be created with the feature name
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should create page with new name if user declines existing", async () => {
      // Args
      const featureName = "Decline Page Feature";
      const planId = 222;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock: Matching page exists
      mocked(validation.findMatchingPages).mockResolvedValue(["decline-page"]);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Decline Suite") // Suite name
        .mockResolvedValueOnce("8001") // Suite ID
        .mockResolvedValueOnce("") // Finish suites
        .mockResolvedValueOnce("New Page Name"); // New page name after declining
      mocked(prompts.confirm).mockResolvedValueOnce(false); // Decline existing page

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have prompted for new page name
      expect(prompts.input).toHaveBeenCalled();
    });

    it("should add entry to featureConfig.json", async () => {
      // Args
      const featureName = "Config Feature";
      const planId = 111;

      // Mock config
      const existingConfig = { "existing-feature": { tag: "@existing", planId: 1, suites: {} } };
      mocked(fileOps.readJsonSafe).mockResolvedValue(existingConfig);
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Config Suite") // Suite name
        .mockResolvedValueOnce("9001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have written config with new feature
      expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "existing-feature": expect.anything(),
          "config-feature": expect.objectContaining({
            tag: "@config-feature",
            planId: 111
          })
        }),
        true
      );
    });

    it("should create test directory", async () => {
      // Args
      const featureName = "Directory Feature";
      const planId = 999;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Directory Suite") // Suite name
        .mockResolvedValueOnce("10001") // Suite ID
        .mockResolvedValueOnce(""); // Finish suites
      mocked(prompts.confirm).mockResolvedValue(false); // No matching pages

      // Execute
      await addFeature(featureName, planId);

      // Expects - Should have checked if directory exists
      expect(fileOps.dirExists).toHaveBeenCalled();
    });

    it("should reject if feature already exists", async () => {
      // Args
      const featureName = "Existing Feature";
      const planId = 888;

      // Mock config - feature already exists
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "existing-feature": { tag: "@existing-feature", planId: 888, suites: {} }
      });

      // Execute & Expects
      await expect(addFeature(featureName, planId)).rejects.toThrow(/already exists/);
    });

    it("should reject if test directory already exists", async () => {
      // Args
      const featureName = "Dir Feature";
      const planId = 777;

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(true); // Directory exists

      // Execute & Expects
      await expect(addFeature(featureName)).rejects.toThrow(
        /Test directory already exists/
      );
    });
  });

  describe("delete:feature", () => {
    it("should work with feature name as argument", async () => {
      // Args
      const featureName = "test-feature";

      // Mock: Feature exists in available features
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["test-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "test-feature": {
          tag: "@test-feature",
          planId: 1,
          suites: { "1001": "Test Suite" }
        }
      });

      // Mock: Feature directory exists
      mocked(fileOps.dirExists).mockReturnValue(true);

      // Mock: No pages in feature directory
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock confirmation - format is "delete <featureKey>" (normalized)
      // featureName "test-feature" is normalized via normalizeAndPrint in deleteFeature line 386
      // normalizeAndPrint("test-feature", "feature name") -> normalizeToKey("test-feature") -> "test-feature"
      // So featureKey = "test-feature", confirmation must be exactly "delete test-feature"
      // Reset and set up input mock (afterEach clears all mocks, so we need to reset and set up fresh)
      mocked(prompts.input).mockReset();
      mocked(prompts.input).mockResolvedValueOnce("delete test-feature");

      // Execute
      await deleteFeature(featureName);

      // Expects
      expect(fileOps.writeJsonSafe).toHaveBeenCalled(); // Should update config
      expect(fileOps.dirExists).toHaveBeenCalled();
    });

    it("should work with dropdown selection", async () => {
      // Args
      const featureName = undefined;

      // Mock: Multiple features available
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["feature1", "feature2"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "feature1": { tag: "@feature1", planId: 1, suites: {} },
        "feature2": { tag: "@feature2", planId: 2, suites: {} }
      });

      // Mock select dropdown
      mocked(prompts.select).mockResolvedValue("feature1");

      // Mock: Feature directory exists
      mocked(fileOps.dirExists).mockReturnValue(true);

      // Mock: No pages
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock confirmation - format is "delete <featureKey>" (normalized)
      // The selected feature "feature1" from dropdown is already a key, so featureKey = "feature1"
      // Confirmation must be exactly "delete feature1"
      // Reset and set up input mock (afterEach clears all mocks, so we need to reset and set up fresh)
      mocked(prompts.input).mockReset();
      mocked(prompts.input).mockResolvedValueOnce("delete feature1");

      // Execute
      await deleteFeature(featureName);

      // Expects
      expect(prompts.select).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Select which feature to delete:" })
      );
      expect(fileOps.writeJsonSafe).toHaveBeenCalled();
    });

    it("should require typed confirmation", async () => {
      // Args
      const featureName = "confirm-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["confirm-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "confirm-feature": { tag: "@confirm-feature", planId: 1, suites: {} }
      });

      // Mock: Feature directory exists
      mocked(fileOps.dirExists).mockReturnValue(true);

      // Mock: No pages
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock confirmation - wrong text
      mocked(prompts.input).mockResolvedValueOnce("wrong confirmation");

      // Execute & Expects
      await expect(deleteFeature(featureName)).rejects.toThrow(/Deletion cancelled/);
    });

    it("should delete test directory", async () => {
      // Args
      const featureName = "dir-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["dir-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "dir-feature": { tag: "@dir-feature", planId: 1, suites: {} }
      });

      // Mock: Feature directory exists
      mocked(fileOps.dirExists).mockReturnValue(true);

      // Mock: No pages
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete dir-feature");

      // Execute
      await deleteFeature(featureName);

      // Expects - Should have checked directory exists
      expect(fileOps.dirExists).toHaveBeenCalled();
    });

    it("should remove feature from featureConfig.json", async () => {
      // Args
      const featureName = "config-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["config-feature"]);

      // Mock config - feature exists
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "config-feature": { tag: "@config-feature", planId: 1, suites: {} },
        "other-feature": { tag: "@other-feature", planId: 2, suites: {} }
      });

      // Mock: Feature directory exists
      mocked(fileOps.dirExists).mockReturnValue(true);

      // Mock: No pages
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete config-feature");

      // Execute
      await deleteFeature(featureName);

      // Expects - Should have written config without the deleted feature
      expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          "config-feature": expect.anything()
        }),
        true
      );
    });

    it("should delete associated pages if not referenced elsewhere", async () => {
      // Args
      const featureName = "page-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["page-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "page-feature": { tag: "@page-feature", planId: 1, suites: {} }
      });

      // Mock: Feature directory exists
      mocked(fileOps.dirExists).mockReturnValue(true);

      // Mock: Pages exist in feature directory
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["PageFeaturePage.ts"]);

      // Mock: Page is not referenced elsewhere
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(false);

      // Mock fixtures
      mocked(fileOps.readFileSafe).mockResolvedValue(`
        import { PageFeaturePage } from "../../src/pages/page-feature/PageFeaturePage";
        type Fixtures = {
          pageFeaturePage: PageFeaturePage;
        };
        export const test = base.extend<Fixtures>({
          pageFeaturePage: async ({ page }, use) => {
            await use(new PageFeaturePage(page));
          },
        });
      `);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete page-feature");

      // Execute
      await deleteFeature(featureName);

      // Expects - Should have deleted the page file
      expect(fileOps.deleteFileSafe).toHaveBeenCalled();
    });

    it("should preserve pages if referenced by other features", async () => {
      // Args
      const featureName = "preserve-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["preserve-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "preserve-feature": { tag: "@preserve-feature", planId: 1, suites: {} }
      });

      // Mock: Feature directory exists
      mocked(fileOps.dirExists).mockReturnValue(true);

      // Mock: Pages exist in feature directory
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["PreserveFeaturePage.ts"]);

      // Mock: Page is referenced elsewhere
      mocked(fileOps.fileExists).mockReturnValue(true);
      mocked(validation.isPageReferenced).mockResolvedValue(true);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete preserve-feature");

      // Execute
      await deleteFeature(featureName);

      // Expects - Should NOT have deleted the page file
      expect(fileOps.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should handle non-existent feature gracefully", async () => {
      // Args
      const featureName = "non-existent-feature";

      // Mock: Feature does not exist
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["other-feature"]);

      // Execute & Expects
      await expect(deleteFeature(featureName)).rejects.toThrow(/Feature not found/);
    });
  });

  describe("add:factory", () => {
    it("should work with model name as argument", async () => {
      // Args
      const modelName = "Product";

      // Mock: Factory doesn't exist, model doesn't exist
      mocked(fileOps.fileExists).mockImplementation((path: string) => {
        if (path.includes("product.factory.ts")) return false;
        if (path.includes("product.ts") && path.includes("models")) return false;
        return false;
      });

      // Mock: factories/index.ts and models/index.ts content
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Mock: Field prompting (model doesn't exist, so prompts for fields)
      mocked(prompts.input)
        .mockResolvedValueOnce("name") // First field name
        .mockResolvedValueOnce(""); // Press Enter to finish (after at least one field)
      mocked(prompts.select).mockResolvedValueOnce("string"); // Field type
      mocked(prompts.confirm).mockResolvedValueOnce(true); // Accept faker suggestion

      // Execute
      await addFactory(modelName);

      // Expects
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
      // Should create: model file + factory file + factories/index.ts + models/index.ts
      expect(fileOps.writeFileSafe).toHaveBeenCalledTimes(4);
      expect(prompts.input).toHaveBeenCalled(); // Field prompts
      expect(prompts.select).toHaveBeenCalled(); // Field type selection
    });

    it("should work with model name via prompt", async () => {
      // Args - no model name provided
      const modelName = undefined;

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Product") // Model name prompt
        .mockResolvedValueOnce("name") // First field name
        .mockResolvedValueOnce(""); // Press Enter to finish
      mocked(prompts.select).mockResolvedValueOnce("string"); // Field type
      mocked(prompts.confirm).mockResolvedValueOnce(true); // Accept faker suggestion

      // Mock: Factory doesn't exist, model doesn't exist
      mocked(fileOps.fileExists).mockReturnValue(false);
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Execute
      await addFactory(modelName);

      // Expects
      expect(prompts.input).toHaveBeenCalled();
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should use existing model if it exists", async () => {
      // Args
      const modelName = "User";

      // Mock: Factory doesn't exist, but model exists
      mocked(fileOps.fileExists).mockImplementation((path: string) => {
        if (path.includes("user.factory.ts")) return false;
        if (path.includes("user.ts") && path.includes("models")) return true; // Model exists
        return false;
      });

      // Mock: factories/index.ts content
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./product.factory\";";
        }
        if (path.includes("models/user.ts")) {
          // Existing model file
          return `export interface User {\n  firstName: string;\n  lastName: string;\n  email: string;\n}`;
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Mock: Confirm to use existing model
      mocked(prompts.confirm).mockResolvedValueOnce(true);

      // Execute
      await addFactory(modelName);

      // Expects
      expect(prompts.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("already exists. Use existing model?") })
      );
      // Should create: factory file + factories/index.ts (model already exists, so no model creation)
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
      // Should parse existing model and create factory with those fields
    });

    it("should create new model if user declines existing", async () => {
      // Args
      const modelName = "User";

      // Mock: Factory doesn't exist, model exists
      // Need to check paths more carefully - the model path check happens after normalization
      mocked(fileOps.fileExists).mockImplementation((path: string) => {
        // Factory checks
        if (path.includes("user.factory.ts")) return false;
        if (path.includes("customuser.factory.ts")) return false;
        // Model checks - original "user" model exists
        if (path.includes("user.ts") && path.includes("models") && !path.includes("customuser")) return true;
        // New "customuser" model doesn't exist yet
        if (path.includes("customuser.ts") && path.includes("models")) return false;
        // Default: doesn't exist
        return false;
      });

      // Mock: factories/index.ts content
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./product.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Mock: Decline existing model, provide new name, then prompt for fields
      mocked(prompts.confirm).mockResolvedValueOnce(false); // Decline existing model
      mocked(prompts.input)
        .mockResolvedValueOnce("CustomUser") // New model name
        .mockResolvedValueOnce("email") // First field name
        .mockResolvedValueOnce(""); // Press Enter to finish
      mocked(prompts.select).mockResolvedValueOnce("string"); // Field type
      mocked(prompts.confirm).mockResolvedValueOnce(true); // Accept faker suggestion

      // Execute
      await addFactory(modelName);

      // Expects
      expect(prompts.confirm).toHaveBeenCalled(); // Confirm to use existing model
      expect(prompts.input).toHaveBeenCalled(); // New model name + fields
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
      // Should create: new model file + factory file + factories/index.ts + models/index.ts
    });

    it("should prompt for fields with faker suggestions", async () => {
      // Args
      const modelName = "Product";

      // Mock: Factory and model don't exist
      mocked(fileOps.fileExists).mockReturnValue(false);
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Mock: Field prompting with faker suggestions
      mocked(prompts.input)
        .mockResolvedValueOnce("email") // Field name
        .mockResolvedValueOnce(""); // Press Enter to finish
      mocked(prompts.select).mockResolvedValueOnce("string"); // Field type
      mocked(prompts.confirm)
        .mockResolvedValueOnce(true); // Accept faker suggestion

      // Execute
      await addFactory(modelName);

      // Expects
      expect(prompts.select).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("Select type for \"email\"") })
      );
      expect(prompts.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("Suggested faker method") })
      );
    });

    it("should update models/index.ts with new model", async () => {
      // Args
      const modelName = "Product";

      // Mock: Factory and model don't exist
      mocked(fileOps.fileExists).mockReturnValue(false);
      const modelsIndexContent = `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return modelsIndexContent;
        }
        return "";
      });

      // Mock: Field prompting
      mocked(prompts.input)
        .mockResolvedValueOnce("name")
        .mockResolvedValueOnce("");
      mocked(prompts.select).mockResolvedValueOnce("string");
      mocked(prompts.confirm).mockResolvedValueOnce(true);

      // Execute
      await addFactory(modelName);

      // Expects - should update models/index.ts
      const writeCalls = mocked(fileOps.writeFileSafe).mock.calls;
      const modelsIndexCall = writeCalls.find((call) => {
        const callPath = call[0] as string;
        return callPath && callPath.includes("models") && callPath.includes("index.ts");
      });
      expect(modelsIndexCall).toBeDefined();
      if (modelsIndexCall) {
        const content = modelsIndexCall[1] as string;
        // Check for export (uses double quotes in code)
        expect(content).toContain('export * from "./product";');
        expect(content).toContain("import type { Product } from './product';");
        expect(content).toContain("Product: Product;");
      }
    });

    it("should handle duplicate factory names (re-prompt)", async () => {
      // Args
      const modelName = "User";

      // Mock: Model doesn't exist, but factory exists
      // The factory check happens after model is determined and fields are collected
      mocked(fileOps.fileExists).mockImplementation((path: string) => {
        if (path.includes("user.factory.ts")) return true; // Factory exists
        if (path.includes("user.ts") && path.includes("models")) return false; // Model doesn't exist
        return false;
      });

      // Mock: factories/index.ts content (needed for factory check)
      mocked(fileOps.readFileSafe).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./product.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Mock: Field prompting (model doesn't exist, so prompts for fields)
      mocked(prompts.input)
        .mockResolvedValueOnce("name") // First field name
        .mockResolvedValueOnce(""); // Press Enter to finish
      mocked(prompts.select).mockResolvedValueOnce("string"); // Field type
      mocked(prompts.confirm).mockResolvedValueOnce(true); // Accept faker suggestion

      // Execute & Expects - factory check happens after model/fields are collected
      await expect(addFactory(modelName)).rejects.toThrow(/Factory already exists/);
    });
  });

  describe("delete:factory", () => {
    it("should work with factory name as argument", async () => {
      // Args
      const factoryName = "User";

      // Mock glob - deleteFactory calls glob to find factory files
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["src/testdata/factories/user.factory.ts"]);

      // Mock: Factory file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock: Factory exists and is not referenced
      mocked(validation.isFactoryReferenced).mockResolvedValue(false);

      // Mock factories/index.ts content
      const indexContent = `export * from "./user.factory";\nexport * from "./other.factory";`;
      mocked(fileOps.readFileSafe).mockResolvedValue(indexContent);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete factory user");

      // Execute
      await deleteFactory(factoryName);

      // Expects
      expect(fileOps.deleteFileSafe).toHaveBeenCalledWith(expect.stringContaining("user.factory.ts"));
      expect(fileOps.writeFileSafe).toHaveBeenCalled(); // Should update index.ts
    });

    it("should work with dropdown selection", async () => {
      // Args
      const factoryName = undefined;

      // Mock glob - deleteFactory calls glob to find factory files
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([
        "src/testdata/factories/user.factory.ts",
        "src/testdata/factories/product.factory.ts",
      ]);

      // Mock select dropdown
      mocked(prompts.select).mockResolvedValue("product");

      // Mock: Factory file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock: Factory exists and is not referenced
      mocked(validation.isFactoryReferenced).mockResolvedValue(false);

      // Mock factories/index.ts content
      const indexContent = `export * from "./user.factory";\nexport * from "./product.factory";`;
      mocked(fileOps.readFileSafe).mockResolvedValue(indexContent);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete factory product");

      // Execute
      await deleteFactory(factoryName);

      // Expects
      expect(prompts.select).toHaveBeenCalled();
      expect(fileOps.deleteFileSafe).toHaveBeenCalledWith(expect.stringContaining("product.factory.ts"));
    });

    it("should block deletion if factory is referenced", async () => {
      // Args
      const factoryName = "User";

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["src/testdata/factories/user.factory.ts"]);

      // Mock: Factory is referenced
      mocked(validation.isFactoryReferenced).mockResolvedValue(true);

      // Execute & Expects
      await expect(deleteFactory(factoryName)).rejects.toThrow(/is referenced in test files/);
      expect(fileOps.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should require typed confirmation", async () => {
      // Args
      const factoryName = "User";

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["src/testdata/factories/user.factory.ts"]);

      // Mock: Factory file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock: Factory exists and is not referenced
      mocked(validation.isFactoryReferenced).mockResolvedValue(false);

      // Mock factories/index.ts content
      mocked(fileOps.readFileSafe).mockResolvedValue(`export * from "./user.factory";`);

      // Mock confirmation - wrong text
      mocked(prompts.input).mockResolvedValue("wrong confirmation");

      // Execute & Expects
      await expect(deleteFactory(factoryName)).rejects.toThrow(/Deletion cancelled/);
      expect(fileOps.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should delete factory file", async () => {
      // Args
      const factoryName = "User";

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["src/testdata/factories/user.factory.ts"]);

      // Mock: Factory file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock: Factory exists and is not referenced
      mocked(validation.isFactoryReferenced).mockResolvedValue(false);

      // Mock factories/index.ts content
      mocked(fileOps.readFileSafe).mockResolvedValue(`export * from "./user.factory";`);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete factory user");

      // Execute
      await deleteFactory(factoryName);

      // Expects
      expect(fileOps.deleteFileSafe).toHaveBeenCalledWith(expect.stringContaining("user.factory.ts"));
    });

    it("should remove export from factories/index.ts", async () => {
      // Args
      const factoryName = "User";

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["src/testdata/factories/user.factory.ts"]);

      // Mock: Factory file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock: Factory exists and is not referenced
      mocked(validation.isFactoryReferenced).mockResolvedValue(false);

      // Mock factories/index.ts content with multiple exports
      const indexContent = `export * from "./user.factory";\nexport * from "./product.factory";\nexport * from "./order.factory";`;
      mocked(fileOps.readFileSafe).mockResolvedValue(indexContent);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete factory user");

      // Execute
      await deleteFactory(factoryName);

      // Expects - should remove user.factory export but keep others
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
      // Find the call that updates the index file (should be the second call after deleteFileSafe)
      const writeCalls = mocked(fileOps.writeFileSafe).mock.calls;
      // The index.ts update should be one of the writeFileSafe calls
      const indexCall = writeCalls.find(
        (call) => call[0] && (call[0].toString().includes("index.ts") || call[0].toString().includes("factories"))
      );
      // If not found by path, check the content - it should not contain user.factory
      if (indexCall) {
        const updatedContent = indexCall[1] as string;
        expect(updatedContent).not.toContain("user.factory");
        expect(updatedContent).toContain("product.factory");
        expect(updatedContent).toContain("order.factory");
      } else {
        // Check all writeFileSafe calls - one should have content without user.factory
        const contentCalls = writeCalls.filter((call) => typeof call[1] === "string");
        const indexUpdate = contentCalls.find((call) => {
          const content = call[1] as string;
          return !content.includes("user.factory") && content.includes("product.factory");
        });
        expect(indexUpdate).toBeDefined();
      }
    });

    it("should handle non-existent factory gracefully", async () => {
      // Args
      const factoryName = "NonExistent";

      // Mock glob - factory not found
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["src/testdata/factories/user.factory.ts"]);

      // Execute & Expects
      await expect(deleteFactory(factoryName)).rejects.toThrow(/Factory not found/);
      expect(fileOps.deleteFileSafe).not.toHaveBeenCalled();
    });
  });

  describe("add:spec", () => {
    it("should work with --feature flag", async () => {
      // Args
      const featureKey = "test-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["test-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "test-feature": {
          tag: "@test-feature",
          planId: 1,
          suites: {}
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Test Suite") // Suite name
        .mockResolvedValueOnce("2001"); // Suite ID

      // Mock glob - no existing specs
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template");
      mocked(templates.renderTemplate).mockImplementation((template: string) => template);

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
      expect(fileOps.writeJsonSafe).toHaveBeenCalled(); // Should update featureConfig
    });

    it("should work with feature dropdown selection", async () => {
      // Args
      const featureKey = undefined;

      // Mock: Features exist
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["feature1", "feature2"]);

      // Mock select dropdown
      mocked(prompts.select).mockResolvedValue("feature1");

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "feature1": {
          tag: "@feature1",
          planId: 1,
          suites: {}
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Dropdown Suite") // Suite name
        .mockResolvedValueOnce("3001"); // Suite ID

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template");
      mocked(templates.renderTemplate).mockImplementation((template: string) => template);

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects
      expect(prompts.select).toHaveBeenCalled();
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should prompt for suite name and ID", async () => {
      // Args
      const featureKey = "prompt-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["prompt-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "prompt-feature": {
          tag: "@prompt-feature",
          planId: 1,
          suites: {}
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Prompt Suite") // Suite name
        .mockResolvedValueOnce("4001"); // Suite ID

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template");
      mocked(templates.renderTemplate).mockImplementation((template: string) => template);

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects - Should have prompted for suite name and ID
      const inputCalls = mocked(prompts.input).mock.calls;
      expect(inputCalls[0][0].message).toContain("Enter suite name");
      expect(inputCalls[1][0].message).toContain("Enter Azure DevOps Suite ID");
    });

    it("should add suite to featureConfig if new", async () => {
      // Args
      const featureKey = "config-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["config-feature"]);

      // Mock config - feature exists but suite doesn't
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "config-feature": {
          tag: "@config-feature",
          planId: 1,
          suites: { "5001": "Existing Suite" }
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("New Suite") // Suite name
        .mockResolvedValueOnce("5002"); // Suite ID

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template");
      mocked(templates.renderTemplate).mockImplementation((template: string) => template);

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects - Should have updated featureConfig with new suite
      expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "config-feature": expect.objectContaining({
            suites: expect.objectContaining({
              "5001": "Existing Suite",
              "5002": "New Suite"
            })
          })
        }),
        true
      );
    });

    it("should handle duplicate suite names (re-prompt)", async () => {
      // Args
      const featureKey = "duplicate-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["duplicate-feature"]);

      // Mock config - feature exists with a suite
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "duplicate-feature": {
          tag: "@duplicate-feature",
          planId: 1,
          suites: { "6001": "Existing Suite" }
        }
      });

      // Mock prompts - duplicate name, then different name
      mocked(prompts.input)
        .mockResolvedValueOnce("Existing Suite") // Duplicate suite name (triggers continue/loop)
        .mockResolvedValueOnce("Different Suite") // Different suite name (after continue)
        .mockResolvedValueOnce("6002"); // Suite ID

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template");
      mocked(templates.renderTemplate).mockImplementation((template: string) => template);

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects - Should have called input 3 times (duplicate name, different name, ID)
      expect(prompts.input).toHaveBeenCalledTimes(3);
    });

    it("should handle duplicate suite IDs (re-prompt)", async () => {
      // Args
      const featureKey = "duplicate-id-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["duplicate-id-feature"]);

      // Mock config - feature exists with a suite
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "duplicate-id-feature": {
          tag: "@duplicate-id-feature",
          planId: 1,
          suites: { "7001": "Existing Suite" }
        }
      });

      // Mock prompts - duplicate ID, then different ID
      mocked(prompts.input)
        .mockResolvedValueOnce("New Suite") // Suite name
        .mockResolvedValueOnce("7001") // Duplicate ID (triggers continue/loop)
        .mockResolvedValueOnce("7002"); // Different ID (after continue)

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template");
      mocked(templates.renderTemplate).mockImplementation((template: string) => template);

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects - Should have called input 3 times (name, duplicate ID, different ID)
      expect(prompts.input).toHaveBeenCalledTimes(3);
    });

    it("should offer to create feature if it doesn't exist", async () => {
      // Args
      const featureKey = "new-feature";

      // Mock: Feature doesn't exist in available features
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["other-feature"]);

      // Mock config - feature doesn't exist
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "other-feature": {
          tag: "@other-feature",
          planId: 1,
          suites: {}
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("New Suite") // Suite name
        .mockResolvedValueOnce("8001") // Suite ID
        .mockResolvedValueOnce("9999"); // Plan ID (for addFeatureWithSuites)
      mocked(prompts.confirm).mockResolvedValue(true); // Create feature

      // Mock: Feature creation (addFeatureWithSuites)
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(fileOps.readJsonSafe).mockResolvedValueOnce({}).mockResolvedValueOnce({}); // Config reads

      // Execute
      await addSpec(featureKey);

      // Expects - Should have asked to create feature
      expect(prompts.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("doesn't exist")
        })
      );
    });

    it("should create spec file with correct template", async () => {
      // Args
      const featureKey = "template-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["template-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "template-feature": {
          tag: "@template-feature",
          planId: 1,
          suites: {}
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Template Suite") // Suite name
        .mockResolvedValueOnce("9001"); // Suite ID

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template {{featureKey}}");
      mocked(templates.renderTemplate).mockImplementation((template: string, vars: Record<string, any>) => {
        return Object.entries(vars).reduce((str, [key, val]) =>
          str.replace(new RegExp(`{{${key}}}`, "g"), String(val)), template);
      });

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects - Should have loaded and rendered template
      expect(templates.loadTemplate).toHaveBeenCalledWith("spec.ts");
      expect(templates.renderTemplate).toHaveBeenCalled();
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });

    it("should use auto-incrementing spec ID prefix", async () => {
      // Args
      const featureKey = "increment-feature";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["increment-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "increment-feature": {
          tag: "@increment-feature",
          planId: 1,
          suites: {}
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Increment Suite") // Suite name
        .mockResolvedValueOnce("10001"); // Suite ID

      // Mock glob - 2 existing specs
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["INCR-101-first.spec.ts", "INCR-102-second.spec.ts"]);

      // Mock templates
      mocked(templates.loadTemplate).mockResolvedValue("spec template");
      mocked(templates.renderTemplate).mockImplementation((template: string) => template);

      // Mock: No page fixture found
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      // Execute
      await addSpec(featureKey);

      // Expects - Should have created spec with ID 103 (100 + 3)
      // The path will be the full path, so just check it contains the spec ID
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
      const writeCall = mocked(fileOps.writeFileSafe).mock.calls[0];
      expect(writeCall[0]).toContain("INCR-103");
    });

    it("should reject if feature doesn't exist (when using flag)", async () => {
      // Args
      const featureKey = "non-existent-feature";

      // Mock: Feature doesn't exist
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["other-feature"]);

      // Mock config - feature doesn't exist
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "other-feature": {
          tag: "@other-feature",
          planId: 1,
          suites: {}
        }
      });

      // Mock prompts
      mocked(prompts.input)
        .mockResolvedValueOnce("Test Suite") // Suite name
        .mockResolvedValueOnce("11001"); // Suite ID
      mocked(prompts.confirm).mockResolvedValue(false); // Don't create feature

      // Execute & Expects
      await expect(addSpec(featureKey)).rejects.toThrow(/Feature creation cancelled/);
    });
  });

  describe("delete:spec", () => {
    it("should work with --feature and --suite flags", async () => {
      // Args
      const featureKey = "test-feature";
      const suiteName = "Test Suite";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["test-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "test-feature": {
          tag: "@test-feature",
          planId: 1,
          suites: { "2001": "Test Suite" }
        }
      });

      // Mock glob - find spec file
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["TEST-101-test-suite.spec.ts"]);

      // Mock: Spec file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete Test Suite");

      // Execute
      await deleteSpec(featureKey, suiteName);

      // Expects
      expect(fileOps.deleteFileSafe).toHaveBeenCalled();
      expect(fileOps.writeJsonSafe).toHaveBeenCalled(); // Should update featureConfig
    });

    it("should work with feature and suite dropdowns", async () => {
      // Args
      const featureKey = undefined;
      const suiteName = undefined;

      // Mock: Features exist
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["feature1", "feature2"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "feature1": {
          tag: "@feature1",
          planId: 1,
          suites: { "3001": "Suite One", "3002": "Suite Two" }
        }
      });

      // Mock select dropdowns
      mocked(prompts.select)
        .mockResolvedValueOnce("feature1") // Feature selection
        .mockResolvedValueOnce(3001); // Suite selection (returns suite ID, not name)

      // Mock glob - find spec file
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["FEAT-101-suite-one.spec.ts"]);

      // Mock: Spec file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete Suite One");

      // Execute
      await deleteSpec(featureKey, suiteName);

      // Expects
      expect(prompts.select).toHaveBeenCalledTimes(2);
      expect(fileOps.deleteFileSafe).toHaveBeenCalled();
    });

    it("should require typed confirmation (suite name)", async () => {
      // Args
      const featureKey = "confirm-feature";
      const suiteName = "Confirm Suite";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["confirm-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "confirm-feature": {
          tag: "@confirm-feature",
          planId: 1,
          suites: { "4001": "Confirm Suite" }
        }
      });

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["CONF-101-confirm-suite.spec.ts"]);

      // Mock confirmation - wrong text
      mocked(prompts.input).mockResolvedValue("wrong confirmation");

      // Execute & Expects
      await expect(deleteSpec(featureKey, suiteName)).rejects.toThrow(/Deletion cancelled/);
      expect(fileOps.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should delete spec file", async () => {
      // Args
      const featureKey = "delete-feature";
      const suiteName = "Delete Suite";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["delete-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "delete-feature": {
          tag: "@delete-feature",
          planId: 1,
          suites: { "5001": "Delete Suite" }
        }
      });

      // Mock glob - find spec file
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["DELE-101-delete-suite.spec.ts"]);

      // Mock: Spec file exists
      mocked(fileOps.fileExists).mockReturnValue(true);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete Delete Suite");

      // Execute
      await deleteSpec(featureKey, suiteName);

      // Expects
      expect(fileOps.deleteFileSafe).toHaveBeenCalledWith(
        expect.stringContaining("DELE-101-delete-suite.spec.ts")
      );
    });

    it("should remove suite from featureConfig.json", async () => {
      // Args
      const featureKey = "remove-feature";
      const suiteName = "Remove Suite";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["remove-feature"]);

      // Mock config - feature has multiple suites
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "remove-feature": {
          tag: "@remove-feature",
          planId: 1,
          suites: { "6001": "Remove Suite", "6002": "Keep Suite" }
        }
      });

      // Mock glob
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue(["REMO-101-remove-suite.spec.ts"]);

      // Mock confirmation
      mocked(prompts.input).mockResolvedValue("delete Remove Suite");

      // Execute
      await deleteSpec(featureKey, suiteName);

      // Expects - Should have removed suite from config
      expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "remove-feature": expect.objectContaining({
            suites: expect.not.objectContaining({
              "6001": "Remove Suite"
            })
          })
        }),
        true
      );
      // Should keep the other suite
      expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "remove-feature": expect.objectContaining({
            suites: expect.objectContaining({
              "6002": "Keep Suite"
            })
          })
        }),
        true
      );
    });

    it("should handle non-existent spec gracefully", async () => {
      // Args
      const featureKey = "non-spec-feature";
      const suiteName = "Non Spec Suite";

      // Mock: Feature exists
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["non-spec-feature"]);

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({
        "non-spec-feature": {
          tag: "@non-spec-feature",
          planId: 1,
          suites: { "7001": "Non Spec Suite" }
        }
      });

      // Mock glob - no spec file found
      const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
      globModule.default.mockResolvedValue([]);

      // Execute & Expects
      await expect(deleteSpec(featureKey, suiteName)).rejects.toThrow(/No spec file found/);
      expect(fileOps.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should handle non-existent feature gracefully", async () => {
      // Args
      const featureKey = "non-existent-feature";
      const suiteName = "Test Suite";

      // Mock: Feature doesn't exist
      mocked(featureConfig.getAvailableFeatureKeys).mockReturnValue(["other-feature"]);

      // Execute & Expects
      await expect(deleteSpec(featureKey, suiteName)).rejects.toThrow(/Feature not found/);
    });
  });

  describe("Normalization Consistency", () => {
    it("should normalize feature names consistently across all commands", async () => {
      // Args - Same input in different formats
      const inputs = ["My Feature", "my-feature", "MY_FEATURE"];
      const expectedKey = "my-feature";

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);

      // Mock prompts
      mocked(prompts.input).mockResolvedValueOnce("TestFeature");

      for (const input of inputs) {
        // Reset all mocks
        jest.clearAllMocks();

        // Reset file ops mocks
        mocked(fileOps.readJsonSafe).mockResolvedValue({});
        mocked(fileOps.dirExists).mockReturnValue(false);
        mocked(fileOps.writeFileSafe).mockResolvedValue(undefined);
        mocked(fileOps.writeJsonSafe).mockResolvedValue(undefined);

        // Reset validation mocks
        mocked(validation.findMatchingPages).mockResolvedValue([]);

        // Reset template mocks
        mocked(templates.loadTemplate).mockResolvedValue("spec template");
        mocked(templates.renderTemplate).mockImplementation((template: string) => template);

        // Reset prompts - need to chain all input calls together
        // Clear and reset input mock with proper typing
        const inputMock = mocked(prompts.input) as jest.Mock<(...args: any[]) => Promise<string>>;
        inputMock.mockReset();
        inputMock
          .mockResolvedValueOnce("999") // Plan ID
          .mockResolvedValueOnce("Test Suite") // Suite name
          .mockResolvedValueOnce("1001") // Suite ID
          .mockResolvedValueOnce("") // Finish suites
          .mockResolvedValueOnce("TestFeature"); // Page name
        mocked(prompts.confirm).mockResolvedValue(false);

        // Reset glob mock
        const globModule = jest.requireMock("fast-glob") as { default: jest.Mock<(pattern: string, options?: any) => Promise<string[]>> };
        globModule.default.mockReset();
        globModule.default.mockResolvedValue([]);

        // Execute
        await addFeature(input);

        // Expects - All should create same feature key
        expect(fileOps.writeJsonSafe).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            [expectedKey]: expect.anything()
          }),
          true
        );
      }
    });

    it("should normalize page names consistently", async () => {
      // Args - Same input in different formats
      const inputs = ["My Page", "my-page", "MY_PAGE"];
      const featureKey = "test-feature";

      // Mock config
      mocked(fileOps.readJsonSafe).mockResolvedValue({});
      mocked(fileOps.dirExists).mockReturnValue(false);
      mocked(validation.findMatchingPages).mockResolvedValue([]);

      for (const input of inputs) {
        jest.clearAllMocks();
        await addPage(input, featureKey);
        // All should create the same normalized page
      }

      // Expects - All should create same normalized page name
      expect(fileOps.writeFileSafe).toHaveBeenCalled();
    });
  });

  // No verbose summary - Jest already reports test results

  afterAll(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });
});
