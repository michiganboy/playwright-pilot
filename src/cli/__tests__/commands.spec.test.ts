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

import { addSpec, deleteSpec } from "../commands/spec";

describe("CLI Commands - Spec Tests", () => {
  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await teardownAfterEach();
  });

  afterAll(() => {
    teardownAfterAll();
  });

  describe("spec:add", () => {
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

  describe("spec:delete", () => {
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
});
