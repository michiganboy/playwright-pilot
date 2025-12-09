// Playwright configuration for tests, reporters, and global settings.
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const reporters: any[] = [
  ["./src/utils/custom-list-reporter.ts"],
  ["json", { outputFile: "playwright-report.json" }],
];

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  reporter: reporters,
  globalTeardown: "./global-teardown.ts",
});

