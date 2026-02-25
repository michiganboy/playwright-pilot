// MCP apply report writer (Slice 10).
// Writes a read-only JSON report after apply: proposal metadata, ADO context, selection, and apply summary.

import path from "path";
import { promises as fs } from "fs";
import { REPO_ROOT } from "../../utils/paths";
import type { ProposalSet, SelectionManifest, ApplySummary } from "../types";

const REPORTS_DIR = path.join(REPO_ROOT, ".pilot", "reports");

/**
 * Report payload shape written to disk.
 */
export interface ApplyReportPayload {
  proposalId: string;
  writtenAt: string;
  proposalSet: ProposalSet;
  selectionManifest: SelectionManifest;
  adoContext: unknown;
  applySummary: ApplySummary;
}

/**
 * Returns the report file path for a proposal and optional timestamp.
 * Timestamp format: YYYYMMDD-HHmmss (local time).
 */
export function getReportPath(proposalId: string, now?: Date): string {
  const d = now ?? new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ts =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return path.join(REPORTS_DIR, `${ts}-${proposalId}.json`);
}

async function ensureReportsDir(): Promise<void> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

/**
 * Writes the apply report atomically (temp file + rename).
 * Fails loudly on invalid inputs or write errors.
 * Returns the written file path.
 */
export async function writeApplyReport(args: {
  proposalSet: ProposalSet;
  selectionManifest: SelectionManifest;
  applySummary: ApplySummary;
  adoContext?: unknown | null;
  now?: Date;
}): Promise<string> {
  const { proposalSet, selectionManifest, applySummary, adoContext = null, now } = args;

  if (!proposalSet?.id) {
    throw new Error("writeApplyReport: proposalSet.id is required");
  }
  if (!selectionManifest?.proposalId || selectionManifest.proposalId !== proposalSet.id) {
    throw new Error("writeApplyReport: selectionManifest.proposalId must match proposalSet.id");
  }
  if (!applySummary?.proposalSetId || applySummary.proposalSetId !== proposalSet.id) {
    throw new Error("writeApplyReport: applySummary.proposalSetId must match proposalSet.id");
  }

  const writtenAt = (now ?? new Date()).toISOString();
  const payload: ApplyReportPayload = {
    proposalId: proposalSet.id,
    writtenAt,
    proposalSet,
    selectionManifest,
    adoContext: adoContext ?? null,
    applySummary,
  };

  await ensureReportsDir();
  const filePath = getReportPath(proposalSet.id, now);
  const tempPath = `${filePath}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);

  return filePath;
}
