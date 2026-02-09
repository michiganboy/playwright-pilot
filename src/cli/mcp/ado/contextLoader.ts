// ADO Context Loader
// Loads ADO context from in-memory store or file system
// Used by Slice 5 to enrich analysis with Azure DevOps work item context

import path from "path";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import { PILOT_DIR } from "../persistence";
import { getActiveProposal } from "../proposals/activeProposalStore";
import type { AdoContext } from "./types";

/**
 * Loads ADO context for a given test ID.
 * Checks in-memory store first, then file system.
 * Returns null if context does not exist.
 * Throws Error if file exists but is invalid.
 */
export async function loadAdoContextForTestId(testId: number): Promise<AdoContext | null> {
  // Priority 1: Check in-memory active proposal store
  const activeProposal = getActiveProposal();
  if (activeProposal?.context?.ado?.testId === testId) {
    return activeProposal.context.ado;
  }

  // Priority 2: Check file system
  const contextFile = path.join(PILOT_DIR, "context", "ado", `${testId}.json`);
  if (!existsSync(contextFile)) {
    return null;
  }

  // File exists - read and validate
  try {
    const content = await fs.readFile(contextFile, "utf-8");
    const context = JSON.parse(content) as AdoContext;

    // Minimal validation: testId and fetchedAt must be present
    if (typeof context.testId !== "number" || typeof context.fetchedAt !== "string") {
      throw new Error(`Invalid ADO context file: missing required fields (testId: ${typeof context.testId}, fetchedAt: ${typeof context.fetchedAt})`);
    }

    // Validate testId matches requested testId
    if (context.testId !== testId) {
      throw new Error(`Invalid ADO context file: testId mismatch (expected ${testId}, got ${context.testId})`);
    }

    return context;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ADO context file: ${contextFile}`);
    }
    throw error;
  }
}
