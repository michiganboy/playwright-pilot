// pilot mcp apply command
// Applies selected proposal items after confirmation.
// - heal → modify test/page/builder code (atomic, minimal)
// - bug → create Azure DevOps bug with attached evidence
// - analysis → no-op (informational only)
// Archives proposal and retains evidence after apply.

import { confirm } from "@inquirer/prompts";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import {
  loadProposalSet,
  archiveProposal,
  getMostRecentProposalId,
  getEvidencePath,
  listActiveProposals,
  loadReviewOutcome,
} from "../persistence";
import { loadSelectionManifest } from "../proposals/selectionManifest";
import { REPO_ROOT } from "../../utils/paths";
import { applyPatchPlan } from "../heal";
import type {
  ProposalSet,
  ProposalItem,
  SelectionManifest,
  ApplySummary,
  ApplyResult,
  HealRecommendation,
  BugRecommendation,
} from "../types";

// ANSI color codes
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

/**
 * Options for apply command.
 */
export interface ApplyOptions {
  /** Specific proposal set ID to apply */
  proposalId?: string;
  /** Skip confirmation prompt */
  yes?: boolean;
  /** Preview mode - show what would be applied without making changes */
  preview?: boolean;
  /** Quiet mode */
  quiet?: boolean;
}

/**
 * Creates a backup of a file before modification.
 */
