// Custom Azure DevOps sync utility that reads Playwright JSON results and syncs to ADO test runs.
import { readFileSync } from "fs";
import { FEATURE_CONFIG, getAvailableFeatureKeys } from "./featureConfig";

interface RunPlan {
  featureKey: string;
  tag: string;
  planId: number;
  suiteId: number;
  caseFilter?: string[];
}

interface PlaywrightTestResult {
  fullTitle: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  errorMessage?: string;
  file: string;
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
    error?: {
      message?: string;
    };
  }>;
}

interface AzureDevOpsTestResult {
  testCase: {
    id: string;
  };
  outcome: string;
  durationInMs: number;
  errorMessage?: string;
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

  if (features.length > 1 && suites.length > 0) {
    throw new Error("SUITES must be empty when multiple features are selected.");
  }

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
              const result = test.results[test.results.length - 1];
              results.push({
                fullTitle: `${spec.title} - ${test.title}`,
                status: result.status,
                durationMs: result.duration,
                errorMessage: result.error?.message,
                file: spec.file,
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
  const match = filePath.match(/tests\/e2e\/([^\/]+)\//);
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
  const match = title.match(/^\[(\d+)\]/);
  return match ? match[1] : null;
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
      const caseId = extractCaseId(test.fullTitle);
      if (!caseId || !plan.caseFilter.includes(caseId)) {
        return false;
      }
    }

    return true;
  });
}

async function createTestRun(
  orgUrl: string,
  project: string,
  token: string,
  plan: RunPlan
): Promise<number> {
  const url = `${orgUrl}/${project}/_apis/test/runs?api-version=7.0`;
  const name = `${plan.tag} - Suite ${plan.suiteId} - ${new Date().toISOString()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
    body: JSON.stringify({
      name,
      plan: {
        id: plan.planId,
      },
      automated: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create test run: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.id;
}

async function postTestResults(
  orgUrl: string,
  project: string,
  token: string,
  runId: number,
  tests: PlaywrightTestResult[]
): Promise<void> {
  const url = `${orgUrl}/${project}/_apis/test/Runs/${runId}/results?api-version=7.0`;

  const results: AzureDevOpsTestResult[] = tests.map((test) => {
    const caseId = extractCaseId(test.fullTitle);
    if (!caseId) {
      throw new Error(`Test "${test.fullTitle}" does not have a case ID in format [12345]`);
    }

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

    return {
      testCase: {
        id: caseId,
      },
      outcome,
      durationInMs: test.durationMs,
      errorMessage: test.errorMessage,
    };
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
    body: JSON.stringify({
      results,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post test results: ${response.status} ${errorText}`);
  }
}

export async function syncAzureDevOpsFromPlaywright(): Promise<void> {
  const orgUrl = process.env.ADO_ORG_URL;
  const project = process.env.ADO_PROJECT;
  const token = process.env.ADO_TOKEN;

  if (!orgUrl || !project || !token) {
    throw new Error(
      "Azure DevOps environment variables (ADO_ORG_URL, ADO_PROJECT, ADO_TOKEN) are required."
    );
  }

  const features = parseFeatures();
  const suites = parseSuites();
  const cases = parseCases();

  const runPlans = buildRunPlans(features, suites, cases);

  const jsonContent = readFileSync("playwright-report.json", "utf-8");
  const playwrightJson = JSON.parse(jsonContent);
  const allTests = flattenPlaywrightJson(playwrightJson);

  let totalRuns = 0;
  let totalTests = 0;

  for (const plan of runPlans) {
    const filteredTests = filterTestsForRunPlan(allTests, plan);

    if (filteredTests.length === 0) {
      console.log(`Skipping ${plan.tag} - Suite ${plan.suiteId}: no matching tests found`);
      continue;
    }

    const runId = await createTestRun(orgUrl, project, token, plan);
    await postTestResults(orgUrl, project, token, runId, filteredTests);

    totalRuns++;
    totalTests += filteredTests.length;
    console.log(
      `Synced ${filteredTests.length} tests to ${plan.tag} - Suite ${plan.suiteId} (Run ID: ${runId})`
    );
  }

  console.log(`\nSync complete: ${totalTests} tests across ${totalRuns} test runs`);
}

if (require.main === module) {
  syncAzureDevOpsFromPlaywright().catch((err) => {
    console.error("Azure DevOps sync failed:", err);
    process.exit(1);
  });
}
