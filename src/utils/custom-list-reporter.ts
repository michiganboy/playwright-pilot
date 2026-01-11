import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import boxen from "boxen";
import wrap from "word-wrap";
import cliProgress, { MultiBar, SingleBar } from "cli-progress";
import { syncAzureDevOpsFromPlaywright } from "../integrations/azureDevops";

class CustomListReporter implements Reporter {
  private passedCount = 0;
  private failedCount = 0;
  private skippedCount = 0;
  private totalTests = 0;
  private completedTests = 0;
  private multiBar: MultiBar | null = null;
  private featureBars: Map<string, SingleBar> = new Map();
  private featureTestCounts: Map<string, number> = new Map();
  private featureCompletedCounts: Map<string, number> = new Map();
  private featurePendingTests: Map<string, TestCase[]> = new Map();
  private failedTests: Array<{ test: TestCase; result: TestResult }> = [];

  onBegin(config: FullConfig, suite: Suite) {
    this.totalTests = suite.allTests().length;
    console.log(`Running ${this.totalTests} tests using ${config.workers} worker${config.workers > 1 ? "s" : ""}\n`);

    // Discover all features and their test counts, track pending tests
    const allTests = suite.allTests();
    for (const test of allTests) {
      const feature = this.extractFeature(test);
      this.featureTestCounts.set(feature, (this.featureTestCounts.get(feature) || 0) + 1);
      this.featureCompletedCounts.set(feature, 0);
      if (!this.featurePendingTests.has(feature)) {
        this.featurePendingTests.set(feature, []);
      }
      this.featurePendingTests.get(feature)!.push(test);
    }

    // Create MultiBar instance
    this.multiBar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: '{feature} |{bar}| {value}/{total} | {percentage}%',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    }, cliProgress.Presets.shades_classic);

    // Create a progress bar for each feature
    const sortedFeatures = Array.from(this.featureTestCounts.keys()).sort();
    for (const feature of sortedFeatures) {
      const testCount = this.featureTestCounts.get(feature) || 0;
      const bar = this.multiBar.create(testCount, 0, { feature });
      this.featureBars.set(feature, bar);
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.completedTests++;

    if (result.status === "passed") {
      this.passedCount++;
    } else if (result.status === "failed") {
      this.failedCount++;
    } else if (result.status === "skipped") {
      this.skippedCount++;
    }

    const feature = this.extractFeature(test);

    // Remove completed test from pending list
    const pendingTests = this.featurePendingTests.get(feature);
    if (pendingTests) {
      const index = pendingTests.findIndex(t => t.id === test.id);
      if (index >= 0) {
        pendingTests.splice(index, 1);
      }
    }

    // Update feature progress (only count tests that actually ran - passed or failed, not skipped)
    if (result.status !== "skipped") {
      const featureCompleted = (this.featureCompletedCounts.get(feature) || 0) + 1;
      this.featureCompletedCounts.set(feature, featureCompleted);
      const featureBar = this.featureBars.get(feature);

      // Update feature bar with completed count (percentage is automatically calculated)
      if (featureBar) {
        featureBar.update(featureCompleted, { feature });
      }
    }

    // Collect failed tests to print at the end
    if (result.status === "failed") {
      this.failedTests.push({ test, result });
    }
  }

  onEnd(result: FullResult) {
    // Stop all progress bars before printing anything else
    if (this.multiBar) {
      this.multiBar.stop();
      this.multiBar = null;
    }

    console.log('\n');

    // Print all failed test errors
    for (const { test, result: testResult } of this.failedTests) {
      const title = this.extractTestTitle(test.title);
      const feature = this.extractFeature(test);
      const fullTitle = `${feature}: ${title}`;

      const failedStep = this.extractFailedStep(testResult);
      const errorMessage = testResult.error ? this.extractErrorMessage(testResult.error) : undefined;

      console.log(`  \x1b[31m✗\x1b[0m ${fullTitle} (${testResult.duration}ms)`);

      if (failedStep) {
        console.log(`\n      Failed at: ${failedStep}`);
      }

      if (errorMessage) {
        const wrappedMessage = wrap(errorMessage, {
          width: process.stdout.columns ? Math.min(process.stdout.columns - 20, 120) : 120,
          cut: false,
          trim: true,
        });
        const errorBox = boxen(wrappedMessage, {
          borderStyle: {
            topLeft: "+",
            topRight: "+",
            bottomLeft: "+",
            bottomRight: "+",
            top: "-",
            bottom: "-",
            left: "|",
            right: "|",
            horizontal: "-",
            vertical: "|",
          },
          padding: 1,
          margin: { left: 6 },
          title: "Error",
          titleAlignment: "left",
          width: process.stdout.columns ? Math.min(process.stdout.columns - 10, 130) : 130,
        });
        console.log(`\n${errorBox}\n`);
      }
    }

    // Print summary
    const parts: string[] = [];
    parts.push(`${this.passedCount} passed`);
    if (this.failedCount > 0) parts.push(`${this.failedCount} failed`);
    if (this.skippedCount > 0) parts.push(`${this.skippedCount} skipped`);

    const summary = parts.join(", ");
    console.log(`${summary} (${(result.duration / 1000).toFixed(1)}s)`);
  }

  private extractFeature(test: TestCase): string {
    const parent = test.parent;
    if (parent && parent.title) {
      const match = parent.title.match(/@(\w+)/);
      if (match) {
        return this.capitalizeFirst(match[1]);
      }
    }
    if (test.location && test.location.file) {
      const match = test.location.file.match(/(?:^|\/)(?:tests\/)?e2e\/([^\/]+)\//);
      if (match) {
        return this.capitalizeFirst(match[1]);
      }
    }
    return "Other";
  }

  private extractTestTitle(fullTitle: string): string {
    const match = fullTitle.match(/\[(\d+)\]\s*(.+)/);
    if (match) {
      return match[2].trim();
    }
    return fullTitle;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private extractFailedStep(result: TestResult): string | undefined {
    if (result.steps && result.steps.length > 0) {
      const failedStep = result.steps.find(step => step.error);
      if (failedStep) {
        return failedStep.title;
      }
      const lastStep = result.steps[result.steps.length - 1];
      return lastStep.title;
    }
    return undefined;
  }

  private extractErrorMessage(error: TestResult["error"]): string | undefined {
    if (!error) return undefined;

    const message = error.message || "";

    const expectedMatch = message.match(/Expected:\s*(.+?)(?:\n|$)/);
    const receivedMatch = message.match(/Received:\s*(.+?)(?:\n|$)/);

    if (expectedMatch && receivedMatch) {
      return `Expected: ${expectedMatch[1].trim()}\n\nReceived: ${receivedMatch[1].trim()}`;
    }

    if (expectedMatch) {
      return `Expected: ${expectedMatch[1].trim()}`;
    }

    if (receivedMatch) {
      return `Received: ${receivedMatch[1].trim()}`;
    }

    // Return the full message instead of truncating
    return message.trim() || "Test failed";
  }

  async onExit() {
    // onExit runs after globalTeardown, so JSON reporter file should be fully written
    // Run ADO sync here if enabled, but only if tests were actually run
    if (process.env.ADO_AUTO_SYNC === "true") {
      try {
        // Check if there are any tests in the report before syncing
        const fs = await import("fs");
        const path = await import("path");
        const reportPath = path.resolve(process.cwd(), "playwright-report.json");

        if (fs.existsSync(reportPath)) {
          const reportContent = fs.readFileSync(reportPath, "utf-8");
          const report = JSON.parse(reportContent);

          // Only sync if there are actual test results
          const hasTests = report.suites && report.suites.length > 0;
          if (hasTests) {
            await syncAzureDevOpsFromPlaywright(true);
          }
          // If no tests, silently skip sync (this is normal when running non-Playwright tests)
        }
      } catch (err) {
        console.error("Azure DevOps auto-sync failed:", err);
        // Don't fail the test run if sync fails
      }
    }
  }
}

export default CustomListReporter;
