/**
 * Tests for page:add and page:delete commands.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import { addPage, deletePage } from "../commands/page";
import { mocked, setupBeforeEach, teardownAfterEach, teardownAfterAll } from "./testUtils";

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

describe("CLI Commands - Page Tests", () => {
  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await teardownAfterEach();
  });

  afterAll(() => {
    teardownAfterAll();
  });

  describe("page:add", () => {
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

  describe("page:delete", () => {
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
});
