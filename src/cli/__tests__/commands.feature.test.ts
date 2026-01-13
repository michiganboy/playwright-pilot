/**
 * Tests for CLI commands.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
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
import * as featureConfig from "../../utils/featureConfig";

import { addFeature, deleteFeature } from "../commands/feature";

describe("CLI Commands - Feature Tests", () => {
  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await teardownAfterEach();
  });

  afterAll(() => {
    teardownAfterAll();
  });

  describe("feature:add", () => {
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

  describe("feature:delete", () => {
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
});
