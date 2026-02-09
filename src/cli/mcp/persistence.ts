// MCP Proposal Persistence
// Handles storage and retrieval of proposals, selections, and archives.
// All proposals are stored under .pilot/proposals/

import path from "path";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import { REPO_ROOT } from "../utils/paths";
import type {
  ProposalSet,
  SelectionManifest,
  ApplySummary,
  ArchivedProposal,
} from "./types";

/**
 * Base directory for all MCP-related persistence.
 */
export const PILOT_DIR = path.join(REPO_ROOT, ".pilot");
export const PROPOSALS_DIR = path.join(PILOT_DIR, "proposals");
export const ACTIVE_DIR = path.join(PROPOSALS_DIR, "active");
export const SELECTION_DIR = path.join(PROPOSALS_DIR, "selection");
export const ARCHIVE_DIR = path.join(PROPOSALS_DIR, "archive");
export const EVIDENCE_DIR = path.join(PROPOSALS_DIR, "evidence");

/**
 * Ensures all required directories exist.
 */
export async function ensureDirectories(): Promise<void> {
  await fs.mkdir(ACTIVE_DIR, { recursive: true });
  await fs.mkdir(SELECTION_DIR, { recursive: true });
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
}

/**
 * Gets the path to a proposal set file.
 */
export function getProposalSetPath(proposalSetId: string): string {
  return path.join(ACTIVE_DIR, `${proposalSetId}.proposal.json`);
}

/**
 * Gets the path to a selection manifest file.
 * @deprecated Use getSelectionManifestPath from proposals/selectionManifest instead
 */
export function getSelectionManifestPath(proposalSetId: string): string {
  return path.join(SELECTION_DIR, `${proposalSetId}.selection.json`);
}

/**
 * Gets the path to a review outcome marker file.
 */
export function getReviewOutcomePath(proposalSetId: string): string {
  return path.join(ACTIVE_DIR, `${proposalSetId}.review-outcome.json`);
}

/**
 * Gets the path to an evidence directory.
 */
export function getEvidencePath(proposalSetId: string): string {
  return path.join(EVIDENCE_DIR, proposalSetId);
}

/**
 * Gets the path to an archived proposal.
 */
export function getArchivePath(proposalSetId: string): string {
  return path.join(ARCHIVE_DIR, `${proposalSetId}.archive.json`);
}

/**
 * Saves a ProposalSet to disk.
 */
export async function saveProposalSet(proposalSet: ProposalSet): Promise<string> {
  await ensureDirectories();
  const filePath = getProposalSetPath(proposalSet.id);
  await fs.writeFile(filePath, JSON.stringify(proposalSet, null, 2), "utf-8");
  return filePath;
}

/**
 * Loads a ProposalSet from disk.
 */
export async function loadProposalSet(proposalSetId: string): Promise<ProposalSet | null> {
  const filePath = getProposalSetPath(proposalSetId);
  if (!existsSync(filePath)) {
    return null;
  }
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as ProposalSet;
}

/**
 * Saves a SelectionManifest to disk.
 * @deprecated Use saveSelectionManifest from proposals/selectionManifest instead
 */
export async function saveSelectionManifest(manifest: SelectionManifest): Promise<string> {
  const { saveSelectionManifest: save } = await import("./proposals/selectionManifest");
  return save(manifest);
}

/**
 * Loads a SelectionManifest from disk.
 * @deprecated Use loadSelectionManifest from proposals/selectionManifest instead
 */
export async function loadSelectionManifest(proposalSetId: string): Promise<SelectionManifest | null> {
  const { loadSelectionManifest: load } = await import("./proposals/selectionManifest");
  return load(proposalSetId);
}

/**
 * Copies evidence files to the evidence directory.
 */
export async function copyEvidence(
  proposalSetId: string,
  sourcePaths: string[]
): Promise<string[]> {
  await ensureDirectories();
  const evidenceDir = getEvidencePath(proposalSetId);
  await fs.mkdir(evidenceDir, { recursive: true });

  const copiedPaths: string[] = [];

  for (const sourcePath of sourcePaths) {
    if (existsSync(sourcePath)) {
      const fileName = path.basename(sourcePath);
      const destPath = path.join(evidenceDir, fileName);
      await fs.copyFile(sourcePath, destPath);
      copiedPaths.push(destPath);
    }
  }

  return copiedPaths;
}

/**
 * Archives a proposal set and its associated data.
 */
