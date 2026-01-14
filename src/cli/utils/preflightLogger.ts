// Preflight logging utility - captures and writes check output to flight logs
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { REPO_ROOT } from "./paths";

const LOG_DIR = join(REPO_ROOT, ".pilot", "preflight");
const TAIL_LINES = 60;

/**
 * Safely appends to a file, recreating directory and file if needed.
 */
function safeAppend(filePath: string, content: string): void {
  try {
    const dir = join(filePath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content, { encoding: "utf-8", flag: "a" });
  } catch {
    // Silently ignore write failures - logging should not break execution
  }
}

/**
 * Creates a filesystem-safe ISO timestamp for log filenames.
 */
export function getLogTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Ensures the log directory exists.
 */
export function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Creates a new log file path with timestamp and initializes the file.
 */
export function createLogFilePath(phase: "preflight" | "takeoff" = "preflight"): string {
  ensureLogDir();
  const timestamp = getLogTimestamp();
  const logPath = join(LOG_DIR, `${phase}-${timestamp}.log`);
  writeFileSync(logPath, "", "utf-8");
  return logPath;
}

/**
 * Writes initial header to flight log.
 */
export function writeLogHeader(logPath: string, phase: "preflight" | "takeoff"): void {
  ensureLogDir();
  const phaseLabel = phase === "preflight" ? "PREFLIGHT CHECK" : "TAKEOFF EXECUTION";
  const header = [
    "=".repeat(70),
    `PLAYWRIGHT PILOT - ${phaseLabel}`,
    `Run ID: ${getLogTimestamp()}`,
    `Started: ${new Date().toISOString()}`,
    `Platform: ${process.platform} (${process.arch})`,
    `Node: ${process.version}`,
    `Directory: ${process.cwd()}`,
    "=".repeat(70),
    "",
  ].join("\n");
  writeFileSync(logPath, header, "utf-8");
}

/**
 * Appends a checklist item header to the flight log.
 */
export function writeChecklistItemHeader(logPath: string, itemNumber: number, totalItems: number, itemName: string, command: string): void {
  const header = [
    "",
    "-".repeat(70),
    `ITEM ${itemNumber}/${totalItems}: ${itemName}`,
    `Command: ${command}`,
    `Started: ${new Date().toISOString()}`,
    "-".repeat(70),
    "",
  ].join("\n");
  safeAppend(logPath, header);
}

/**
 * Appends output to the flight log.
 */
export function appendToLog(logPath: string, output: string): void {
  safeAppend(logPath, output);
}

/**
 * Appends checklist item result to the flight log.
 */
export function writeChecklistItemResult(logPath: string, itemNumber: number, itemName: string, verified: boolean, durationMs: number): void {
  const status = verified ? "VERIFIED" : "FAILED";
  const result = [
    "",
    `Result: ${status}`,
    `Duration: ${formatDuration(durationMs)}`,
    `Completed: ${new Date().toISOString()}`,
    "",
  ].join("\n");
  safeAppend(logPath, result);
}

/**
 * Writes final summary to the flight log.
 */
export function writeLogFooter(logPath: string, verified: number, failed: number, totalDurationMs: number, cleared: boolean): void {
  const status = cleared ? "CLEARED" : "NOT CLEARED";
  const footer = [
    "",
    "=".repeat(70),
    "SUMMARY",
    `Status: ${status}`,
    `Verified: ${verified}`,
    `Failed: ${failed}`,
    `Total Duration: ${formatDuration(totalDurationMs)}`,
    `Completed: ${new Date().toISOString()}`,
    "=".repeat(70),
    "",
  ].join("\n");
  safeAppend(logPath, footer);
}

/**
 * Gets the last N lines of a string (for tail output).
 */
export function tailOutput(output: string, lines: number = TAIL_LINES): string {
  const allLines = output.split("\n");
  if (allLines.length <= lines) {
    return output;
  }
  return ["", `... (${allLines.length - lines} lines truncated)`, "", ...allLines.slice(-lines)].join("\n");
}

/**
 * Formats duration in human-readable form.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Formats a checklist item result line for console output (no emojis).
 */
export function formatChecklistResult(itemNumber: number, totalItems: number, itemName: string, verified: boolean, durationMs: number): string {
  const itemStr = `[${itemNumber}/${totalItems}]`;
  const status = verified ? "VERIFIED" : "FAILED";
  const duration = formatDuration(durationMs);
  // Pad item name to align status indicators
  const maxNameLength = 45;
  const truncatedName = itemName.length > maxNameLength ? itemName.slice(0, maxNameLength - 3) + "..." : itemName;
  return `${itemStr.padEnd(7)}  ${truncatedName.padEnd(maxNameLength)} ${status.padEnd(10)} ${duration}`;
}
