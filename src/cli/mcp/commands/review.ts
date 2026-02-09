// pilot mcp review command
// Interactive TUI for reviewing and selecting proposal items.
// Selection = approval for apply phase.
// Persists SelectionManifest.

import { checkbox, confirm, select } from "@inquirer/prompts";
import {
  listActiveProposals,
  loadProposalSet,
  getMostRecentProposalId,
  saveReviewOutcome,
} from "../persistence";
import {
  loadSelectionManifest,
  saveSelectionManifest,
} from "../proposals/selectionManifest";
import type {
  ProposalSet,
  ProposalItem,
  SelectionManifest,
  HealRecommendation,
  BugRecommendation,
  AnalysisRecommendation,
} from "../types";
import { loadAdoContextForTestId } from "../ado/contextLoader";

// ANSI color codes
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const UNDERLINE = "\x1b[4m";

/**
 * Options for review command.
 */
export interface ReviewOptions {
  /** Specific proposal set ID to review */
  proposalId?: string;
  /** Use newest active proposal */
  latest?: boolean;
  /** Print proposal + selection as JSON to stdout (no prompts) */
  json?: boolean;
  /** Non-interactive mode - select all */
  all?: boolean;
  /** Non-interactive mode - select none */
  none?: boolean;
  /** Quiet mode */
  quiet?: boolean;
}

/**
 * Formats a proposal item for display.
 */
function formatProposalItem(item: ProposalItem): string {
  const typeColors: Record<string, string> = {
    heal: GREEN,
    bug: YELLOW,
    analysis: CYAN,
  };
  const color = typeColors[item.type] || RESET;
  const confidence = `${(item.confidence * 100).toFixed(0)}%`;
  
  return `${color}[${item.type.toUpperCase()}]${RESET} ${item.summary} ${DIM}(${confidence})${RESET}`;
}

/**
 * Displays detailed information about a proposal item.
 */
function displayItemDetails(item: ProposalItem): void {
  const LINE = "\u2500".repeat(50);
  
  console.log();
  console.log(LINE);
  console.log(`${BOLD}${item.summary}${RESET}`);
  console.log(LINE);
  console.log();
  
  console.log(`${UNDERLINE}Type${RESET}: ${item.type} (${item.subtype})`);
  console.log(`${UNDERLINE}Confidence${RESET}: ${(item.confidence * 100).toFixed(0)}%`);
  console.log(`${UNDERLINE}ID${RESET}: ${item.id}`);
  console.log();
  
  // Display recommendation details based on type
  const rec = item.recommendation;
  
  if (rec.type === "heal") {
    const healRec = rec as HealRecommendation;
    console.log(`${UNDERLINE}Location${RESET}:`);
    console.log(`  File: ${healRec.location.file}`);
    console.log(`  Line: ${healRec.location.startLine}${healRec.location.endLine ? `-${healRec.location.endLine}` : ""}`);
    console.log();
    console.log(`${UNDERLINE}Rationale${RESET}:`);
    console.log(`  ${healRec.rationale}`);
    console.log();
    if (healRec.originalCode) {
      console.log(`${UNDERLINE}Original Code${RESET}:`);
      console.log(`${DIM}${healRec.originalCode}${RESET}`);
      console.log();
    }
    if (healRec.proposedCode) {
      console.log(`${UNDERLINE}Proposed Code${RESET}:`);
      console.log(`${GREEN}${healRec.proposedCode}${RESET}`);
      console.log();
    }
  } else if (rec.type === "bug") {
    const bugRec = rec as BugRecommendation;
    console.log(`${UNDERLINE}Bug Title${RESET}: ${bugRec.title}`);
    console.log(`${UNDERLINE}Severity${RESET}: ${bugRec.severity}`);
    console.log(`${UNDERLINE}Priority${RESET}: ${bugRec.priority}`);
    console.log();
    console.log(`${UNDERLINE}Description${RESET}:`);
    console.log(bugRec.description);
    console.log();
    console.log(`${UNDERLINE}Expected${RESET}: ${bugRec.expectedBehavior}`);
    console.log(`${UNDERLINE}Actual${RESET}: ${bugRec.actualBehavior}`);
    console.log();
  } else if (rec.type === "analysis") {
    const analysisRec = rec as AnalysisRecommendation;
    console.log(`${UNDERLINE}Summary${RESET}:`);
    console.log(`  ${analysisRec.summary}`);
    console.log();
    console.log(`${UNDERLINE}Details${RESET}:`);
    console.log(analysisRec.details);
    console.log();
  }
  
  // Display evidence summary
  const evidence = item.evidence;
  console.log(`${UNDERLINE}Evidence${RESET}:`);
  console.log(`  Traces: ${evidence.traces.length}`);
  console.log(`  Screenshots: ${evidence.screenshots.length}`);
  console.log(`  Repro Steps: ${evidence.reproSteps.length}`);
  if (evidence.network?.length) {
    console.log(`  Network Evidence: ${evidence.network.length} request(s)`);
  }
  if (evidence.console?.length) {
    console.log(`  Console Output: ${evidence.console.length} message(s)`);
  }
  console.log();
  console.log(LINE);
}

