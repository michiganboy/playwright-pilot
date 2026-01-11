#!/usr/bin/env node
// CLI entrypoint for the pilot tool.
import { Command } from "commander";
import { addPage, deletePage } from "./commands/page";
import { addFeature, deleteFeature } from "./commands/feature";
import { addSpec, deleteSpec } from "./commands/spec";
import { addFactory, deleteFactory } from "./commands/factory";
import { runAttendant } from "./commands/attendant";

// ANSI color codes
const RESET = "\x1b[0m";
const RED = "\x1b[31m"; // Error

function error(message: string): string {
  return `${RED}${message}${RESET}`;
}

const program = new Command();

program
  .name("pilot")
  .description("CLI tool for scaffolding and maintaining Playwright test framework wiring")
  .version("1.0.0");

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
  .command("attendant")
  .description("Run health checks on framework structure (read-only)")
  .action(async () => {
    try {
      await runAttendant();
    } catch (err) {
      console.error(error(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// Alias for help
program.command("help").description("Show help information").action(() => {
  program.help();
});

// Parse arguments
program.parse();
