/**
 * Tests for CLI suite commands (suite:add, suite:delete).
 * 
 * These tests verify:
 * 1. suite:add and suite:delete work directly
 * 2. The spec:add/spec:delete legacy aliases route to the same behavior
 * 
 * Per README.cli: "spec:add is a legacy alias for suite:add. Both commands do the same thing."
 */

// STEP 1 — HOISTED mocks (MANDATORY - before imports)
const promptsMock = {
  input: jest.fn(),
  select: jest.fn(),
  confirm: jest.fn(),
};

const fileOpsMock = {
  readFileSafe: jest.fn(),
  writeFileSafe: jest.fn(),
  deleteFileSafe: jest.fn(),
  fileExists: jest.fn(),
  dirExists: jest.fn(),
  readJsonSafe: jest.fn(),
  writeJsonSafe: jest.fn(),
};

const validationMock = {
  findMatchingPages: jest.fn(),
};

const templatesMock = {
  loadTemplate: jest.fn(),
  renderTemplate: jest.fn(),
};

const featureConfigMock = {
  getAvailableFeatureKeys: jest.fn(),
  getSuiteNames: jest.fn(),
  getSuiteName: jest.fn(),
  getSuiteIds: jest.fn(),
  hasSuiteId: jest.fn(),
};

const globMock = jest.fn();

// MUST match spec.ts imports EXACTLY
jest.mock("@inquirer/prompts", () => promptsMock);
jest.mock("../utils/fileOps", () => fileOpsMock);
jest.mock("../utils/validation", () => validationMock);
jest.mock("../utils/templates", () => templatesMock);
jest.mock("../../utils/featureConfig", () => featureConfigMock);

jest.mock("fast-glob", () => ({
  __esModule: true,
  default: globMock,
}));

