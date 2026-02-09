// In-memory active proposal store
// Stores the currently active proposal with enriched context for process-wide access

import type { ProposalSet } from "../types";

let activeProposal: ProposalSet | null = null;

export function setActiveProposal(proposal: ProposalSet): void {
  activeProposal = proposal;
}

export function getActiveProposal(): ProposalSet | null {
  return activeProposal;
}

export function clearActiveProposal(): void {
  activeProposal = null;
}
