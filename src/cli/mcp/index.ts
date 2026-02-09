// MCP Integration Module
// Model Context Protocol integration for read-only test failure analysis.
//
// IMPORTANT RULES:
// - MCP is READ-ONLY and REASONING-ONLY
// - MCP NEVER mutates repo files, test code, test data, or Azure DevOps
// - MCP ONLY returns structured proposal objects
// - All mutations are executed ONLY by Pilot CLI after explicit human approval
// - No autonomous behavior, no background automation

// Types
export * from "./types";

// Adapter
export { analyzeFailure, classifyFailure, validateProposalSet, MCP_ADAPTER_VERSION } from "./adapter";

// Persistence
export {
  saveProposalSet,
  loadProposalSet,
  saveSelectionManifest,
  loadSelectionManifest,
  archiveProposal,
  listActiveProposals,
  listArchivedProposals,
  getMostRecentProposalId,
  copyEvidence,
  PILOT_DIR,
  PROPOSALS_DIR,
  ACTIVE_DIR,
  ARCHIVE_DIR,
  EVIDENCE_DIR,
} from "./persistence";

// Commands
export { runHeal, type HealOptions } from "./commands/heal";
export { runSync } from "./commands/sync";

// Lazy-loaded commands (depend on ESM-only @inquirer/prompts)
// Use dynamic imports to avoid loading ESM in Jest/CommonJS contexts
export async function runReview(opts: import("./commands/review").ReviewOptions): Promise<boolean> {
  const mod = await import("./commands/review");
  return mod.runReview(opts);
}

export async function runApply(opts: import("./commands/apply").ApplyOptions): Promise<boolean> {
  const mod = await import("./commands/apply");
  return mod.runApply(opts);
}

// Export types (type-only exports don't cause runtime imports)
export type { ReviewOptions } from "./commands/review";
export type { ApplyOptions } from "./commands/apply";

// Active proposal store
export { setActiveProposal, getActiveProposal, clearActiveProposal } from "./proposals/activeProposalStore";