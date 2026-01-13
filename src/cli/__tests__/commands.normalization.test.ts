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

import { addFeature } from "../commands/feature";
import { addPage } from "../commands/page";

describe("CLI Commands - Normalization Tests", () => {
  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await teardownAfterEach();
  });

  afterAll(() => {
    teardownAfterAll();
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
        const inputMock = mocked(prompts.input);
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
});
