// pilot mcp run command
// Orchestrates heal -> review -> apply in a single workflow.
import { runHeal, runReview, runApply } from "../index";

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

export interface RunOptions {
  trace?: string;
  runId?: string;
  quiet?: boolean;
  preview?: boolean;
  yes?: boolean;
}

export async function runRun(options: RunOptions = {}): Promise<boolean> {
  const log = options.quiet ? () => {} : console.log;
  const LINE = "\u2500".repeat(60);

  if (!options.quiet) {
    log();
    log(`${BOLD}PILOT MCP RUN${RESET}`);
    log(LINE);
    log();
  }

  const healOk = await runHeal({
    trace: options.trace,
    runId: options.runId,
    quiet: options.quiet,
  });

  if (!healOk) {
    return false;
  }

  const reviewOk = await runReview({
    latest: true,
    quiet: options.quiet,
  });

  if (!reviewOk) {
    return false;
  }

  const applyOk = await runApply({
    latest: true,
    preview: !!options.preview,
    yes: !!options.yes,
    quiet: options.quiet,
  } as any);

  if (!applyOk) {
    return false;
  }

  return true;
}

