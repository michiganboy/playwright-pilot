// Playwright configuration for tests, reporters, and global settings.
import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config();

const reporters: any[] = [
  ["list"],
  ["html"],
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