/**
 * Interactive review of a single proposal item.
 */
async function reviewItemInteractively(
  item: ProposalItem,
  currentlySelected: boolean
): Promise<boolean> {
  displayItemDetails(item);
  
  const action = await select({
    message: "What would you like to do?",
    choices: [
      {
        name: currentlySelected ? "Keep selected" : "Select for apply",
        value: "select",
      },
      {
        name: currentlySelected ? "Deselect" : "Skip (don't apply)",
        value: "deselect",
      },
      {
        name: "Back to list",
        value: "back",
      },
    ],
  });

  if (action === "back") {
    return currentlySelected;
  }
  
  return action === "select";
}

/**
 * Main review command implementation.
 */
export async function runReview(options: ReviewOptions = {}): Promise<boolean> {
  const isJson = !!options.json;
  const log = options.quiet || isJson ? () => {} : console.log;
  const LINE = "\u2500".repeat(60);

  if (!options.quiet && !isJson) {
    log();
    log(`${BOLD}PILOT MCP REVIEW${RESET}`);
    log(LINE);
    log();
  }

  // Step 1: Resolve proposal ID
  let proposalId = options.proposalId;

  if (!proposalId) {
    if (options.latest) {
      proposalId = (await getMostRecentProposalId()) ?? undefined;
    }
    if (!proposalId) {
      const activeIds = await listActiveProposals();
      if (activeIds.length === 0) {
        if (isJson) {
          console.log(JSON.stringify({ error: "No active proposals found" }));
          return false;
        }
        log(`${YELLOW}No active proposals found.${RESET}`);
        log();
        log(`${DIM}Run heal first to generate proposals:${RESET}`);
        log(`  pilot mcp heal`);
        log();
        return false;
      }
      if (activeIds.length === 1) {
        proposalId = activeIds[0];
      } else {
        // Interactive: let user select which proposal to review
        const proposals: Array<{ id: string; createdAt: string; itemCount: number }> = [];
        for (const id of activeIds) {
          const p = await loadProposalSet(id);
          if (p) {
            proposals.push({
              id: p.id,
              createdAt: p.createdAt,
              itemCount: p.items.length,
            });
          }
        }
        proposals.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });
        const defaultId = proposals[0]?.id;
        const totalCount = proposals.length;
        const selected = await select({
          message: `Select proposal to review (${totalCount} total):`,
          choices: proposals.map((p, idx) => ({
            name: `[${idx + 1}/${totalCount}] ${p.id.substring(0, 8)}... (${p.itemCount} items, ${new Date(p.createdAt).toLocaleString()})`,
            value: p.id,
          })),
          default: defaultId,
          loop: false,
        });
        proposalId = selected;
      }
    }
  }

  // Step 2: Load proposal set
  const proposalSet = await loadProposalSet(proposalId);

  if (!proposalSet) {
    if (isJson) {
      console.log(JSON.stringify({ error: `Proposal not found: ${proposalId}` }));
      return false;
    }
    console.error(`${RED}Proposal not found: ${proposalId}${RESET}`);
    return false;
  }

  // JSON mode: never prompt; print machine-readable output only
  if (isJson) {
    let manifest: SelectionManifest | null = null;
    try {
      manifest = await loadSelectionManifest(proposalId);
    } catch {
      manifest = null;
    }
    const selectedItemIds =
      manifest?.selectedItemIds && Array.isArray(manifest.selectedItemIds)
        ? manifest.selectedItemIds
        : proposalSet.items.map((i) => i.id);
    const selectedSet = new Set(selectedItemIds);
    const selectedItems = proposalSet.items.filter((i) => selectedSet.has(i.id));
    console.log(
      JSON.stringify(
        {
          proposalId,
          selectedItemIds,
          selectedItems,
          proposal: proposalSet,
        },
        null,
        2
      )
    );
    return true;
  }

  log(`${CYAN}Reviewing proposal: ${proposalSet.id.substring(0, 8)}...${RESET}`);
  log(`  Source: ${proposalSet.source.testFile}`);
  log(`  Test: ${proposalSet.source.testTitle}`);
  log(`  Items: ${proposalSet.items.length}`);
  
  // Display ADO Context if available (Slice 5)
  // Try to get from proposal evidence first, then try loading from file
  let adoContext = proposalSet.items.length > 0 ? proposalSet.items[0].evidence.adoContext : undefined;
  
  // If not in evidence, try loading from file based on testId
  if (!adoContext) {
    const testIdMatch = proposalSet.source.testTitle.match(/\[(\d+)\]/) || proposalSet.source.runId?.match(/\[(\d+)\]/);
    if (testIdMatch) {
      const testIdNum = parseInt(testIdMatch[1], 10);
      if (!isNaN(testIdNum)) {
        try {
          const loadedContext = await loadAdoContextForTestId(testIdNum);
          if (loadedContext) {
            // Convert AdoContext to EvidencePacket format
            adoContext = {
              testId: loadedContext.testId,
              testCase: {
                id: loadedContext.testCase.id,
                url: loadedContext.testCase.url,
                title: loadedContext.testCase.fields["System.Title"] || "",
                type: loadedContext.testCase.fields["System.WorkItemType"] || "",
              },
              parent: loadedContext.parent ? {
                id: loadedContext.parent.id,
                type: loadedContext.parent.type,
                title: loadedContext.parent.title,
                url: loadedContext.parent.url,
                acceptanceCriteria: loadedContext.parent.acceptanceCriteria,
                description: loadedContext.parent.description,
              } : null,
            };
          }
        } catch {
          // Ignore errors loading from file - not required
        }
      }
    }
  }
  
  if (adoContext) {
    log();
    log(`${UNDERLINE}ADO Context${RESET}`);
    log(`  Test ID: ${adoContext.testId}`);
    log(`  Test Case: ${adoContext.testCase.title} (${adoContext.testCase.type})`);
    log(`  Test Case URL: ${adoContext.testCase.url}`);
    if (adoContext.parent) {
      log(`  Parent: ${adoContext.parent.type} #${adoContext.parent.id} - ${adoContext.parent.title}`);
      log(`  Parent URL: ${adoContext.parent.url}`);
      const acPresent = adoContext.parent.acceptanceCriteria ? "yes" : "no";
      log(`  Acceptance Criteria: ${acPresent}`);
      if (adoContext.parent.acceptanceCriteria) {
        const acPreview = adoContext.parent.acceptanceCriteria.length > 200
          ? adoContext.parent.acceptanceCriteria.substring(0, 200) + "..."
          : adoContext.parent.acceptanceCriteria;
        log(`    ${DIM}${acPreview}${RESET}`);
      }
    } else {
      log(`  Parent: None`);
    }
  }
  
  log();

  // Step 3: Load existing selection manifest (if any)
  let existingManifest = await loadSelectionManifest(proposalId);
  const existingSelections = new Set<string>();
  
  if (existingManifest) {
    for (const itemId of existingManifest.selectedItemIds) {
      existingSelections.add(itemId);
    }
    log(`${DIM}(Found existing selection manifest)${RESET}`);
    log();
  }

  // Categorize items (needed for both interactive and non-interactive modes)
  const healItems = proposalSet.items.filter((i) => i.type === "heal");
  const bugItems = proposalSet.items.filter((i) => i.type === "bug");
  const analysisItems = proposalSet.items.filter((i) => i.type === "analysis");

  // Step 4: Handle non-interactive modes
  if (options.all || options.none) {
    // Check if there are actionable items
    const actionableItems = [...healItems, ...bugItems];
    
    if (actionableItems.length === 0) {
      log(`${YELLOW}This proposal contains no actionable items.${RESET}`);
      log(`${DIM}Nothing can be applied.${RESET}`);
      log();
      // Persist lightweight review outcome marker (not a selection manifest)
      await saveReviewOutcome({
        proposalSetId: proposalId,
        reviewedAt: new Date().toISOString(),
        hasActionableItems: false,
      });
      return true;
    }
    
    const selectedItemIds = options.all === true
      ? actionableItems.map((a) => a.id)
      : [];

    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds,
      createdAt: existingManifest?.createdAt || new Date().toISOString(),
    };

    await saveSelectionManifest(manifest);
    
    const count = options.all ? actionableItems.length : 0;
    log(`${GREEN}Selected ${count} of ${actionableItems.length} actionable items.${RESET}`);
    log();
    
    if (count > 0) {
      log(`Run \`pilot mcp:apply\` to apply selected items`);
    } else {
      log(`No actionable items selected.`);
    }
    log();
    return true;
  }

  // Step 5: Interactive review
  log(`${UNDERLINE}Proposal Items${RESET}`);
  log();
  
  if (healItems.length > 0) {
    log(`${GREEN}Heal Proposals (${healItems.length})${RESET}`);
    for (const item of healItems) {
      const selected = existingSelections.has(item.id) ? "✓" : " ";
      log(`  [${selected}] ${item.summary}`);
    }
    log();
  }
  
  if (bugItems.length > 0) {
    log(`${YELLOW}Bug Proposals (${bugItems.length})${RESET}`);
    for (const item of bugItems) {
      const selected = existingSelections.has(item.id) ? "✓" : " ";
      log(`  [${selected}] ${item.summary}`);
    }
    log();
  }
  
  if (analysisItems.length > 0) {
    log(`${CYAN}Analysis Items (${analysisItems.length})${RESET} ${DIM}(informational only)${RESET}`);
    for (const item of analysisItems) {
      log(`  • ${item.summary}`);
    }
    log();
  }

  // Interactive selection (only for heal and bug items)
  const actionableItems = [...healItems, ...bugItems];
  
  if (actionableItems.length === 0) {
    log(`${YELLOW}This proposal contains no actionable items.${RESET}`);
    log(`${DIM}Nothing can be applied.${RESET}`);
    log();
    // Persist lightweight review outcome marker (not a selection manifest)
    await saveReviewOutcome({
      proposalSetId: proposalId,
      reviewedAt: new Date().toISOString(),
      hasActionableItems: false,
    });
    return true;
  }

  const reviewMode = await select({
    message: "How would you like to review?",
    choices: [
      { name: "Quick select (checkbox list)", value: "quick" },
      { name: "Detailed review (one by one)", value: "detailed" },
      { name: "Select all", value: "all" },
      { name: "Select none", value: "none" },
      { name: "Cancel", value: "cancel" },
    ],
  });

  if (reviewMode === "cancel") {
    log(`${DIM}Review cancelled.${RESET}`);
    return false;
  }

  let selectedIds: Set<string>;

  if (reviewMode === "all") {
    selectedIds = new Set(actionableItems.map((i) => i.id));
  } else if (reviewMode === "none") {
    selectedIds = new Set();
  } else if (reviewMode === "quick") {
    // Checkbox multi-select
    const choices = actionableItems.map((item) => ({
      name: formatProposalItem(item),
      value: item.id,
      checked: existingSelections.has(item.id),
    }));

    const selected = await checkbox({
      message: "Select items to approve for apply:",
      choices,
    });

    selectedIds = new Set(selected);
  } else {
    // Detailed review
    selectedIds = new Set(
      actionableItems
        .filter((item) => existingSelections.has(item.id))
        .map((i) => i.id)
    );

    for (const item of actionableItems) {
      const currentlySelected = selectedIds.has(item.id);
      const newSelection = await reviewItemInteractively(item, currentlySelected);
      
      if (newSelection) {
        selectedIds.add(item.id);
      } else {
        selectedIds.delete(item.id);
      }
    }
  }

  // Step 6: Save selection manifest
  const selectedItemIds = Array.from(selectedIds);

  const manifest: SelectionManifest = {
    proposalId,
    selectedItemIds,
    createdAt: existingManifest?.createdAt || new Date().toISOString(),
  };

  await saveSelectionManifest(manifest);

  // Step 7: Summary
  log();
  log(LINE);
  log();
  log(`${GREEN}Selection saved.${RESET}`);
  log();
  
  const healSelected = healItems.filter((i) => selectedIds.has(i.id)).length;
  const bugSelected = bugItems.filter((i) => selectedIds.has(i.id)).length;
  
  log(`${BOLD}Selection Summary${RESET}`);
  log(`  Heal proposals: ${healSelected} of ${healItems.length} selected`);
  log(`  Bug proposals: ${bugSelected} of ${bugItems.length} selected`);
  log(`  Total: ${selectedIds.size} of ${actionableItems.length} selected`);
  log();
  
  if (selectedIds.size > 0) {
    log(`Run \`pilot mcp:apply\` to apply selected items`);
  } else {
    log(`No actionable items selected.`);
  }
  log();

  return true;
}
