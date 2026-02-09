// pilot mcp sync command
// Syncs test case context from Azure DevOps
// Fetches test case work item and parent (User Story/PBI) with acceptance criteria

import path from "path";
import { promises as fs } from "fs";
import { existsSync, statSync } from "fs";
import { glob } from "fast-glob";
import { getAdoConfig, getWorkItems } from "../ado/client";
import type { WorkItem, AdoContext } from "../ado/types";
import { ACTIVE_DIR, PILOT_DIR } from "../persistence";
import { loadProposalSet } from "../persistence";
import type { ProposalSet } from "../types";
import { setActiveProposal } from "../proposals/activeProposalStore";

// ANSI color codes
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

function log(message: string = ""): void {
  console.log(message);
}

/**
 * Finds the newest active proposal by modification time.
 */
async function findNewestActiveProposal(): Promise<string | null> {
  const proposalFiles = await glob("*.proposal.json", {
    cwd: ACTIVE_DIR,
    absolute: true,
  });

  if (proposalFiles.length === 0) {
    return null;
  }

  // Sort by mtime, newest first
  const filesWithStats = await Promise.all(
    proposalFiles.map(async (file) => ({
      file,
      mtime: statSync(file).mtime,
    }))
  );

  filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return filesWithStats[0].file;
}

/**
 * Extracts test ID from proposal.
 * Tries proposal.source.runId first, then parses from testTitle.
 */
function extractTestId(proposal: ProposalSet): number | null {
  // Try runId first (preferred)
  if (proposal.source.runId) {
    const runIdMatch = proposal.source.runId.match(/\[(\d+)\]/);
    if (runIdMatch) {
      return parseInt(runIdMatch[1], 10);
    }
    // If runId is just a number
    const numId = parseInt(proposal.source.runId, 10);
    if (!isNaN(numId)) {
      return numId;
    }
  }

  // Fallback: parse from testTitle
  if (proposal.source.testTitle) {
    const titleMatch = proposal.source.testTitle.match(/\[(\d+)\]/);
    if (titleMatch) {
      return parseInt(titleMatch[1], 10);
    }
  }

  return null;
}

/**
 * Finds parent work item ID from test case relations.
 * Prefers User Story or Product Backlog Item types.
 */
async function findParentId(testCase: WorkItem): Promise<number | null> {
  if (!testCase.relations || testCase.relations.length === 0) {
    return null;
  }

  // Find reverse hierarchy links (parent links)
  const parentLinks = testCase.relations.filter(
    (rel) => rel.rel === "System.LinkTypes.Hierarchy-Reverse"
  );

  if (parentLinks.length === 0) {
    return null;
  }

  // Extract IDs from URLs
  const parentIds: number[] = [];
  for (const link of parentLinks) {
    // URL format: https://dev.azure.com/org/project/_apis/wit/workitems/12345
    const idMatch = link.url.match(/workitems\/(\d+)/);
    if (idMatch) {
      parentIds.push(parseInt(idMatch[1], 10));
    }
  }

  if (parentIds.length === 0) {
    return null;
  }

  // If multiple parents, fetch them to find User Story or PBI
  if (parentIds.length > 1) {
    const parents = await getWorkItems(parentIds, false);
    for (const parent of parents) {
      const workItemType = parent.fields["System.WorkItemType"];
      if (workItemType === "User Story" || workItemType === "Product Backlog Item") {
        return parent.id;
      }
    }
    // If no User Story/PBI found, return first parent
    return parentIds[0];
  }

  return parentIds[0];
}

/**
 * Extracts acceptance criteria from parent work item.
 * Tries Microsoft.VSTS.Common.AcceptanceCriteria first, then System.Description.
 */
function extractAcceptanceCriteria(parent: WorkItem): string | null {
  // Prefer Acceptance Criteria field
  const acceptanceCriteria = parent.fields["Microsoft.VSTS.Common.AcceptanceCriteria"];
  if (acceptanceCriteria && typeof acceptanceCriteria === "string" && acceptanceCriteria.trim()) {
    return acceptanceCriteria.trim();
  }

  // Fallback to Description
  const description = parent.fields["System.Description"];
  if (description && typeof description === "string" && description.trim()) {
    return description.trim();
  }

  return null;
}

/**
 * Writes ADO context to file atomically.
 */
async function writeContextFile(testId: number, context: AdoContext): Promise<void> {
  const contextDir = path.join(PILOT_DIR, "context", "ado");
  await fs.mkdir(contextDir, { recursive: true });

  const contextFile = path.join(contextDir, `${testId}.json`);
  const tempFile = `${contextFile}.tmp`;

  const content = JSON.stringify(context, null, 2);
  await fs.writeFile(tempFile, content, "utf-8");
  await fs.rename(tempFile, contextFile);
}

/**
 * Enriches proposal with ADO context in-memory.
 * This is a pure function for testability.
 */
export function enrichProposalWithAdoContext(proposal: ProposalSet, adoContext: AdoContext): void {
  proposal.context = proposal.context || {};
  proposal.context.ado = adoContext;
}

/**
 * Runs the ADO sync command.
 */
