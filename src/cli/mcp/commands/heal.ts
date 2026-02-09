// pilot mcp heal command
// Analyzes a failed Playwright test using an existing trace.
// Classifies the failure and produces one or more proposal items.
// Persists proposal + evidence under .pilot/proposals/active/

import path from "path";
import { existsSync } from "fs";
import { promises as fs } from "fs";
import { glob } from "fast-glob";
import { randomUUID } from "crypto";
import { REPO_ROOT } from "../../utils/paths";
import { analyzeFailure } from "../adapter";
import {
  saveProposalSet,
  getEvidencePath,
  ensureDirectories,
} from "../persistence";
import {
  resolveFailureArtifacts,
  buildEvidencePacketFromIndex,
  copyArtifactsToEvidence,
} from "../artifacts";
import { extractTraceZip, getExtractionDir } from "../artifacts/zipExtractor";
import type { FailureContext } from "../types";
import { loadAdoContextForTestId } from "../ado/contextLoader";
import type { AdoContext } from "../ado/types";

// ANSI color codes
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

/**
 * Options for heal command.
 */
export interface HealOptions {
  /** Path to trace file or test-results directory */
  trace?: string;
  /** Run ID to filter by */
  runId?: string;
  /** Quiet mode - minimal output */
  quiet?: boolean;
}

/**
 * Playwright JSON report structure.
 */
interface PlaywrightJsonReport {
  suites?: PlaywrightJsonSuite[];
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
  results?: PlaywrightJsonResult[];
}

interface PlaywrightJsonResult {
  status: "passed" | "failed" | "skipped";
  duration: number;
  retry?: number;
  errors?: Array<{
    message?: string;
    stack?: string;
  }>;
  attachments?: Array<{
    name: string;
    path?: string;
    contentType: string;
  }>;
  stdout?: string[];
  stderr?: string[];
}

/**
 * Finds the most recent failed test from playwright-report.json.
 */
