/**
 * Shared test utilities for CLI command tests.
 * Extracted to reduce duplication and memory usage across split test files.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { tmpdir } from "os";
import * as fileOps from "../utils/fileOps";
import * as validation from "../utils/validation";
import * as templates from "../utils/templates";
import * as featureConfig from "../../utils/featureConfig";

// Helper to get properly typed mocks
export function mocked<T extends (...args: any[]) => any>(fn: T): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>;
}

// Shared test state
export let testDir: string;
export let originalConsoleLog: typeof console.log;
export let originalConsoleWarn: typeof console.warn;
export let originalConsoleError: typeof console.error;

/**
 * Sets up shared mocks and test directory before each test.
 * Call this in beforeEach of each test file.
 */
export async function setupBeforeEach() {
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
    mocked(validation.getFactoryReferencedFiles).mockResolvedValue([]);

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
}

/**
 * Cleans up after each test.
 * Call this in afterEach of each test file.
 */
export async function teardownAfterEach() {
  // Cleanup test directory
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });

  // Clear all mocks but preserve glob mock (it's reset in beforeEach for page:delete tests)
  jest.clearAllMocks();
}

/**
 * Restores console methods after all tests.
 * Call this in afterAll of each test file.
 */
export function teardownAfterAll() {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
}