export async function runSync(): Promise<boolean> {
  try {
    // Validate ADO configuration
    log(`${CYAN}Validating ADO configuration...${RESET}`);
    try {
      getAdoConfig();
    } catch (error) {
      log(`${RED}Error: ${error instanceof Error ? error.message : String(error)}${RESET}`);
      log();
      log(`${DIM}Required environment variables:`);
      log(`${DIM}  PILOT_ADO_ORG_URL - Azure DevOps organization URL${RESET}`);
      log(`${DIM}  PILOT_ADO_PROJECT - Project name${RESET}`);
      log(`${DIM}  PILOT_ADO_PAT - Personal Access Token${RESET}`);
      log();
      return false;
    }
    log(`  Configuration valid`);
    log();

    // Find newest active proposal
    log(`${CYAN}Finding newest active proposal...${RESET}`);
    const proposalFilePath = await findNewestActiveProposal();
    if (!proposalFilePath) {
      log(`${RED}Error: No active proposals found${RESET}`);
      log();
      return false;
    }
    log(`  Found: ${path.basename(proposalFilePath)}`);
    log();

    // Extract proposal ID from file path
    // File format: <ACTIVE_DIR>/<proposalId>.proposal.json
    const proposalFileName = path.basename(proposalFilePath);
    const proposalId = proposalFileName.replace(/\.proposal\.json$/, "");

    // Load proposal using the ID (loadProposalSet expects ID, not file path)
    log(`${CYAN}Loading proposal...${RESET}`);
    const proposal = await loadProposalSet(proposalId);
    if (!proposal) {
      log(`${RED}Error: Failed to load proposal ${proposalId} from ${ACTIVE_DIR}${RESET}`);
      log();
      return false;
    }
    log(`  Loaded proposal: ${proposal.id}`);
    log();

    // Extract test ID
    log(`${CYAN}Extracting test ID...${RESET}`);
    const testId = extractTestId(proposal);
    if (!testId) {
      log(`${RED}Error: Could not extract test ID from proposal${RESET}`);
      log(`${DIM}  Expected test ID in proposal.source.runId or proposal.source.testTitle${RESET}`);
      log();
      return false;
    }
    log(`  Test ID: ${testId}`);
    log();

    // Fetch test case from ADO
    log(`${CYAN}Fetching test case from Azure DevOps...${RESET}`);
    const testCases = await getWorkItems([testId], true);
    if (testCases.length === 0) {
      log(`${RED}Error: Test case ${testId} not found in Azure DevOps${RESET}`);
      log();
      return false;
    }
    const testCase = testCases[0];
    log(`  Found test case: ${testCase.id}`);
    log();

    // Find parent work item
    log(`${CYAN}Finding parent work item...${RESET}`);
    const parentId = await findParentId(testCase);
    let parent: AdoContext["parent"] = null;
    let warning: string | undefined;

    if (!parentId) {
      warning = "No parent work item relation found";
      log(`  ${YELLOW}Warning: ${warning}${RESET}`);
    } else {
      log(`  Parent ID: ${parentId}`);
      const parents = await getWorkItems([parentId], false);
      if (parents.length === 0) {
        warning = `Parent work item ${parentId} not found`;
        log(`  ${YELLOW}Warning: ${warning}${RESET}`);
      } else {
        const parentItem = parents[0];
        const workItemType = parentItem.fields["System.WorkItemType"] || "Unknown";
        const title = parentItem.fields["System.Title"] || "";
        const acceptanceCriteria = extractAcceptanceCriteria(parentItem);
        const description = parentItem.fields["System.Description"] || null;

        parent = {
          id: parentItem.id,
          type: workItemType,
          title,
          acceptanceCriteria,
          description,
          url: parentItem.url,
        };
        log(`  Parent type: ${workItemType}`);
        log(`  Parent title: ${title}`);
        if (acceptanceCriteria) {
          log(`  Acceptance criteria: ${acceptanceCriteria.substring(0, 50)}...`);
        }
      }
    }
    log();

    // Build context
    const adoContext: AdoContext = {
      testId,
      testCase: {
        id: testCase.id,
        url: testCase.url,
        fields: {
          "System.WorkItemType": testCase.fields["System.WorkItemType"],
          "System.Title": testCase.fields["System.Title"],
          "System.State": testCase.fields["System.State"],
        },
        relations: testCase.relations,
      },
      parent,
      fetchedAt: new Date().toISOString(),
    };

    if (warning) {
      adoContext.warning = warning;
    }

    // Write context file
    log(`${CYAN}Writing context file...${RESET}`);
    await writeContextFile(testId, adoContext);
    log(`  ${GREEN}Context saved: .pilot/context/ado/${testId}.json${RESET}`);
    log();

    // Attach context to proposal in-memory (not persisted)
    enrichProposalWithAdoContext(proposal, adoContext);

    // Store enriched proposal in process-wide store
    setActiveProposal(proposal);

    return true;
  } catch (error) {
    log();
    log(`${RED}Error: ${error instanceof Error ? error.message : String(error)}${RESET}`);
    log();
    return false;
  }
}