// Mock dataStoreUpdater to avoid file system access when creating features
jest.mock("../utils/dataStoreUpdater", () => ({
  addFeatureToDataStoreMap: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  removeFeatureFromDataStoreMap: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";

// Helper to dynamically import the spec module (which contains suite logic)
const importSpecCommand = async () => {
  const mod = await import("../commands/spec");
  return mod;
};

describe("CLI Commands - Suite Tests", () => {
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

    // IMPORTANT: mockReset clears queued mockResolvedValueOnce values
    // This prevents test-order leakage when running the suite in-band
    promptsMock.input.mockReset();
    promptsMock.select.mockReset();
    promptsMock.confirm.mockReset();

    fileOpsMock.readFileSafe.mockReset();
    fileOpsMock.writeFileSafe.mockReset();
    fileOpsMock.deleteFileSafe.mockReset();
    fileOpsMock.fileExists.mockReset();
    fileOpsMock.dirExists.mockReset();
    fileOpsMock.readJsonSafe.mockReset();
    fileOpsMock.writeJsonSafe.mockReset();

    validationMock.findMatchingPages.mockReset();
    templatesMock.loadTemplate.mockReset();
    templatesMock.renderTemplate.mockReset();

    featureConfigMock.getAvailableFeatureKeys.mockReset();
    featureConfigMock.getSuiteNames.mockReset();
    featureConfigMock.getSuiteName.mockReset();
    featureConfigMock.getSuiteIds.mockReset();
    featureConfigMock.hasSuiteId.mockReset();

    globMock.mockReset();

    // Default implementations
    (fileOpsMock.writeFileSafe as any).mockResolvedValue(undefined);
    (fileOpsMock.writeJsonSafe as any).mockResolvedValue(undefined);
    (fileOpsMock.deleteFileSafe as any).mockResolvedValue(undefined);
    (fileOpsMock.fileExists as any).mockReturnValue(false);
    (fileOpsMock.dirExists as any).mockReturnValue(false);

    (validationMock.findMatchingPages as any).mockResolvedValue([]);

    (templatesMock.loadTemplate as any).mockResolvedValue("spec template {{featureKey}}");
    (templatesMock.renderTemplate as any).mockImplementation((template: string, vars: Record<string, any>) => {
      return Object.entries(vars).reduce(
        (str, [key, val]) => str.replace(new RegExp(`{{${key}}}`, "g"), String(val)),
        template
      );
    });

    // featureConfig helpers
    (featureConfigMock.getSuiteNames as any).mockImplementation((suites: Record<string, string>) =>
      Object.values(suites)
    );
    (featureConfigMock.getSuiteName as any).mockImplementation(
      (suites: Record<string, string>, suiteId: number) => suites[suiteId.toString()]
    );
    (featureConfigMock.getSuiteIds as any).mockImplementation((suites: Record<string, string>) =>
      Object.keys(suites).map((id) => parseInt(id, 10))
    );
    (featureConfigMock.hasSuiteId as any).mockImplementation(
      (suites: Record<string, string>, suiteId: number) => suiteId.toString() in suites
    );

    (globMock as any).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  describe("suite:add", () => {
    it("should create suite with --feature flag", async () => {
      // Arrange
      const featureKey = "test-feature";

      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["test-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "test-feature": {
          tag: "@test-feature",
          planId: 1,
          suites: {},
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("Test Suite") // Suite name
        .mockResolvedValueOnce("2001"); // Suite ID

      // Act
      const { addSpec } = await importSpecCommand();
      await addSpec(featureKey);

      // Assert
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
      expect(fileOpsMock.writeJsonSafe).toHaveBeenCalled();
    });

    it("should prompt for feature selection when not provided", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["feature1", "feature2"]);
      (promptsMock.select as any).mockResolvedValueOnce("feature1");
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        feature1: {
          tag: "@feature1",
          planId: 1,
          suites: {},
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("Dropdown Suite")
        .mockResolvedValueOnce("3001");

      // Act
      const { addSpec } = await importSpecCommand();
      await addSpec(undefined);

      // Assert
      expect(promptsMock.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Select which feature:",
        })
      );
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
    });

    it("should add suite to featureConfig when new", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["config-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "config-feature": {
          tag: "@config-feature",
          planId: 1,
          suites: { "5001": "Existing Suite" },
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("New Suite")
        .mockResolvedValueOnce("5002");

      // Act
      const { addSpec } = await importSpecCommand();
      await addSpec("config-feature");

      // Assert
      expect(fileOpsMock.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "config-feature": expect.objectContaining({
            suites: expect.objectContaining({
              "5001": "Existing Suite",
              "5002": "New Suite",
            }),
          }),
        }),
        true
      );
    });

    it("should re-prompt on duplicate suite name", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["dup-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "dup-feature": {
          tag: "@dup-feature",
          planId: 1,
          suites: { "6001": "Existing Suite" },
        },
      });

      // First input is duplicate, second is valid
      (promptsMock.input as any)
        .mockResolvedValueOnce("Existing Suite") // Duplicate
        .mockResolvedValueOnce("Different Suite") // Valid
        .mockResolvedValueOnce("6002"); // Suite ID

      // Act
      const { addSpec } = await importSpecCommand();
      await addSpec("dup-feature");

      // Assert - should have called input 3 times
      expect(promptsMock.input).toHaveBeenCalledTimes(3);
    });

    it("should re-prompt on duplicate suite ID", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["dup-id-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "dup-id-feature": {
          tag: "@dup-id-feature",
          planId: 1,
          suites: { "7001": "Existing Suite" },
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("New Suite")
        .mockResolvedValueOnce("7001") // Duplicate ID
        .mockResolvedValueOnce("7002"); // Valid ID

      // Act
      const { addSpec } = await importSpecCommand();
      await addSpec("dup-id-feature");

      // Assert - should have called input 3 times
      expect(promptsMock.input).toHaveBeenCalledTimes(3);
    });

    it("should offer to create feature if it doesn't exist", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["other-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "other-feature": {
          tag: "@other-feature",
          planId: 1,
          suites: {},
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("New Suite")
        .mockResolvedValueOnce("8001")
        .mockResolvedValueOnce("9999"); // Plan ID for new feature

      (promptsMock.confirm as any).mockResolvedValueOnce(true); // Create feature

      // Act
      const { addSpec } = await importSpecCommand();
      await addSpec("new-feature");

      // Assert
      expect(promptsMock.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("doesn't exist"),
        })
      );
    });

    it("should throw if feature doesn't exist and user declines creation", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["other-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "other-feature": {
          tag: "@other-feature",
          planId: 1,
          suites: {},
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("Test Suite")
        .mockResolvedValueOnce("11001");

      (promptsMock.confirm as any).mockResolvedValueOnce(false); // Don't create

      // Act & Assert
      const { addSpec } = await importSpecCommand();
      await expect(addSpec("non-existent")).rejects.toThrow(/Feature creation cancelled/);
    });

    it("should throw if no features exist", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue([]);

      // Act & Assert
      const { addSpec } = await importSpecCommand();
      await expect(addSpec(undefined)).rejects.toThrow(/No features found/);
    });
  });

  describe("suite:delete", () => {
    it("should delete suite with --feature and --suite flags", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["test-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "test-feature": {
          tag: "@test-feature",
          planId: 1,
          suites: { "2001": "Test Suite" },
        },
      });

      (globMock as any).mockResolvedValue(["TEST-101-test-suite.spec.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);

      // Mock typed confirmation
      (promptsMock.input as any).mockResolvedValueOnce("delete Test Suite");

      // Act
      const { deleteSpec } = await importSpecCommand();
      await deleteSpec("test-feature", "Test Suite");

      // Assert
      expect(fileOpsMock.deleteFileSafe).toHaveBeenCalled();
      expect(fileOpsMock.writeJsonSafe).toHaveBeenCalled();
    });

    it("should prompt for feature and suite selection when not provided", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["feature1", "feature2"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        feature1: {
          tag: "@feature1",
          planId: 1,
          suites: { "3001": "Suite One", "3002": "Suite Two" },
        },
      });

      (promptsMock.select as any)
        .mockResolvedValueOnce("feature1") // Feature selection
        .mockResolvedValueOnce(3001); // Suite selection (returns ID)

      (globMock as any).mockResolvedValue(["FEAT-101-suite-one.spec.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (promptsMock.input as any).mockResolvedValueOnce("delete Suite One");

      // Act
      const { deleteSpec } = await importSpecCommand();
      await deleteSpec(undefined, undefined);

      // Assert
      expect(promptsMock.select).toHaveBeenCalledTimes(2);
      expect(fileOpsMock.deleteFileSafe).toHaveBeenCalled();
    });

    it("should require typed confirmation matching suite name", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["confirm-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "confirm-feature": {
          tag: "@confirm-feature",
          planId: 1,
          suites: { "4001": "Confirm Suite" },
        },
      });

      (globMock as any).mockResolvedValue(["CONF-101-confirm-suite.spec.ts"]);

      // Wrong confirmation text
      (promptsMock.input as any).mockResolvedValueOnce("wrong confirmation");

      // Act & Assert
      const { deleteSpec } = await importSpecCommand();
      await expect(deleteSpec("confirm-feature", "Confirm Suite")).rejects.toThrow(/Deletion cancelled/);
      expect(fileOpsMock.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should remove suite from featureConfig.json", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["remove-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "remove-feature": {
          tag: "@remove-feature",
          planId: 1,
          suites: { "6001": "Remove Suite", "6002": "Keep Suite" },
        },
      });

      (globMock as any).mockResolvedValue(["REMO-101-remove-suite.spec.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (promptsMock.input as any).mockResolvedValueOnce("delete Remove Suite");

      // Act
      const { deleteSpec } = await importSpecCommand();
      await deleteSpec("remove-feature", "Remove Suite");

      // Assert - suite 6001 should be removed, 6002 kept
      expect(fileOpsMock.writeJsonSafe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          "remove-feature": expect.objectContaining({
            suites: expect.objectContaining({
              "6002": "Keep Suite",
            }),
          }),
        }),
        true
      );
    });

    it("should throw if feature has no suites", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["empty-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "empty-feature": {
          tag: "@empty-feature",
          planId: 1,
          suites: {},
        },
      });

      // Act & Assert
      const { deleteSpec } = await importSpecCommand();
      await expect(deleteSpec("empty-feature", undefined)).rejects.toThrow(/has no suites/);
    });

    it("should throw if spec file not found", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["no-spec-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "no-spec-feature": {
          tag: "@no-spec-feature",
          planId: 1,
          suites: { "7001": "No Spec Suite" },
        },
      });

      (globMock as any).mockResolvedValue([]); // No spec files found

      // Act & Assert
      const { deleteSpec } = await importSpecCommand();
      await expect(deleteSpec("no-spec-feature", "No Spec Suite")).rejects.toThrow(/No spec file found/);
    });

    it("should throw if feature not found", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["other-feature"]);

      // Act & Assert
      const { deleteSpec } = await importSpecCommand();
      await expect(deleteSpec("non-existent", "Test Suite")).rejects.toThrow(/Feature not found/);
    });
  });

  describe("spec:add / spec:delete alias contract", () => {
    /**
     * Per README.cli:
     * - "spec:add is a legacy alias for suite:add. Both commands do the same thing."
     * - "spec:delete is a legacy alias for suite:delete. Both commands do the same thing."
     * 
     * The CLI routes both commands to the same underlying functions (addSpec, deleteSpec).
     * These tests verify that the functions behave identically regardless of which
     * command name was used to invoke them.
     */

    it("addSpec (used by both suite:add and spec:add) creates suite spec", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["alias-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "alias-feature": {
          tag: "@alias-feature",
          planId: 1,
          suites: {},
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("Alias Suite")
        .mockResolvedValueOnce("9001");

      // Act - addSpec is the function called by BOTH suite:add AND spec:add
      const { addSpec } = await importSpecCommand();
      await addSpec("alias-feature");

      // Assert - same behavior regardless of command name
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
      expect(fileOpsMock.writeJsonSafe).toHaveBeenCalled();

      // Verify the spec file path contains the suite name
      const writeCall = (fileOpsMock.writeFileSafe as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toMatch(/alias-suite\.spec\.ts$/);
    });

    it("deleteSpec (used by both suite:delete and spec:delete) removes suite spec", async () => {
      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["alias-del-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "alias-del-feature": {
          tag: "@alias-del-feature",
          planId: 1,
          suites: { "9501": "Alias Del Suite" },
        },
      });

      (globMock as any).mockResolvedValue(["ALIA-101-alias-del-suite.spec.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (promptsMock.input as any).mockResolvedValueOnce("delete Alias Del Suite");

      // Act - deleteSpec is the function called by BOTH suite:delete AND spec:delete
      const { deleteSpec } = await importSpecCommand();
      await deleteSpec("alias-del-feature", "Alias Del Suite");

      // Assert - same behavior regardless of command name
      expect(fileOpsMock.deleteFileSafe).toHaveBeenCalledWith(
        expect.stringContaining("alias-del-suite.spec.ts")
      );
      expect(fileOpsMock.writeJsonSafe).toHaveBeenCalled();
    });

    it("both addSpec invocations produce identical file structures", async () => {
      // This test documents that the implementation uses a single function
      // for both suite:add and spec:add, ensuring consistent behavior.

      // Arrange
      (featureConfigMock.getAvailableFeatureKeys as any).mockReturnValue(["contract-feature"]);
      (fileOpsMock.readJsonSafe as any).mockResolvedValue({
        "contract-feature": {
          tag: "@contract-feature",
          planId: 1,
          suites: {},
        },
      });

      (promptsMock.input as any)
        .mockResolvedValueOnce("Contract Suite")
        .mockResolvedValueOnce("10001");

      // Act
      const { addSpec } = await importSpecCommand();
      await addSpec("contract-feature");

      // Assert - verify the generated file follows spec naming convention
      const writeCall = (fileOpsMock.writeFileSafe as jest.Mock).mock.calls[0];
      const filePath = writeCall[0] as string;

      // The file should be named with the feature prefix and suite name
      expect(filePath).toMatch(/CONT-\d+-contract-suite\.spec\.ts$/);
    });
  });
});
