// Playwright configuration for tests, reporters, and global settings.
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const reporters: any[] = [
  ["./src/utils/custom-list-reporter.ts"],
  ["json", { outputFile: "playwright-report.json" }],
  ["html", { outputFolder: "playwright-report", open: "never" }],
];

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  preserveOutput: "always",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    navigationTimeout: 30000,
    // Enable trace recording (retained only on failure)
    trace: "retain-on-failure",
  },
  reporter: reporters,
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
});

