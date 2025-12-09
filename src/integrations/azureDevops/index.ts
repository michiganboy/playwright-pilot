// Custom Azure DevOps sync utility that reads Playwright JSON results and syncs to ADO test runs.
import { readFile } from "fs/promises";
import { hostname } from "os";
import { resolve } from "path";
import { FEATURE_CONFIG, getAvailableFeatureKeys } from "../../utils/featureConfig";

interface RunPlan {
  featureKey: string;
  tag: string;
  planId: number;
  suiteId: number;
  caseFilter?: string[];
}

interface PlaywrightTestStep {
  title: string;
  duration: number;
}

interface PlaywrightTestResult {
  fullTitle: string;
  suiteTitle: string;
  testTitle: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  errorMessage?: string;
  file: string;
  steps?: PlaywrightTestStep[];
  startTime?: string;
  retry?: number;
  stdout?: string[];
  stderr?: string[];
  attachments?: any[];
}

interface PlaywrightJsonSuite {
  title: string;
  file?: string;
  specs?: PlaywrightJsonSpec[];
  suites?: PlaywrightJsonSuite[];
}

interface PlaywrightJsonSpec {
  title: string;
  file: string;
  tests?: PlaywrightJsonTest[];
}

interface PlaywrightJsonTest {
  title: string;
  results?: Array<{
    status: "passed" | "failed" | "skipped";
    duration: number;
    errors?: Array<{
      message?: string;
      stack?: string;
      location?: {
        file?: string;
        line?: number;
        column?: number;
      };
    }>;
    steps?: Array<{
      title: string;
      duration: number;
    }>;
    startTime?: string;
    retry?: number;
    stdout?: string[];
    stderr?: string[];
    attachments?: any[];
  }>;
}

interface AzureDevOpsActionResult {
  actionPath: string;
  iterationId: number;
  outcome: string;
  errorMessage?: string | null;
  durationInMs?: number;
  comment?: string;
}

interface AzureDevOpsIterationDetail {
  id: number;
  outcome: string;
  actionResults: AzureDevOpsActionResult[];
}

interface TestPoint {
  id: number;
  testCase: {
    id: string;
    name: string;
    revision: number;
  };
  configuration?: {
    id: string;
    name: string;
  };
}

interface TestCaseStep {
  id: string;
  action: string;
  expectedResult?: string;
}

interface AzureDevOpsTestResult {
  id?: number; // Existing test result ID (for updates)
  testPointId?: number;
  testCaseId?: string;
  testCaseRevision?: number;
  testCaseTitle?: string;
  outcome: string;
  automatedTestName?: string;
  state?: string;
  durationInMs: number;
  startedDate?: string;
  completedDate?: string;
  errorMessage?: string;
  comment?: string;
  computerName?: string;
  testPlan?: { id: number };
  testSuite?: { id: number };
  iterationDetails?: AzureDevOpsIterationDetail[];
}

function parseEnvVar(name: string): string[] {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return [];
  }
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function parseFeatures(): string[] {
  const features = parseEnvVar("FEATURES");
  if (features.length === 0) {
    throw new Error(
      `FEATURES environment variable is required. Available features: ${getAvailableFeatureKeys().join(", ")}`
    );
  }
  return features;
}

