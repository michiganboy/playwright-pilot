#!/usr/bin/env node
// CLI entrypoint for the pilot tool.
import { Command } from "commander";
import { addPage, deletePage } from "./commands/page";
import { addFeature, deleteFeature } from "./commands/feature";
import { addSpec } from "./commands/spec";
import { addFactory, deleteFactory } from "./commands/factory";
import { runAttendant } from "./commands/attendant";

const program = new Command();

program
  .name("pilot")
  .description("CLI tool for scaffolding and maintaining Playwright test framework wiring")
  .version("1.0.0");

// Add commands
program
  .command("add:page")
  .description("Create a new page object and wire it into fixtures")
  .argument("<PageName>", "Name of the page (e.g., 'UserProfile' or 'user-profile')")
  .option("-f, --feature <featureKey>", "Feature key for the page directory")
  .action(async (pageName: string, options: { feature?: string }) => {
    try {
      await addPage(pageName, options.feature);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("delete:page")
  .description("Delete a page object and unwire it from fixtures")
  .argument("<PageName>", "Name of the page to delete")
  .action(async (pageName: string) => {
    try {
      await deletePage(pageName);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("add:feature")
  .description("Create a new feature with test folder, config entry, and initial spec")
  .argument("<FeatureName>", "Name of the feature (e.g., 'AppointmentBooking' or 'appointment-booking')")
  .option("-p, --plan-id <planId>", "Azure DevOps Plan ID (number)")
  .option("-s, --suites <suites>", "Azure DevOps Suite IDs (comma-separated numbers)")
  .action(async (featureName: string, options: { planId?: string; suites?: string }) => {
    try {
      const planId = options.planId ? parseInt(options.planId, 10) : undefined;
      const suites = options.suites
        ? options.suites.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
        : undefined;
      await addFeature(featureName, planId, suites);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("delete:feature")
  .description("Delete a feature (test folder and config entry)")
  .argument("<FeatureName>", "Name of the feature to delete")
  .action(async (featureName: string) => {
    try {
      await deleteFeature(featureName);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("add:spec")
  .description("Create a new spec file under an existing feature")
  .argument("<SpecName>", "Name of the spec (e.g., 'UserLoginFlow' or 'user-login-flow')")
  .requiredOption("-f, --feature <featureKey>", "Feature key (must already exist)")
  .action(async (specName: string, options: { feature: string }) => {
    try {
      await addSpec(specName, options.feature);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("add:factory")
  .description("Create a new data factory and add it to barrel exports")
  .argument("<ModelName>", "Name of the model (e.g., 'User' or 'user')")
  .action(async (modelName: string) => {
    try {
      await addFactory(modelName);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("delete:factory")
  .description("Delete a factory and remove it from barrel exports")
  .argument("<FactoryName>", "Name of the factory to delete")
  .action(async (factoryName: string) => {
    try {
      await deleteFactory(factoryName);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("attendant")
  .description("Run health checks on framework structure (read-only)")
  .action(async () => {
    try {
      await runAttendant();
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// Alias for help
program.command("help").description("Show help information").action(() => {
  program.help();
});

// Parse arguments
program.parse();
