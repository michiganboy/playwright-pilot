#!/usr/bin/env node
// CLI entrypoint for the pilot tool.
import { Command } from "commander";
import { addPage, deletePage } from "./commands/page";
import { addFeature, deleteFeature } from "./commands/feature";
import { addSpec, deleteSpec } from "./commands/spec";
import { addFactory, deleteFactory } from "./commands/factory";
import { addSystemEntry, deleteSystemEntry } from "./commands/system";
import { runPreflight } from "./commands/preflight";
import { runTakeoff } from "./commands/takeoff";
import { openReport } from "./commands/trace";
import { printBanner } from "./theme/banner";
import { runHeal, runSync, runReview, runApply } from "./mcp";

// ANSI color codes
const RESET = "\x1b[0m";
const RED = "\x1b[31m"; // Error

function error(message: string): string {
  return `${RED}${message}${RESET}`;
}

const program = new Command();

program
  .name("pilot")
  .description("")
  .version("1.0.0")
  .option("--no-banner", "Suppress ASCII banner on startup")
  .addHelpText("before", "Opinionated Playwright CLI for structured test suites, rich test data, and Azure DevOps alignment\n\n\n");

// Add commands
program
  .command("page:add")
  .description("Create a new page object and wire it into fixtures")
  .argument("[PageName]", "Name of the page (optional - will prompt if not provided)")
  .option("-f, --feature <featureKey>", "Feature key for the page directory")
  .action(async (pageName: string | undefined, options: { feature?: string }) => {
    try {
      await addPage(pageName, options.feature);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("page:delete")
  .description("Delete a page object and unwire it from fixtures")
  .argument("[PageName]", "Name of the page to delete (optional - will prompt if not provided)")
  .action(async (pageName: string | undefined) => {
    try {
      await deletePage(pageName);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("feature:add")
  .description("Create a new feature with test folder, config entry, and initial spec")
  .argument("[FeatureName]", "Name of the feature (optional - will prompt if not provided)")
  .option("-p, --plan-id <planId>", "Azure DevOps Plan ID (number)")
  .action(async (featureName: string | undefined, options: { planId?: string }) => {
    try {
      const planId = options.planId ? parseInt(options.planId, 10) : undefined;
      await addFeature(featureName, planId);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("feature:delete")
  .description("Delete a feature (test folder and config entry)")
  .argument("[FeatureName]", "Name of the feature to delete (optional - will prompt if not provided)")
  .action(async (featureName: string | undefined) => {
    try {
      await deleteFeature(featureName);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("spec:add")
  .description("Create a new suite spec under an existing feature")
  .option("-f, --feature <featureKey>", "Feature key (must already exist)")
  .action(async (options: { feature?: string }) => {
    try {
      await addSpec(options.feature);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("suite:add")
  .description("Create a new suite under an existing feature")
  .option("-f, --feature <featureKey>", "Feature key (must already exist)")
  .action(async (options: { feature?: string }) => {
    try {
      await addSpec(options.feature);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("spec:delete")
  .description("Delete a suite spec and remove it from feature config")
  .option("-f, --feature <featureKey>", "Feature key")
  .option("-s, --suite <suiteName>", "Suite name")
  .action(async (options: { feature?: string; suite?: string }) => {
    try {
      await deleteSpec(options.feature, options.suite);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("suite:delete")
  .description("Delete a suite and remove it from feature config")
  .option("-f, --feature <featureKey>", "Feature key")
  .option("-s, --suite <suiteName>", "Suite name")
  .action(async (options: { feature?: string; suite?: string }) => {
    try {
      await deleteSpec(options.feature, options.suite);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("factory:add")
  .description("Create a new data factory and add it to barrel exports")
  .argument("[ModelName]", "Name of the model (optional - will prompt if not provided)")
  .action(async (modelName: string | undefined) => {
    try {
      await addFactory(modelName);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("factory:delete")
  .description("Delete a factory and remove it from barrel exports")
  .argument("[FactoryName]", "Name of the factory to delete (optional - will prompt if not provided)")
  .action(async (factoryName: string | undefined) => {
    try {
      await deleteFactory(factoryName);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("system:add")
  .description("Add a canonical system entry to registry and dataStore")
  .argument("[SystemKey]", "System key path (optional - will prompt if not provided)")
  .action(async (systemKey: string | undefined) => {
    try {
      await addSystemEntry(systemKey);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("system:delete")
  .description("Delete a canonical system entry from registry and dataStore")
  .argument("[SystemKey]", "System key path (optional - will prompt if not provided)")
  .action(async (systemKey: string | undefined) => {
    try {
      await deleteSystemEntry(systemKey);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("preflight")
  .description("Run preflight check to verify framework readiness")
  .action(async () => {
    await printBannerIfAllowed();
    try {
      const cleared = await runPreflight();
      if (!cleared) {
        process.exit(1);
      }
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("takeoff")
  .description("Execute the resolved test plan")
  .option("-s, --suites <suites>", "Comma-separated list of suites to run (default: all)")
  .option("-w, --workers <workers>", "Number of parallel workers (default: 4)")
  .option("--seed <seed>", "Seed for deterministic test data")
  .action(async (options: { suites?: string; workers?: string; seed?: string }) => {
    try {
      const suites = options.suites ? options.suites.split(",").map(s => s.trim()) : ["all"];
      const workers = options.workers ? parseInt(options.workers, 10) : 4;
      const passed = await runTakeoff({ suites, workers, seed: options.seed });
      if (!passed) {
        process.exit(1);
      }
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("trace:open")
  .description("Open the Playwright HTML report in the browser")
  .action(async () => {
    try {
      await openReport();
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

/**
 * MCP Commands
 */
program
  .command("mcp:heal")
  .description("Analyze the most recent failed test and generate MCP proposals")
  .option("-t, --trace <path>", "Path to trace.zip or a test-results directory")
  .option("--run-id <runId>", "Run ID to filter failures by")
  .option("-q, --quiet", "Minimal output")
  .action(async (opts: { trace?: string; runId?: string; quiet?: boolean }) => {
    try {
      const ok = await runHeal({
        trace: opts.trace,
        runId: opts.runId,
        quiet: !!opts.quiet,
      });
      if (!ok) process.exit(1);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("mcp:sync")
  .description("Sync ADO context for the newest active MCP proposal")
  .action(async () => {
    try {
      await runSync();
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("mcp:review")
  .description("Review MCP proposals (interactive when available)")
  .option("--proposal-id <id>", "Proposal ID to review")
  .option("--latest", "Use newest active proposal")
  .option("--json", "Print selected proposal to stdout as JSON")
  .option("-q, --quiet", "Minimal output")
  .action(async (opts: { proposalId?: string; latest?: boolean; json?: boolean; quiet?: boolean }) => {
    try {
      const ok = await runReview({
        proposalId: opts.proposalId,
        latest: !!opts.latest,
        json: !!opts.json,
        quiet: !!opts.quiet,
      });
      if (!ok) process.exit(1);
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command("mcp:apply")
  .description("Apply the selected MCP patch plan (requires explicit approval)")
  .option("--proposal-id <id>", "Proposal ID to apply")
  .option("--latest", "Use newest active proposal")
  .option("-y, --yes", "Skip confirmation prompt when supported")
  .option("--preview", "Preview changes without writing files")
  .option("-q, --quiet", "Minimal output")
  .action(
    async (opts: { proposalId?: string; latest?: boolean; yes?: boolean; preview?: boolean; quiet?: boolean }) => {
      try {
        const ok = await runApply({
          proposalId: opts.proposalId,
          latest: !!opts.latest,
          yes: !!opts.yes,
          preview: !!opts.preview,
          quiet: !!opts.quiet,
        });
        if (!ok) process.exit(1);
      } catch (err) {
        console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    }
  );

// Help command with banner
program.command("help").description("Show help information").action(async () => {
  await printBannerIfAllowed();
  program.help();
});

// Helper to get package version
function getPackageVersion(packageName: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(`${packageName}/package.json`);
    return pkg.version;
  } catch {
    return "not installed";
  }
}

// Helper to run git command and get output
function getGitInfo(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("child_process");

    const hash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    const cleanStatus = status === "" ? "clean" : "dirty";

    return `${hash} (${branch}, ${cleanStatus})`;
  } catch {
    return "not a git repo";
  }
}

// Version command with banner
program.command("version").description("Show version number").action(async () => {
  await printBannerIfAllowed();

  console.log(`  Pilot:       ${program.version()}`);
  console.log(`  Playwright:  ${getPackageVersion("@playwright/test")}`);
  console.log(`  TypeScript:  ${getPackageVersion("typescript")}`);
  console.log(`  Node:        ${process.version}`);
  console.log(`  Platform:    ${process.platform} (${process.arch})`);
  console.log(`  Git:         ${getGitInfo()}`);
  console.log(`  Directory:   ${process.cwd()}`);
  console.log();
  console.log("  Clear skies ahead. Happy testing!");
  console.log();
});

// Determines if banner should display based on environment
function shouldShowBanner(): boolean {
  if (process.env.CI) return false;
  if (!process.stdout.isTTY) return false;
  if (process.argv.includes("--no-banner")) return false;
  return true;
}

// Print banner only for help/version commands
async function printBannerIfAllowed(): Promise<void> {
  if (shouldShowBanner()) {
    await printBanner(process.argv);
  }
}

// Main entry: parse arguments (banner handled by specific commands)
async function main(): Promise<void> {
  // If no command provided, show banner + help
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "--no-banner")) {
    await printBannerIfAllowed();
    program.help();
    return;
  }

  // Parse and execute commands
  await program.parseAsync();
}

// Run CLI (only when this file is executed directly)
main().catch((err) => {
  console.error(error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
