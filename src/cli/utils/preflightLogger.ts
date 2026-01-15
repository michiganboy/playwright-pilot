// Preflight logging utility - captures and writes check output to flight logs
import { existsSync, mkdirSync, writeFileSync, renameSync, readdirSync, unlinkSync, statSync } from "fs";
import { join, dirname } from "path";
import { REPO_ROOT } from "./paths";

const LOG_DIR = join(REPO_ROOT, ".pilot", "preflight");
const TAIL_LINES = 60;

// Default number of log files to retain. Override via PILOT_LOG_RETENTION env var.
const DEFAULT_LOG_RETENTION = 10;

/**
 * Gets the configured log retention count from env or default.
 */
function getLogRetention(): number {
  const envValue = process.env.PILOT_LOG_RETENTION;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_LOG_RETENTION;
}

/**
 * Writes a file atomically using temp file + rename.
 * Ensures directory exists before writing.
 */
function atomicWriteSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, filePath);
}

/**
 * Safely appends to a file, recreating directory and file if needed.
 */
function safeAppend(filePath: string, content: string): void {
  try {
    const dir = dirname(filePath);
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
 * Prunes old log files, keeping only the most recent N logs.
 * Runs silently - errors do not interrupt execution.
 */
export function pruneOldLogs(): void {
  try {
    const retention = getLogRetention();
    if (!existsSync(LOG_DIR)) {
      return;
    }

    const files = readdirSync(LOG_DIR)
      .filter((f) => f.endsWith(".log"))
      .map((f) => ({
        name: f,
        path: join(LOG_DIR, f),
        mtime: statSync(join(LOG_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    // Delete files beyond retention count
    const toDelete = files.slice(retention);
    for (const file of toDelete) {
      try {
        unlinkSync(file.path);
      } catch {
        // Ignore individual file deletion errors
      }
    }
  } catch {
    // Silently ignore errors - log cleanup should not break execution
  }
}

/**
 * Creates a new log file path with timestamp.
 * Does NOT create the file - writeLogHeader handles atomic initialization.
 * Prunes old logs before creating new path.
 */
export function createLogFilePath(phase: "preflight" | "takeoff" = "preflight"): string {
  ensureLogDir();
  pruneOldLogs();
  const timestamp = getLogTimestamp();
  return join(LOG_DIR, `${phase}-${timestamp}.log`);
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
  // Atomic write: temp file + rename ensures no partial headers
  atomicWriteSync(logPath, header);
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
