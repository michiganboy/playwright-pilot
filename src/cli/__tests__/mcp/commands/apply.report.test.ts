/**
 * Tests that apply command writes a report after completion (Slice 10).
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { runApply } from "../../../mcp/commands/apply";
import { saveProposalSet } from "../../../mcp/persistence";
import { saveSelectionManifest } from "../../../mcp/proposals/selectionManifest";
import { REPO_ROOT } from "../../../utils/paths";
import type { ProposalSet, ProposalItem, SelectionManifest } from "../../../mcp/types";

const REPORTS_DIR = path.join(REPO_ROOT, ".pilot", "reports");

jest.mock("@inquirer/prompts", () => ({
  confirm: jest.fn(),
}));

jest.mock("../../../mcp/reports/reportWriter", () => {
  const actual = jest.requireActual<typeof import("../../../mcp/reports/reportWriter")>(
    "../../../mcp/reports/reportWriter"
  );
  return {
    ...actual,
    writeApplyReport: jest.fn(),
  };
});

import { confirm } from "@inquirer/prompts";
import { writeApplyReport } from "../../../mcp/reports/reportWriter";

const reportWriterActual = jest.requireActual<typeof import("../../../mcp/reports/reportWriter")>(
  "../../../mcp/reports/reportWriter"
);

const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;
const mockWriteApplyReport = writeApplyReport as jest.MockedFunction<typeof writeApplyReport>;

function createTestProposal(
  proposalId: string,
  items: ProposalItem[],
  adoContext?: Record<string, unknown> | null
): ProposalSet {
  const p: ProposalSet = {
    id: proposalId,
    source: { testFile: "tests/example.spec.ts", testTitle: "Example test" },
    items,
    createdAt: new Date().toISOString(),
    adapterVersion: "1.0.0",
  };
  if (adoContext != null) {
    (p as ProposalSet & { context?: { ado?: unknown } }).context = { ado: adoContext } as unknown as ProposalSet["context"];
  }
  return p;
}

function createTestHealItem(itemId: string): ProposalItem {
  return {
    id: itemId,
    type: "heal",
    subtype: "selector-fix",
    summary: `Heal ${itemId}`,
    confidence: 0.9,
    evidence: { traces: [], screenshots: [], reproSteps: [], expected: "", actual: "" },
    recommendation: {
      type: "heal",
      subtype: "selector-fix",
      location: { file: "tests/example.spec.ts", startLine: 10 },
      originalCode: "old",
      proposedCode: "new",
      rationale: "Fix",
      patchPlan: { operations: [], description: "Fix", rationale: "Fix" },
    },
    createdAt: new Date().toISOString(),
  };
}

describe("apply report output", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockWriteApplyReport.mockImplementation((args: Parameters<typeof reportWriterActual.writeApplyReport>[0]) =>
      reportWriterActual.writeApplyReport(args)
    );
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  async function findReportForProposal(proposalId: string): Promise<string | null> {
    if (!existsSync(REPORTS_DIR)) return null;
    const files = await fs.readdir(REPORTS_DIR);
    const match = files.find((f) => f.endsWith(`-${proposalId}.json`));
    return match ? path.join(REPORTS_DIR, match) : null;
  }

  it("writes a report under .pilot/reports after successful apply", async () => {
    const proposalId = `apply-report-${Date.now()}`;
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("item-1"),
      createTestHealItem("item-2"),
    ]);
    await saveProposalSet(proposal);
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: ["item-1", "item-2"],
      createdAt: new Date().toISOString(),
    };
    await saveSelectionManifest(manifest);

    const result = await runApply({ proposalId, yes: true, quiet: true });

    expect(result).toBe(true);
    const reportPath = await findReportForProposal(proposalId);
    expect(reportPath).not.toBeNull();
    expect(existsSync(reportPath!)).toBe(true);
  });

  it("report contains proposalId, selectionManifest.selectedItemIds, and applySummary", async () => {
    const proposalId = `apply-report-content-${Date.now()}`;
    const proposal = createTestProposal(proposalId, [
      createTestHealItem("a"),
      createTestHealItem("b"),
    ]);
    await saveProposalSet(proposal);
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: ["a", "b"],
      createdAt: new Date().toISOString(),
    };
    await saveSelectionManifest(manifest);

    await runApply({ proposalId, yes: true, quiet: true });

    const reportPath = await findReportForProposal(proposalId);
    expect(reportPath).not.toBeNull();
    const content = await fs.readFile(reportPath!, "utf-8");
    const report = JSON.parse(content);
    expect(report.proposalId).toBe(proposalId);
    expect(report.selectionManifest.selectedItemIds).toEqual(["a", "b"]);
    expect(report.applySummary).toBeDefined();
    expect(report.applySummary.proposalSetId).toBe(proposalId);
    expect(report.applySummary.results).toBeDefined();
    expect(Array.isArray(report.applySummary.results)).toBe(true);
  });

  it("report includes adoContext when proposalSet has context.ado", async () => {
    const proposalId = `apply-report-ado-${Date.now()}`;
    const adoContext = {
      testId: 10002,
      testCase: { id: 10002, url: "https://ado/test", title: "Test case", type: "Test Case" },
      parent: null,
      fetchedAt: new Date().toISOString(),
    };
    const proposal = createTestProposal(
      proposalId,
      [createTestHealItem("x")],
      adoContext
    );
    await saveProposalSet(proposal);
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: ["x"],
      createdAt: new Date().toISOString(),
    };
    await saveSelectionManifest(manifest);

    await runApply({ proposalId, yes: true, quiet: true });

    const reportPath = await findReportForProposal(proposalId);
    expect(reportPath).not.toBeNull();
    const content = await fs.readFile(reportPath!, "utf-8");
    const report = JSON.parse(content);
    expect(report.adoContext).not.toBeNull();
    expect(report.adoContext.testId).toBe(10002);
    expect(report.adoContext.testCase.title).toBe("Test case");
  });

  it("returns false and logs error when report write fails", async () => {
    const proposalId = `apply-report-fail-${Date.now()}`;
    const proposal = createTestProposal(proposalId, [createTestHealItem("z")]);
    await saveProposalSet(proposal);
    const manifest: SelectionManifest = {
      proposalId,
      selectedItemIds: ["z"],
      createdAt: new Date().toISOString(),
    };
    await saveSelectionManifest(manifest);

    mockWriteApplyReport.mockRejectedValueOnce(new Error("disk full"));

    const result = await runApply({ proposalId, yes: true, quiet: true });

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to write apply report"));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
  });
});