function parseSuites(): number[] {
  const suites = parseEnvVar("SUITES");
  return suites.map((s) => {
    const num = parseInt(s, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid suite ID: ${s}. Suite IDs must be numeric.`);
    }
    return num;
  });
}

function parseCases(): string[] {
  return parseEnvVar("CASES");
}

function validateFeatures(features: string[]): void {
  const available = getAvailableFeatureKeys();
  for (const feature of features) {
    if (!FEATURE_CONFIG[feature]) {
      throw new Error(
        `Invalid feature: ${feature}. Available features: ${available.join(", ")}`
      );
    }
  }
}

function buildRunPlans(features: string[], suites: number[], cases: string[]): RunPlan[] {
  validateFeatures(features);

  // Suite filtering is only supported for a single feature
  if (features.length > 1 && suites.length > 0) {
    throw new Error("SUITES must be empty when multiple features are selected.");
  }

  // Case filtering requires exactly one feature and one suite for precise targeting
  if (cases.length > 0 && (features.length !== 1 || suites.length !== 1)) {
    throw new Error(
      "CASES can only be used when exactly one feature and exactly one suite are specified."
    );
  }

  const plans: RunPlan[] = [];

  if (features.length === 1) {
    const featureKey = features[0];
    const config = FEATURE_CONFIG[featureKey];

    if (suites.length === 0) {
      for (const suiteId of config.suites) {
        plans.push({
          featureKey,
          tag: config.tag,
          planId: config.planId,
          suiteId,
        });
      }
    } else {
      for (const suiteId of suites) {
        if (!config.suites.includes(suiteId)) {
          throw new Error(
            `Suite ID ${suiteId} is not valid for feature ${featureKey}. Valid suite IDs: ${config.suites.join(", ")}`
          );
        }
        plans.push({
          featureKey,
          tag: config.tag,
          planId: config.planId,
          suiteId,
          caseFilter: cases.length > 0 ? cases : undefined,
        });
      }
    }
  } else {
    for (const featureKey of features) {
      const config = FEATURE_CONFIG[featureKey];
      for (const suiteId of config.suites) {
        plans.push({
          featureKey,
          tag: config.tag,
          planId: config.planId,
          suiteId,
        });
      }
    }
  }

  return plans;
}

function flattenPlaywrightJson(json: any): PlaywrightTestResult[] {
  const results: PlaywrightTestResult[] = [];

  function processSuite(suite: PlaywrightJsonSuite, filePath: string = ""): void {
    if (suite.file) {
      filePath = suite.file;
    }

    if (suite.specs) {
      for (const spec of suite.specs) {
        if (spec.tests) {
          for (const test of spec.tests) {
            if (test.results && test.results.length > 0) {
              // Use the last result (most recent) in case of retries
              const result = test.results[test.results.length - 1];
              // In Playwright JSON, spec.title is the test case title (with case ID),
              // and suite.title is the describe block/suite title.
              // Extract error message from errors array (Playwright uses errors array, not single error)
              // Strip ANSI escape codes for cleaner display in ADO
              const errorMessage = result.errors && result.errors.length > 0
                ? result.errors.map((err: any) => {
                  const msg = err.message || "Unknown error";
                  return stripAnsiCodes(msg);
                }).join("\n")
                : undefined;

              results.push({
                fullTitle: `${suite.title} - ${spec.title}`,
                suiteTitle: suite.title,
                testTitle: spec.title,
                status: result.status,
                durationMs: result.duration,
                errorMessage: errorMessage,
                file: spec.file,
                steps: result.steps?.map((step: any) => ({
                  title: step.title,
                  duration: step.duration,
                })),
                startTime: result.startTime,
                retry: result.retry,
                stdout: result.stdout,
                stderr: result.stderr,
                attachments: result.attachments,
              });
            }
          }
        }
      }
    }

    if (suite.suites) {
      for (const subSuite of suite.suites) {
        processSuite(subSuite, filePath);
      }
    }
  }

  if (json.suites) {
    for (const suite of json.suites) {
      processSuite(suite);
    }
  }

  return results;
}

function extractFeatureFromPath(filePath: string): string | null {
  // Normalize path separators so regex works on Windows and POSIX paths
  const normalizedPath = filePath.replace(/\\/g, "/");
  // Support paths with or without a leading "tests/" segment, e.g.:
  // - "tests/e2e/authentication/..." (full repo path)
  // - "e2e/authentication/..." (Playwright JSON relative to tests root)
  const match = normalizedPath.match(/(?:^|\/)(?:tests\/)?e2e\/([^\/]+)\//);
  if (!match) {
    return null;
  }
  const featureKey = match[1];
  if (!FEATURE_CONFIG[featureKey]) {
    return null;
  }
  return featureKey;
}

function extractCaseId(title: string): string | null {
  // Expect a case ID like [12345] at the start of the *test* title.
  if (!title) {
    return null;
  }
  const match = title.match(/^\[(\d+)\]/);
  return match ? match[1] : null;
}

function stripCaseIdPrefix(title: string): string {
  // Remove a leading case ID like "[12345] " from the test title for display purposes.
  return title.replace(/^\[\d+\]\s*/, "");
}

function stripTagFromSuiteTitle(suiteTitle: string): string {
  // Remove everything from the first @ onwards (handles multiple tags)
  return suiteTitle.replace(/\s*@.*$/, "").trim();
}

function stripAnsiCodes(text: string): string {
  // Remove ANSI escape codes (e.g., [31m, [32m, [39m, [7m, [27m, [1m, [22m, etc.)
  // Pattern matches: ESC[ followed by numbers and optional semicolons, ending with a letter
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function filterTestsForRunPlan(
  tests: PlaywrightTestResult[],
  plan: RunPlan
): PlaywrightTestResult[] {
  return tests.filter((test) => {
    const featureKey = extractFeatureFromPath(test.file);
    if (featureKey !== plan.featureKey) {
      return false;
    }

    if (plan.caseFilter) {
      const caseId = extractCaseId(test.testTitle);
      if (!caseId || !plan.caseFilter.includes(caseId)) {
        return false;
      }
    }

    return true;
  });
}

async function getTestPoints(
  orgUrl: string,
  project: string,
  token: string,
  planId: number,
  suiteId: number
): Promise<TestPoint[]> {
  const url = `${orgUrl}/${project}/_apis/test/Plans/${planId}/Suites/${suiteId}/points?api-version=7.0`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get test points: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { value: TestPoint[] };
  return data.value;
}

async function getTestCaseSteps(
  orgUrl: string,
  project: string,
  token: string,
  testCaseId: string
): Promise<TestCaseStep[]> {
  // Fetch test case work item to extract step definitions from Microsoft.VSTS.TCM.Steps field
  const url = `${orgUrl}/${project}/_apis/wit/workitems/${testCaseId}?$expand=all&api-version=7.0`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get test case: ${response.status} ${errorText}`);
  }

  const workItem = (await response.json()) as {
    fields: {
      "Microsoft.VSTS.TCM.Steps"?: string;
      "System.Title"?: string;
      "System.Rev"?: number;
    };
  };

  const stepsXml = workItem.fields["Microsoft.VSTS.TCM.Steps"];
  if (!stepsXml) {
    return [];
  }

  // Parse XML to extract step IDs and actions
  // XML format: <steps><step id="1"><parameterizedString>Action</parameterizedString><parameterizedString>Expected</parameterizedString></step></steps>
  // Match each step and extract the first parameterizedString (action)
  const stepRegex = /<step id="(\d+)"[^>]*>([\s\S]*?)<\/step>/g;
  const steps: TestCaseStep[] = [];
  let match;

  while ((match = stepRegex.exec(stepsXml)) !== null) {
    const stepId = match[1];
    const stepContent = match[2];

    // Extract the first parameterizedString (action)
    const actionMatch = stepContent.match(/<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>/);
    const action = actionMatch ? actionMatch[1].trim() : "";

    steps.push({
      // ADO requires actionPath to be zero-padded to 8 digits (e.g., "00000001")
      id: stepId.padStart(8, "0"),
      action: action,
    });
  }

  return steps;
}

async function createTestRun(
  orgUrl: string,
  project: string,
  token: string,
  plan: RunPlan,
  suiteName: string,
  testPointIds: number[],
  quiet: boolean = false
): Promise<number> {
  const log = quiet ? () => { } : (...args: any[]) => console.log(...args);
  const warn = quiet ? () => { } : (...args: any[]) => console.warn(...args);
  const url = `${orgUrl}/${project}/_apis/test/runs?api-version=7.0`;
  // Remove Playwright tags (e.g., @authentication) from suite title for cleaner run names
  const cleanedSuiteName = stripTagFromSuiteTitle(suiteName);
  const name = `${plan.tag} - ${cleanedSuiteName}`;

  // Build configuration (optional)
  // Note: ADO requires a valid BUILD_ID for build information to appear in the test run.
  // BUILD_NUMBER alone will not display without a valid BUILD_ID.
  // If you only have BUILD_NUMBER, you'll need to find the corresponding BUILD_ID in ADO.
  const buildConfig: { id: number; number?: string; uri?: string } | undefined = (() => {
    const buildId = process.env.BUILD_ID || process.env.BUILD_BUILDID;
    const buildNumber = process.env.BUILD_NUMBER || process.env.BUILD_BUILDNUMBER;
    const buildUri = process.env.BUILD_URI || process.env.BUILD_BUILDURI;

    // ADO requires a valid build ID for build information to display
    // If no build ID is provided, skip build configuration entirely
    if (!buildId) {
      if (buildNumber) {
        warn(`Warning: BUILD_NUMBER is set but BUILD_ID is missing. `);
        warn(`ADO requires a valid BUILD_ID for build information to appear. `);
        warn(`Skipping build configuration. To include build info, set BUILD_ID to a valid build ID from ADO.`);
      }
      return undefined;
    }

    const parsedId = parseInt(buildId, 10);
    if (isNaN(parsedId)) {
      warn(`Warning: BUILD_ID "${buildId}" is not a valid number. Skipping build configuration.`);
      return undefined;
    }

    // Build a config object with required id and optional number/uri
    const config: { id: number; number?: string; uri?: string } = {
      id: parsedId,
    };

    if (buildNumber) {
      config.number = buildNumber;
    }

    if (buildUri) {
      config.uri = buildUri;
    }

    return config;
  })();

  // Create a planned test run linked to the test plan and specific test points
  // Note: testSuite should be set automatically by ADO based on pointIds
  const body: any = {
    name,
    plan: {
      id: plan.planId,
    },
    pointIds: testPointIds,
    automated: true,
    state: "InProgress",
  };

  if (buildConfig) {
    body.build = buildConfig;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to create test run: ${response.status} ${errorText}`;

    if (response.status === 400 && errorText.includes("Build") && errorText.includes("cannot be found")) {
      errorMessage += `\n\nNote: The BUILD_ID you provided does not exist in Azure DevOps. `;
      errorMessage += `Either use a valid build ID, or remove BUILD_ID and use only BUILD_NUMBER for display purposes.`;
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    id: number;
    plan?: { id: number };
    testSuite?: { id: number };
    [key: string]: any;
  };

  // Check if suite was set on initial creation
  if (!data.testSuite?.id) {
    // Update suite association after creation if not set initially
    const updateUrl = `${orgUrl}/${project}/_apis/test/runs/${data.id}?api-version=7.0`;
    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
      },
      body: JSON.stringify({
        testSuite: {
          id: plan.suiteId,
        },
      }),
    });

    if (!updateResponse.ok) {
      const updateErrorText = await updateResponse.text();
      console.error(`Failed to update run suite association: ${updateResponse.status} ${updateErrorText}`);
    }
  }

  return data.id;
}

async function getExistingTestResults(
  orgUrl: string,
  project: string,
  token: string,
  runId: number
): Promise<Map<number, number>> {
  // Returns a map of testPointId -> testResultId for existing results in the run
  // Planned runs automatically create placeholder results that need to be updated
  const url = `${orgUrl}/${project}/_apis/test/Runs/${runId}/results?api-version=7.0`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get existing test results: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    value: Array<{
      id: number;
      testPoint?: { id: number };
      [key: string]: any;
    }>;
  };

  const resultMap = new Map<number, number>();
  for (const result of data.value) {
    if (result.testPoint?.id) {
      // ADO returns testPoint.id as a string, however it must be a number to match testPoint.id values
      const testPointId = typeof result.testPoint.id === "string"
        ? parseInt(result.testPoint.id, 10)
        : result.testPoint.id;
      resultMap.set(testPointId, result.id);
    }
  }

  return resultMap;
}

async function postTestResults(
  orgUrl: string,
  project: string,
  token: string,
  runId: number,
  tests: PlaywrightTestResult[],
  testPoints: Map<string, TestPoint>,
  testCaseSteps: Map<string, TestCaseStep[]>,
  planId: number,
  suiteId: number,
  quiet: boolean = false
): Promise<void> {
  const log = quiet ? () => { } : (...args: any[]) => console.log(...args);
  const warn = quiet ? () => { } : (...args: any[]) => console.warn(...args);
  const existingResults = await getExistingTestResults(orgUrl, project, token, runId);

  const url = `${orgUrl}/${project}/_apis/test/Runs/${runId}/results?api-version=7.0`;

  const results: AzureDevOpsTestResult[] = await Promise.all(
    tests.map(async (test) => {
      const caseId = extractCaseId(test.testTitle);
      if (!caseId) {
        throw new Error(`Test "${test.fullTitle}" does not have a case ID in format [12345]`);
      }

      const testPoint = testPoints.get(caseId);
      if (!testPoint) {
        throw new Error(`Test case ${caseId} not found in test plan suite`);
      }

      // Map Playwright test status to ADO outcome values
      let outcome: string;
      switch (test.status) {
        case "passed":
          outcome = "Passed";
          break;
        case "failed":
          outcome = "Failed";
          break;
        case "skipped":
          outcome = "NotExecuted";
          break;
        default:
          outcome = "NotExecuted";
      }

      // Get test case steps to map Playwright steps to actual step IDs
      const steps = testCaseSteps.get(caseId) || [];

      // Map Playwright steps to ADO actionResults using actual test case step IDs
      // Each Playwright step is matched to an ADO test case step by index
      const actionResults: AzureDevOpsActionResult[] | undefined = test.steps?.map(
        (playwrightStep, stepIndex) => {
          // Match Playwright step to ADO test case step by index, fallback to generated ID if no match
          const testCaseStep = steps[stepIndex];
          const actionPath = testCaseStep?.id || String(stepIndex + 1).padStart(8, "0");

          return {
            actionPath: actionPath,
            iterationId: 1,
            outcome: outcome === "Passed" ? "Passed" : "Failed",
            durationInMs: playwrightStep.duration,
            comment: playwrightStep.title,
          };
        }
      );

      // Calculate completedDate from startTime + duration
      const completedDate = test.startTime
        ? new Date(new Date(test.startTime).getTime() + test.durationMs).toISOString()
        : undefined;

      // Build comment with additional metadata if available
      const commentParts: string[] = [];
      if (test.retry !== undefined && test.retry > 0) {
        commentParts.push(`Retry: ${test.retry}`);
      }
      if (test.stdout && test.stdout.length > 0) {
        commentParts.push(`Stdout: ${test.stdout.join("\n")}`);
      }
      if (test.stderr && test.stderr.length > 0) {
        commentParts.push(`Stderr: ${test.stderr.join("\n")}`);
      }
      const comment = commentParts.length > 0 ? commentParts.join("\n") : undefined;

      const existingResultId = existingResults.get(testPoint.id);

      const result: AzureDevOpsTestResult = {
        ...(existingResultId && { id: existingResultId }),
        testPointId: testPoint.id,
        testCaseId: caseId,
        testCaseRevision: testPoint.testCase.revision,
        testCaseTitle: testPoint.testCase.name,
        outcome,
        // Remove case ID prefix (e.g., "[8] ") from test title for cleaner display
        automatedTestName: stripCaseIdPrefix(test.testTitle),
        state: "Completed",
        durationInMs: test.durationMs,
        startedDate: test.startTime,
        completedDate: completedDate,
        errorMessage: test.errorMessage,
        comment: comment,
        computerName: hostname(),
        testPlan: { id: planId },
        testSuite: { id: suiteId },
      };

      // Include iterationDetails with actionResults if steps are available
      // ADO uses iterationDetails to represent test execution iterations (typically just one)
      if (actionResults && actionResults.length > 0) {
        result.iterationDetails = [
          {
            id: 1,
            outcome: outcome,
            actionResults,
          },
        ];
      }

      return result;
    })
  );

  // Separate results that have existing IDs (need updates) from new results (need creation)
  const resultsToUpdate = results.filter((r) => r.id !== undefined);

  if (resultsToUpdate.length === 0) {
    warn(`No existing test results found to update. Expected ${results.length} results.`);
    warn("This may indicate that ADO didn't create placeholder results, or testPointIds don't match.");
    // Fallback to POST for creating new results when no placeholders exist
    const resultsForPost = results.map(({ id, ...result }) => result);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
      },
      body: JSON.stringify(resultsForPost),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to post test results: ${response.status} ${errorText}`);
    }
    return;
  }

  // Use PATCH to update existing results
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
    body: JSON.stringify(resultsToUpdate),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update test results: ${response.status} ${errorText}`);
  }
}

async function completeTestRun(
  orgUrl: string,
  project: string,
  token: string,
  runId: number
): Promise<void> {
  const url = `${orgUrl}/${project}/_apis/test/runs/${runId}?api-version=7.0`;
  const completedDate = new Date().toISOString();

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
    body: JSON.stringify({
      state: "Completed",
      completedDate: completedDate,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to complete test run: ${response.status} ${errorText}`);
  }
}

