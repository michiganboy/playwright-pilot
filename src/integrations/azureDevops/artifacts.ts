// Artifact utilities for Azure DevOps attachments.
import { existsSync } from "fs";
import { resolve } from "path";

/**
 * Finds trace.zip file for a given test result directory.
 */
export function findTraceZip(testResultDir: string): string | null {
  const tracePath = resolve(testResultDir, "trace.zip");
  return existsSync(tracePath) ? tracePath : null;
}

/**
 * Finds error-context.md file for a given test result directory.
 */
export function findErrorContext(testResultDir: string): string | null {
  const errorContextPath = resolve(testResultDir, "error-context.md");
  return existsSync(errorContextPath) ? errorContextPath : null;
}

/**
 * Finds .last-run.json file in test-results directory.
 */
export function findLastRunJson(testResultsDir: string = "./test-results"): string | null {
  const lastRunPath = resolve(testResultsDir, ".last-run.json");
  return existsSync(lastRunPath) ? lastRunPath : null;
}
