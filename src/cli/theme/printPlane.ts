// Prints the ASCII plane with subtle styling and line-by-line animation
import chalk from "chalk";
import { PLANE_ASCII } from "./plane";

const LINE_DELAY_MS = 10;

/**
 * Prints the ASCII plane to stdout with dim styling.
 * Outputs line-by-line with a short delay for visual effect.
 * Safe to call once during CLI startup; no side effects on import.
 */
export async function printPlane(): Promise<void> {
  const lines = PLANE_ASCII.split("\n");

  for (const line of lines) {
    process.stdout.write(chalk.dim(line) + "\n");
    await new Promise((resolve) => setTimeout(resolve, LINE_DELAY_MS));
  }
}