export async function syncAzureDevOpsFromPlaywright(quiet: boolean = false): Promise<void> {
  const orgUrl = process.env.ADO_ORG_URL;
  const project = process.env.ADO_PROJECT;
  const token = process.env.ADO_TOKEN;

  if (!orgUrl || !project || !token) {
    throw new Error(
      "Azure DevOps environment variables (ADO_ORG_URL, ADO_PROJECT, ADO_TOKEN) are required."
    );
  }

  // Helper to conditionally log based on quiet flag
  const log = quiet ? () => { } : (...args: any[]) => console.log(...args);
  const warn = quiet ? () => { } : (...args: any[]) => console.warn(...args);

  const features = parseFeatures();
  const suites = parseSuites();
  const cases = parseCases();

  const runPlans = buildRunPlans(features, suites, cases);

  const reportPath = resolve(process.cwd(), "playwright-report.json");
  const jsonContent = await readFile(reportPath, "utf-8");
  const playwrightJson = JSON.parse(jsonContent);
  const allTests = flattenPlaywrightJson(playwrightJson);

  let totalRuns = 0;
  let totalTests = 0;

  for (const plan of runPlans) {
    const filteredTests = filterTestsForRunPlan(allTests, plan);

    if (filteredTests.length === 0) {
      log(`Skipping ${plan.tag} - Suite ${plan.suiteId}: no matching tests found`);
      continue;
    }

    // Fetch test points from the ADO test plan/suite to get testPointIds and test case metadata
    const testPoints = await getTestPoints(orgUrl, project, token, plan.planId, plan.suiteId);

    // Create a map of case ID to test point for O(1) lookup when matching Playwright tests to ADO test points
    const testPointMap = new Map<string, TestPoint>();
    for (const point of testPoints) {
      testPointMap.set(point.testCase.id, point);
    }

    // Fetch test case step definitions from ADO work items to map Playwright steps to ADO step IDs
    const testCaseSteps = new Map<string, TestCaseStep[]>();
    for (const test of filteredTests) {
      const caseId = extractCaseId(test.testTitle);
      if (caseId && !testCaseSteps.has(caseId)) {
        try {
          const steps = await getTestCaseSteps(orgUrl, project, token, caseId);
          testCaseSteps.set(caseId, steps);
        } catch (err) {
          warn(`Failed to get steps for test case ${caseId}: ${err}`);
        }
      }
    }

    // Filter test points to only those that match filtered tests
    const caseIds = new Set(filteredTests.map((t) => extractCaseId(t.testTitle)).filter((id): id is string => !!id));
    const matchingTestPointIds = testPoints
      .filter((p) => caseIds.has(p.testCase.id))
      .map((p) => p.id);

    if (matchingTestPointIds.length === 0) {
      log(`Skipping ${plan.tag} - Suite ${plan.suiteId}: no matching test points found`);
      continue;
    }

    // All tests in a filtered set share the same suiteTitle, use the first one for the run name
    const suiteName = filteredTests[0].suiteTitle;
    const runId = await createTestRun(orgUrl, project, token, plan, suiteName, matchingTestPointIds, quiet);
    log(`Created test run ${runId} for plan ${plan.planId}, suite ${plan.suiteId}`);

    await postTestResults(orgUrl, project, token, runId, filteredTests, testPointMap, testCaseSteps, plan.planId, plan.suiteId, quiet);
    log(`Posted ${filteredTests.length} test results to run ${runId}`);

    await completeTestRun(orgUrl, project, token, runId);
    log(`Completed test run ${runId}`);

    totalRuns++;
    totalTests += filteredTests.length;
    log(
      `Synced ${filteredTests.length} tests to ${plan.tag} - Suite ${plan.suiteId} (Run ID: ${runId})`
    );
  }

  // Show final summary only in verbose mode (not in quiet mode)
  if (!quiet) {
    console.log(`\nSync complete: ${totalTests} tests across ${totalRuns} test runs`);
  }
}

if (require.main === module) {
  syncAzureDevOpsFromPlaywright().catch((err) => {
    console.error("Azure DevOps sync failed:", err);
    process.exit(1);
  });
}