async function findFailedTestFromReport(): Promise<FailureContext | null> {
  const reportPath = path.join(REPO_ROOT, "playwright-report.json");
  
  if (!existsSync(reportPath)) {
    return null;
  }

  const content = await fs.readFile(reportPath, "utf-8");
  const report: PlaywrightJsonReport = JSON.parse(content);
  
  // Find failed tests
  const failedTests: Array<{
    suite: PlaywrightJsonSuite;
    spec: PlaywrightJsonSpec;
    test: PlaywrightJsonTest;
    result: PlaywrightJsonResult;
  }> = [];

  function processReportSuite(suite: PlaywrightJsonSuite): void {
    if (suite.specs) {
      for (const spec of suite.specs) {
        if (spec.tests) {
          for (const test of spec.tests) {
            if (test.results) {
              // Get the last result (most recent attempt)
              const result = test.results[test.results.length - 1];
              if (result.status === "failed") {
                failedTests.push({ suite, spec, test, result });
              }
            }
          }
        }
      }
    }
    if (suite.suites) {
      for (const subSuite of suite.suites) {
        processReportSuite(subSuite);
      }
    }
  }

  if (report.suites) {
    for (const suite of report.suites) {
      processReportSuite(suite);
    }
  }

  if (failedTests.length === 0) {
    return null;
  }

  // Use the first failed test
  const { suite, spec, test, result } = failedTests[0];
  
  // Build failure context
  const errorMessage = result.errors?.[0]?.message || "Unknown error";
  const stackTrace = result.errors?.[0]?.stack;
  
  // Find trace attachment
  const traceAttachment = result.attachments?.find(
    (a) => a.name === "trace" || a.contentType === "application/zip"
  );
  const tracePath = traceAttachment?.path || "";

  // Find screenshot attachments
  const screenshots = result.attachments
    ?.filter((a) => a.contentType.startsWith("image/"))
    ?.map((a) => a.path || "")
    ?.filter((p) => p.length > 0) || [];

  // Extract test ID from title (e.g., [12345])
  const testIdMatch = spec.title.match(/^\[(\d+)\]/);
  const testId = testIdMatch ? testIdMatch[1] : undefined;

  // Extract feature key from file path
  const filePathNormalized = spec.file.replace(/\\/g, "/");
  const featureMatch = filePathNormalized.match(/tests\/([^/]+)\//);
  const featureKey = featureMatch ? featureMatch[1] : undefined;

  return {
    tracePath,
    errorMessage,
    stackTrace,
    testFile: spec.file,
    testTitle: spec.title,
    suiteName: suite.title,
    duration: result.duration,
    retries: result.retry,
    featureKey,
    testId,
    screenshots,
    consoleOutput: [...(result.stdout || []), ...(result.stderr || [])],
  };
}

/**
 * Finds trace files in test-results directory.
 */
async function findTraceFiles(testResultsDir: string): Promise<string[]> {
  const pattern = path.join(testResultsDir, "**", "trace.zip").replace(/\\/g, "/");
  return glob(pattern, { cwd: REPO_ROOT });
}

/**
 * Builds failure context from a trace file path.
 */
async function buildContextFromTrace(tracePath: string): Promise<FailureContext | null> {
  // Try to find associated error-context.md file
  const traceDir = path.dirname(tracePath);
  const errorContextPath = path.join(traceDir, "error-context.md");
  
  let errorMessage = "Test failed";
  let stackTrace: string | undefined;

  if (existsSync(errorContextPath)) {
    const content = await fs.readFile(errorContextPath, "utf-8");
    // Parse error context (assumes markdown format)
    const errorMatch = content.match(/## Error\s*\n([\s\S]*?)(?=\n##|$)/);
    if (errorMatch) {
      errorMessage = errorMatch[1].trim();
    }
    const stackMatch = content.match(/## Stack Trace\s*\n([\s\S]*?)(?=\n##|$)/);
    if (stackMatch) {
      stackTrace = stackMatch[1].trim();
    }
  }

  // Extract test info from directory name
  // Playwright creates dirs like: test-title-suffix/
  const dirName = path.basename(traceDir);
  
  // Find screenshot files in the trace directory
  const screenshotPattern = path.join(traceDir, "*.png").replace(/\\/g, "/");
  const screenshots = await glob(screenshotPattern);

  return {
    tracePath: path.resolve(tracePath),
    errorMessage,
    stackTrace,
    testFile: "unknown", // Would need more context
    testTitle: dirName,
    screenshots,
  };
}

/**
 * Main heal command implementation.
 */
export async function runHeal(options: HealOptions = {}): Promise<boolean> {
  const log = options.quiet ? () => {} : console.log;
  const LINE = "\u2500".repeat(60);

  log();
  log(`${BOLD}PILOT MCP HEAL${RESET}`);
  log(LINE);
  log();

  // Ensure directories exist
  await ensureDirectories();

  // Step 1: Find failure context
  log(`${CYAN}Collecting failure context...${RESET}`);
  
  let context: FailureContext | null = null;

  if (options.trace) {
    // Use specified trace path
    if (existsSync(options.trace)) {
      context = await buildContextFromTrace(options.trace);
    } else {
      console.error(`Trace file not found: ${options.trace}`);
      return false;
    }
  } else {
    // Try to find from playwright-report.json first
    context = await findFailedTestFromReport();
    
    if (!context) {
      // Fall back to scanning test-results directory
      const testResultsDir = path.join(REPO_ROOT, "test-results");
      if (existsSync(testResultsDir)) {
        const traces = await findTraceFiles(testResultsDir);
        if (traces.length > 0) {
          // Use the most recent trace
          context = await buildContextFromTrace(traces[0]);
        }
      }
    }
  }

  if (!context) {
    log();
    log(`${YELLOW}No failed tests found to analyze.${RESET}`);
    log();
    log(`${DIM}Run your tests first, then try again:${RESET}`);
    log(`  npx playwright test`);
    log();
    return false;
  }

  log(`  Test: ${context.testTitle}`);
  log(`  File: ${context.testFile}`);
  if (context.tracePath) {
    log(`  Trace: ${context.tracePath}`);
  }
  log();

  // Step 2: Resolve and index artifacts (Slice 2)
  log(`${CYAN}Resolving artifacts...${RESET}`);
  
  // Determine source path: use explicit trace option, or tracePath from context, or test-results dir
  let sourcePath: string;
  if (options.trace) {
    sourcePath = options.trace;
  } else if (context.tracePath && existsSync(context.tracePath)) {
    // If tracePath is a file, use its directory; if it's a directory, use it directly
    const traceStat = await fs.stat(context.tracePath).catch(() => null);
    sourcePath = traceStat?.isDirectory() ? context.tracePath : path.dirname(context.tracePath);
  } else {
    sourcePath = path.join(REPO_ROOT, "test-results");
  }
  
  const artifactIndex = await resolveFailureArtifacts(sourcePath);
  
  // If we have a tracePath from context but didn't find it in the index, add it manually
  if (context.tracePath && existsSync(context.tracePath)) {
    const traceStat = await fs.stat(context.tracePath).catch(() => null);
    if (traceStat && traceStat.isFile() && !artifactIndex.traceZip) {
      artifactIndex.traceZip = {
        path: path.resolve(context.tracePath),
        sizeBytes: traceStat.size,
        mtime: traceStat.mtime,
      };
      if (!artifactIndex.sourcePaths.includes(context.tracePath)) {
        artifactIndex.sourcePaths.push(context.tracePath);
      }
    }
  }
  
  log(`  Trace ZIP: ${artifactIndex.traceZip ? "found" : "not found"}`);
  log(`  Attachments: ${artifactIndex.attachments.length} found`);
  
  const screenshotCount = artifactIndex.attachments.filter((a) => a.kind === "screenshot").length;
  const videoCount = artifactIndex.attachments.filter((a) => a.kind === "video").length;
  const logCount = artifactIndex.attachments.filter((a) => a.kind === "log").length;
  
  if (screenshotCount > 0) {
    log(`    Screenshots: ${screenshotCount}`);
  }
  if (videoCount > 0) {
    log(`    Videos: ${videoCount}`);
  }
  if (logCount > 0) {
    log(`    Logs: ${logCount}`);
  }
  
  if (artifactIndex.notes.length > 0) {
    log(`  Notes: ${artifactIndex.notes.length} item(s)`);
  }
  log();

  // Step 3: Copy evidence files to proposal-specific directory first
  // (We need the final evidence dir to extract trace for DOM inspection)
  log(`${CYAN}Collecting evidence...${RESET}`);
  
  // Generate proposal ID early so we can use it for evidence directory
  const proposalId = randomUUID();
  const finalEvidenceDir = getEvidencePath(proposalId);
  const { copiedFiles, errors } = await copyArtifactsToEvidence(artifactIndex, finalEvidenceDir);
  
  if (errors.length > 0) {
    log(`  ${YELLOW}Warnings: ${errors.length} error(s) during copy${RESET}`);
    for (const error of errors) {
      log(`    ${DIM}${error}${RESET}`);
    }
  }
  
  log(`  Copied ${copiedFiles.length} evidence file(s)`);
  log(`  Evidence location: ${finalEvidenceDir}`);
  
  // Extract trace.zip if available for DOM inspection
  // Use the copied trace.zip in the evidence directory
  const copiedTraceZipPath = path.join(finalEvidenceDir, "trace.zip");
  if (existsSync(copiedTraceZipPath)) {
    const extractDir = getExtractionDir(finalEvidenceDir);
    const extractResult = await extractTraceZip(copiedTraceZipPath, extractDir);
    
    if (extractResult.success) {
      log(`  Trace extracted: ${extractDir}`);
      // Update artifact index with extraction directory
      artifactIndex.extractedDir = extractDir;
    } else {
      log(`  ${YELLOW}Trace extraction failed: ${extractResult.error}${RESET}`);
    }
  }
  log();

  // Step 4: Load ADO context if testId is available (Slice 5)
  let adoContext = null;
  if (context.testId) {
    const testIdNum = parseInt(context.testId, 10);
    if (!isNaN(testIdNum)) {
      try {
        adoContext = await loadAdoContextForTestId(testIdNum);
        if (adoContext) {
          log(`  ${GREEN}ADO context loaded${RESET}`);
        }
      } catch (error) {
        // Framework error: invalid ADO context file
        log();
        log(`${RED}${BOLD}FRAMEWORK ERROR: ADO Context Invalid${RESET}`);
        log();
        log(`${error instanceof Error ? error.message : String(error)}`);
        log();
        log(`${DIM}ADO context file exists but is invalid. Please check: .pilot/context/ado/${testIdNum}.json${RESET}`);
        log();
        return false;
      }
    }
  }

  // Step 5: Build enriched EvidencePacket from artifacts (after extraction)
  log(`${CYAN}Building evidence packet...${RESET}`);

  const evidencePacket = buildEvidencePacketFromIndex(
    artifactIndex,
    finalEvidenceDir,
    context.errorMessage,
    context.stackTrace,
    {
      testFile: context.testFile,
      testTitle: context.testTitle,
      suiteName: context.suiteName,
      duration: context.duration,
      retries: context.retries,
    },
    adoContext
  );

  log(`  Evidence packet built`);
  log();

  // Step 5: Send to MCP adapter for analysis (with enriched evidence)
  log(`${CYAN}Analyzing failure...${RESET}`);

  let proposalSet;
  try {
    // Create proposal set with known ID so evidence dir matches
    proposalSet = await analyzeFailure(context, evidencePacket);
    
    // Ensure proposal set uses our generated ID (adapter may generate its own)
    proposalSet.id = proposalId;
  } catch (error) {
    // DOM inspection framework errors must stop the process
    if (error instanceof Error && error.message.includes("DOM inspection failed")) {
      log();
      log(`${RED}${BOLD}FRAMEWORK ERROR: DOM Inspection Failed${RESET}`);
      log();
      log(`${error.message}`);
      log();
      log(`${DIM}This indicates a problem with trace extraction or snapshot reading.${RESET}`);
      log(`${DIM}Please report this issue with the trace.zip file for investigation.${RESET}`);
      log();
      return false;
    }
    // Re-throw other errors
    throw error;
  }

  log(`  Classification complete`);

  const healCount = proposalSet.items.filter((i) => i.type === "heal").length;
  const bugCount = proposalSet.items.filter((i) => i.type === "bug").length;
  const analysisCount = proposalSet.items.filter((i) => i.type === "analysis").length;
  
  log(`  Generated ${proposalSet.items.length} proposal(s):`);
  if (healCount > 0) {
    log(`    Heal: ${healCount} (actionable)`);
  }
  if (bugCount > 0) {
    log(`    Bug: ${bugCount}`);
  }
  if (analysisCount > 0) {
    log(`    Analysis: ${analysisCount}`);
  }
  log();

  // Step 4: Persist proposal set
  log(`${CYAN}Persisting proposal...${RESET}`);
  
  const proposalPath = await saveProposalSet(proposalSet);
  log(`  Saved to: ${proposalPath}`);
  log();

  // Step 5: Summary
  log(LINE);
  log();
  log(`${GREEN}Heal analysis complete.${RESET}`);
  log();
  log(`${BOLD}Proposal Summary${RESET}`);
  log();
  
  const healItems = proposalSet.items.filter((i) => i.type === "heal");
  const bugItems = proposalSet.items.filter((i) => i.type === "bug");
  const analysisItems = proposalSet.items.filter((i) => i.type === "analysis");

  if (healItems.length > 0) {
    log(`  ${GREEN}Heal proposals:${RESET} ${healItems.length}`);
    for (const item of healItems) {
      log(`    • ${item.summary} ${DIM}(${(item.confidence * 100).toFixed(0)}% confidence)${RESET}`);
    }
  }
  
  if (bugItems.length > 0) {
    log(`  ${YELLOW}Bug proposals:${RESET} ${bugItems.length}`);
    for (const item of bugItems) {
      log(`    • ${item.summary} ${DIM}(${(item.confidence * 100).toFixed(0)}% confidence)${RESET}`);
    }
  }
  
  if (analysisItems.length > 0) {
    log(`  ${CYAN}Analysis items:${RESET} ${analysisItems.length}`);
    for (const item of analysisItems) {
      log(`    • ${item.summary}`);
    }
  }

  log();
  log(`${DIM}Next steps:${RESET}`);
  log(`  pilot mcp review          Review and select proposals`);
  log(`  pilot mcp apply           Apply selected proposals`);
  log();

  return true;
}