export async function archiveProposal(
  proposalSet: ProposalSet,
  selectionManifest: SelectionManifest,
  applySummary: ApplySummary
): Promise<string> {
  await ensureDirectories();

  const archived: ArchivedProposal = {
    proposalSet,
    selectionManifest,
    applySummary,
    archivedAt: new Date().toISOString(),
  };

  const archivePath = getArchivePath(proposalSet.id);
  await fs.writeFile(archivePath, JSON.stringify(archived, null, 2), "utf-8");

  // Remove active proposal and selection manifest files
  const proposalPath = getProposalSetPath(proposalSet.id);
  const manifestPath = getSelectionManifestPath(proposalSet.id);

  if (existsSync(proposalPath)) {
    await fs.unlink(proposalPath);
  }
  if (existsSync(manifestPath)) {
    await fs.unlink(manifestPath);
  }

  return archivePath;
}

/**
 * Lists all active proposal sets.
 */
export async function listActiveProposals(): Promise<string[]> {
  await ensureDirectories();
  
  if (!existsSync(ACTIVE_DIR)) {
    return [];
  }

  const files = await fs.readdir(ACTIVE_DIR);
  return files
    .filter((f) => f.endsWith(".proposal.json"))
    .map((f) => f.replace(".proposal.json", ""));
}

/**
 * Lists all archived proposals.
 */
export async function listArchivedProposals(): Promise<string[]> {
  await ensureDirectories();
  
  if (!existsSync(ARCHIVE_DIR)) {
    return [];
  }

  const files = await fs.readdir(ARCHIVE_DIR);
  return files
    .filter((f) => f.endsWith(".archive.json"))
    .map((f) => f.replace(".archive.json", ""));
}

/**
 * Loads an archived proposal.
 */
export async function loadArchivedProposal(proposalSetId: string): Promise<ArchivedProposal | null> {
  const archivePath = getArchivePath(proposalSetId);
  if (!existsSync(archivePath)) {
    return null;
  }
  const content = await fs.readFile(archivePath, "utf-8");
  return JSON.parse(content) as ArchivedProposal;
}

/**
 * Gets the most recent active proposal ID.
 */
export async function getMostRecentProposalId(): Promise<string | null> {
  const ids = await listActiveProposals();
  if (ids.length === 0) {
    return null;
  }

  // Load all proposals to find the most recent
  let mostRecent: { id: string; date: Date } | null = null;

  for (const id of ids) {
    const proposal = await loadProposalSet(id);
    if (proposal) {
      const date = new Date(proposal.createdAt);
      if (!mostRecent || date > mostRecent.date) {
        mostRecent = { id, date };
      }
    }
  }

  return mostRecent?.id || null;
}

/**
 * Clears all active proposals (for testing/reset).
 */
export async function clearActiveProposals(): Promise<void> {
  if (existsSync(ACTIVE_DIR)) {
    const files = await fs.readdir(ACTIVE_DIR);
    for (const file of files) {
      await fs.unlink(path.join(ACTIVE_DIR, file));
    }
  }
}

/**
 * Checks if a proposal exists.
 */
export function proposalExists(proposalSetId: string): boolean {
  return existsSync(getProposalSetPath(proposalSetId));
}

/**
 * Checks if a selection manifest exists.
 */
export function selectionManifestExists(proposalSetId: string): boolean {
  return existsSync(getSelectionManifestPath(proposalSetId));
}

/**
 * Review outcome marker (lightweight, informational only).
 * Indicates that a proposal was reviewed but had no actionable items.
 */
export interface ReviewOutcome {
  proposalSetId: string;
  reviewedAt: string;
  hasActionableItems: boolean;
}

/**
 * Saves a review outcome marker to disk.
 */
export async function saveReviewOutcome(outcome: ReviewOutcome): Promise<string> {
  await ensureDirectories();
  const filePath = getReviewOutcomePath(outcome.proposalSetId);
  await fs.writeFile(filePath, JSON.stringify(outcome, null, 2), "utf-8");
  return filePath;
}

/**
 * Loads a review outcome marker from disk.
 */
export async function loadReviewOutcome(proposalSetId: string): Promise<ReviewOutcome | null> {
  const filePath = getReviewOutcomePath(proposalSetId);
  if (!existsSync(filePath)) {
    return null;
  }
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as ReviewOutcome;
}

/**
 * Checks if a review outcome marker exists.
 */
export function reviewOutcomeExists(proposalSetId: string): boolean {
  return existsSync(getReviewOutcomePath(proposalSetId));
}