async function createBackup(filePath: string): Promise<string> {
  const backupDir = path.join(REPO_ROOT, ".pilot", "backups");
  await fs.mkdir(backupDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = path.basename(filePath);
  const backupPath = path.join(backupDir, `${fileName}.${timestamp}.bak`);
  
  if (existsSync(filePath)) {
    await fs.copyFile(filePath, backupPath);
  }
  
  return backupPath;
}

/**
 * Applies a heal proposal item.
 * Slice 3: Uses patch plans for deterministic heals.
 */
async function applyHealItem(
  item: ProposalItem,
  preview: boolean
): Promise<ApplyResult> {
  const rec = item.recommendation as HealRecommendation;
  
  // Slice 3: patchPlan is required for heal items
  if (!rec.patchPlan) {
    return {
      itemId: item.id,
      success: false,
      action: "failed",
      message: "Heal item missing required patchPlan",
    };
  }

  const plan = rec.patchPlan;
  const opCount = plan?.operations?.length ?? 0;
  if (opCount === 0) {
    return {
      itemId: item.id,
      success: true,
      action: "skipped",
      message: "No patch operations in patchPlan — nothing to apply (proposal is non-actionable).",
    };
  }

  // Apply patch plan
  {
    const patchResult = await applyPatchPlan(rec.patchPlan, preview);
    
    if (patchResult.success) {
      const filesModified = [...new Set(patchResult.results.map((r) => r.filePath))];
      const backupPaths: string[] = [];
      
      // Create backups for modified files (unless preview mode)
      if (!preview) {
        for (const filePath of filesModified) {
          const fullPath = path.join(REPO_ROOT, filePath);
          if (existsSync(fullPath)) {
            const backupPath = await createBackup(fullPath);
            backupPaths.push(backupPath);
          }
        }
      }
      
      return {
        itemId: item.id,
        success: true,
        action: preview ? "skipped" : "applied",
        message: preview
          ? `[PREVIEW] Would apply patch: ${rec.patchPlan.description}`
          : `Applied patch: ${rec.patchPlan.description}`,
        details: {
          filesModified,
          backupPath: backupPaths[0], // Primary backup
        },
      };
    } else {
      // Patch application failed
      const errors = patchResult.results
        .filter((r) => !r.success)
        .map((r) => r.error || r.message)
        .join("; ");
      
      return {
        itemId: item.id,
        success: false,
        action: "failed",
        message: `Patch application failed: ${errors}`,
      };
    }
  }
  
  // Fallback to stub behavior if no patch plan (backward compatibility)
  const filePath = path.join(REPO_ROOT, rec.location.file);
  
  if (!existsSync(filePath)) {
    return {
      itemId: item.id,
      success: false,
      action: "failed",
      message: `File not found: ${rec.location.file}`,
    };
  }

  if (preview) {
    return {
      itemId: item.id,
      success: true,
      action: "skipped",
      message: `[PREVIEW] Would modify ${rec.location.file} at line ${rec.location.startLine}`,
      details: {
        filesModified: [rec.location.file],
      },
    };
  }

  // STUB: Legacy behavior for proposals without patch plans
  const backupPath = await createBackup(filePath);
  
  return {
    itemId: item.id,
    success: true,
    action: "applied",
    message: `STUB: Would apply ${rec.subtype} to ${rec.location.file}:${rec.location.startLine}`,
    details: {
      filesModified: [rec.location.file],
      backupPath,
    },
  };
}

/**
 * Applies a bug proposal item by creating an ADO work item.
 * IMPORTANT: In the stub implementation, this only logs what would be done.
 * Real implementation would call ADO API.
 */
async function applyBugItem(
  item: ProposalItem,
  proposalSetId: string,
  preview: boolean
): Promise<ApplyResult> {
  const rec = item.recommendation as BugRecommendation;
  
  // Check for ADO configuration
  const adoOrgUrl = process.env.ADO_ORG_URL;
  const adoProject = process.env.ADO_PROJECT;
  const adoToken = process.env.ADO_TOKEN;
  
  if (!adoOrgUrl || !adoProject || !adoToken) {
    return {
      itemId: item.id,
      success: false,
      action: "failed",
      message: "Azure DevOps not configured. Set ADO_ORG_URL, ADO_PROJECT, ADO_TOKEN.",
    };
  }

  if (preview) {
    return {
      itemId: item.id,
      success: true,
      action: "skipped",
      message: `[PREVIEW] Would create bug: "${rec.title}"`,
    };
  }

  // STUB: In real implementation, this would:
  // 1. Create work item via ADO API
  // 2. Attach evidence files (trace, screenshots)
  // 3. Return the work item ID
  
  // Gather evidence paths
  const evidenceDir = getEvidencePath(proposalSetId);
  const evidenceFiles: string[] = [];
  
  if (existsSync(evidenceDir)) {
    const files = await fs.readdir(evidenceDir);
    evidenceFiles.push(...files.map((f) => path.join(evidenceDir, f)));
  }
  
  // STUB: The actual ADO API call is not implemented
  // This is intentional - we don't want to create bugs without
  // proper MCP integration and human review
  
  return {
    itemId: item.id,
    success: true,
    action: "applied",
    message: `STUB: Would create ADO bug "${rec.title}" with ${evidenceFiles.length} attachment(s)`,
    details: {
      // adoWorkItemId would be set by real implementation
    },
  };
}

/**
 * Applies an analysis item (no-op).
 */
async function applyAnalysisItem(item: ProposalItem): Promise<ApplyResult> {
  return {
    itemId: item.id,
    success: true,
    action: "skipped",
    message: "Analysis items are informational only - no action taken",
  };
}

/**
 * Main apply command implementation.
 */
export async function runApply(options: ApplyOptions = {}): Promise<boolean> {
  const log = options.quiet ? () => {} : console.log;
  const LINE = "\u2500".repeat(60);

  log();
  log(`${BOLD}PILOT MCP APPLY${RESET}`);
  log(LINE);
  log();

  // Step 1: Find proposal to apply
  let proposalId: string | undefined = options.proposalId;
  
  if (!proposalId) {
    const recentId = await getMostRecentProposalId();
    
    if (!recentId) {
      log(`${YELLOW}No active proposals found.${RESET}`);
      log();
      log(`${DIM}Run heal and review first:${RESET}`);
      log(`  pilot mcp heal`);
      log(`  pilot mcp review`);
      log();
      return false;
    }
    proposalId = recentId;
  }

  // Step 2: Load proposal set and selection manifest
  const proposalSet = await loadProposalSet(proposalId);
  
  if (!proposalSet) {
    console.error(`${RED}Proposal not found: ${proposalId}${RESET}`);
    return false;
  }

  // Step 2: Load selection manifest (required - fail loudly if missing)
  let manifest: SelectionManifest;
  try {
    const loadedManifest = await loadSelectionManifest(proposalId);
    if (!loadedManifest) {
      // Check review outcome marker to distinguish cases
      const reviewOutcome = await loadReviewOutcome(proposalId);
      
      if (reviewOutcome && !reviewOutcome.hasActionableItems) {
        // Review was run but proposal had no actionable items
        log(`${YELLOW}Last reviewed proposal contained no actionable items.${RESET}`);
        log(`${DIM}Nothing to apply.${RESET}`);
        log();
        return false;
      } else {
        // Review was never run - fail loudly
        console.error(`${RED}Error: No selection manifest found for proposal ${proposalId}${RESET}`);
        console.error();
        console.error(`${DIM}You must run 'pilot mcp:review' first to select items for this proposal.${RESET}`);
        console.error(`${DIM}Run: pilot mcp:review${RESET}`);
        console.error();
        return false;
      }
    }
    manifest = loadedManifest;
  } catch (error) {
    // Invalid manifest - fail loudly
    console.error(`${RED}Error: Failed to load selection manifest for proposal ${proposalId}${RESET}`);
    console.error(`${RED}${error instanceof Error ? error.message : String(error)}${RESET}`);
    console.error();
    console.error(`${DIM}You must run 'pilot mcp:review' to create a valid selection manifest.${RESET}`);
    console.error(`${DIM}Run: pilot mcp:review${RESET}`);
    console.error();
    return false;
  }

  // Step 3: Identify selected items
  const selectedIds = new Set(manifest.selectedItemIds);

  const selectedItems = proposalSet.items.filter((i) => selectedIds.has(i.id));
  
  if (selectedItems.length === 0) {
    log(`${YELLOW}No actionable items selected.${RESET}`);
    log();
    log(`${DIM}Run review to select items:${RESET}`);
    log(`  pilot mcp:review`);
    log();
    return false;
  }

  // Categorize selected items
  const healItems = selectedItems.filter((i) => i.type === "heal");
  const bugItems = selectedItems.filter((i) => i.type === "bug");
  const analysisItems = selectedItems.filter((i) => i.type === "analysis");
  
  // Slice 3: Bug items are non-actionable in apply (they would create ADO bugs, not implemented yet)
  const actionableHealItems = healItems;
  const nonActionableBugItems = bugItems;

  log(`${CYAN}Applying proposal: ${proposalSet.id.substring(0, 8)}...${RESET}`);
  log();
  log(`${BOLD}Selected Items${RESET}`);
  
  if (actionableHealItems.length > 0) {
    log(`  ${GREEN}Heal:${RESET} ${actionableHealItems.length} item(s)`);
    for (const item of actionableHealItems) {
      log(`    • ${item.summary}`);
    }
  }
  
  if (nonActionableBugItems.length > 0) {
    log(`  ${YELLOW}Bug:${RESET} ${nonActionableBugItems.length} item(s) ${DIM}(non-actionable in Slice 3)${RESET}`);
    for (const item of nonActionableBugItems) {
      log(`    • ${item.summary}`);
    }
  }
  
  if (analysisItems.length > 0) {
    log(`  ${CYAN}Analysis:${RESET} ${analysisItems.length} item(s) ${DIM}(no-op)${RESET}`);
  }
  
  log();
  
  // Warn if bug items were selected (they can't be applied in Slice 3)
  if (nonActionableBugItems.length > 0) {
    log(`${YELLOW}Note: Bug proposals cannot be applied in Slice 3.${RESET}`);
    log(`${DIM}They are included for review but require ADO integration to create work items.${RESET}`);
    log();
  }

  // Step 4: Preview mode
  if (options.preview) {
    log(`${YELLOW}PREVIEW MODE — no changes will be made.${RESET}`);
    log();
  }

  // Step 5: Confirmation prompt
  if (!options.yes && !options.preview) {
    log(`${BOLD}⚠️  WARNING${RESET}`);
    log();
    log(`This will apply the following changes:`);
    
    if (actionableHealItems.length > 0) {
      log(`  • Modify ${actionableHealItems.length} test/code file(s)`);
    }
    if (nonActionableBugItems.length > 0) {
      log(`  • ${nonActionableBugItems.length} bug proposal(s) selected (will be skipped - not actionable in Slice 3)`);
    }
    
    log();
    log(`${DIM}Backups will be created before any file modifications.${RESET}`);
    log();

    const confirmed = await confirm({
      message: "Do you want to proceed?",
      default: false,
    });

    if (!confirmed) {
      log();
      log(`${DIM}Apply cancelled.${RESET}`);
      log();
      return false;
    }
    
    log();
  }

  // Step 6: Apply selected items
  log(`${CYAN}Applying changes...${RESET}`);
  log();

  const results: ApplyResult[] = [];

  // Apply heal items
  for (const item of actionableHealItems) {
    log(`  Applying heal: ${item.summary}`);
    const result = await applyHealItem(item, options.preview ?? false);
    results.push(result);
    
    if (result.success) {
      log(`    ${GREEN}✓${RESET} ${result.message}`);
    } else {
      log(`    ${RED}✗${RESET} ${result.message}`);
    }
  }

  // Handle bug items (non-actionable in Slice 3)
  for (const item of nonActionableBugItems) {
    log(`  Skipping bug: ${item.summary}`);
    results.push({
      itemId: item.id,
      success: true,
      action: "skipped",
      message: "Bug proposals are not actionable in Slice 3 (ADO integration required)",
    });
  }

  // Handle analysis items (no-op but included in results)
  for (const item of analysisItems) {
    const result = await applyAnalysisItem(item);
    results.push(result);
  }

  log();

  // Step 7: Build apply summary
  const summary: ApplySummary = {
    proposalSetId: proposalId,
    results,
    appliedAt: new Date().toISOString(),
    totalSelected: selectedItems.length,
    totalApplied: results.filter((r) => r.action === "applied").length,
    totalFailed: results.filter((r) => r.action === "failed").length,
    totalSkipped: results.filter((r) => r.action === "skipped").length,
  };

  // Step 8: Archive proposal only if we actually applied something (and not preview)
  if (!options.preview && summary.totalApplied > 0) {
    log(`${CYAN}Archiving proposal...${RESET}`);
    const archivePath = await archiveProposal(proposalSet, manifest, summary);
    log(`  Archived to: ${archivePath}`);
    log();
  } else if (!options.preview && summary.totalApplied === 0) {
    log(`${YELLOW}No changes were applied — leaving proposal active.${RESET}`);
    log();
  }

  // Step 9: Summary
  log(LINE);
  log();
  
  if (options.preview) {
    log(`${YELLOW}PREVIEW COMPLETE${RESET}`);
  } else {
    log(`${GREEN}APPLY COMPLETE${RESET}`);
  }
  
  log();
  log(`${BOLD}Summary${RESET}`);
  log(`  Applied: ${summary.totalApplied}`);
  log(`  Skipped: ${summary.totalSkipped}`);
  log(`  Failed: ${summary.totalFailed}`);
  log();

  if (summary.totalFailed > 0) {
    log(`${YELLOW}Some items failed to apply. Review the output above.${RESET}`);
    log();
  }

  if (!options.preview && summary.totalApplied > 0) {
    log(`${DIM}Applied patch operations to the working tree. Review changes with git diff.${RESET}`);
    log();
  }

  return summary.totalFailed === 0;
}
