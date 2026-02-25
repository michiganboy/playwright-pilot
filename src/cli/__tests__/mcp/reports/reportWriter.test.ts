/**
 * Tests for MCP apply report writer (Slice 10).
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { getReportPath, writeApplyReport } from "../../../mcp/reports/reportWriter";
import { REPO_ROOT } from "../../../utils/paths";
import type { ProposalSet, SelectionManifest, ApplySummary } from "../../../mcp/types";

const REPORTS_DIR = path.join(REPO_ROOT, ".pilot", "reports");

function minimalProposalSet(proposalId: string): ProposalSet {
  return {
    id: proposalId,
    source: { testFile: "tests/example.spec.ts", testTitle: "Example test" },
    items: [],
    createdAt: new Date().toISOString(),
    adapterVersion: "1.0.0",
  };
}

function minimalManifest(proposalId: string): SelectionManifest {
  return {
    proposalId,
    selectedItemIds: [],
    createdAt: new Date().toISOString(),
  };
}

function minimalSummary(proposalId: string): ApplySummary {
  return {
    proposalSetId: proposalId,
    results: [],
    appliedAt: new Date().toISOString(),
    totalSelected: 0,
    totalApplied: 0,
    totalFailed: 0,
    totalSkipped: 0,
  };
}

describe("reportWriter", () => {
  describe("getReportPath", () => {
    it("returns path under .pilot/reports with timestamp and proposalId", () => {
      const proposalId = "test-proposal-123";
      const p = getReportPath(proposalId);
      expect(p).toContain(path.join(REPO_ROOT, ".pilot", "reports"));
      const base = path.basename(p);
      expect(base).toMatch(/^\d{8}-\d{6}-test-proposal-123\.json$/);
    });

    it("uses provided date for timestamp (YYYYMMDD-HHmmss local)", () => {
      const proposalId = "id";
      const d = new Date(Date.UTC(2025, 1, 25, 14, 30, 0));
      const p = getReportPath(proposalId, d);
      const base = path.basename(p);
      expect(base).toMatch(/^\d{8}-\d{6}-id\.json$/);
      expect(base.endsWith("-id.json")).toBe(true);
    });
  });

  describe("writeApplyReport", () => {
    let proposalId: string;

    beforeEach(() => {
      proposalId = `report-test-${Date.now()}`;
    });

    afterEach(async () => {
      const reportPath = getReportPath(proposalId);
      if (existsSync(reportPath)) {
        await fs.unlink(reportPath).catch(() => {});
      }
    });

    it("writes file atomically (temp then rename, temp gone)", async () => {
      const proposalSet = minimalProposalSet(proposalId);
      const manifest = minimalManifest(proposalId);
      const summary = minimalSummary(proposalId);
      const writtenPath = await writeApplyReport({
        proposalSet,
        selectionManifest: manifest,
        applySummary: summary,
      });
      expect(existsSync(writtenPath)).toBe(true);
      expect(existsSync(`${writtenPath}.tmp`)).toBe(false);
    });

    it("writes JSON with required top-level keys", async () => {
      const proposalSet = minimalProposalSet(proposalId);
      const manifest = minimalManifest(proposalId);
      const summary = minimalSummary(proposalId);
      const writtenPath = await writeApplyReport({
        proposalSet,
        selectionManifest: manifest,
        applySummary: summary,
      });
      const content = await fs.readFile(writtenPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty("proposalId", proposalId);
      expect(parsed).toHaveProperty("writtenAt");
      expect(parsed).toHaveProperty("proposalSet");
      expect(parsed).toHaveProperty("selectionManifest");
      expect(parsed).toHaveProperty("adoContext");
      expect(parsed).toHaveProperty("applySummary");
      expect(parsed.proposalSet.id).toBe(proposalId);
      expect(parsed.selectionManifest.selectedItemIds).toEqual([]);
      expect(parsed.applySummary.proposalSetId).toBe(proposalId);
    });

    it("includes adoContext when provided", async () => {
      const proposalSet = minimalProposalSet(proposalId);
      const manifest = minimalManifest(proposalId);
      const summary = minimalSummary(proposalId);
      const adoContext = { testId: 10001, testCase: { id: 10001, title: "Test" } };
      const writtenPath = await writeApplyReport({
        proposalSet,
        selectionManifest: manifest,
        applySummary: summary,
        adoContext,
      });
      const content = await fs.readFile(writtenPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.adoContext).toEqual(adoContext);
    });

    it("throws when proposalSet.id is missing", async () => {
      const proposalSet = { ...minimalProposalSet(proposalId), id: undefined } as unknown as ProposalSet;
      await expect(
        writeApplyReport({
          proposalSet,
          selectionManifest: minimalManifest(proposalId),
          applySummary: minimalSummary(proposalId),
        })
      ).rejects.toThrow("proposalSet.id is required");
    });

    it("throws when selectionManifest.proposalId does not match", async () => {
      const proposalSet = minimalProposalSet(proposalId);
      const manifest = minimalManifest("other-id");
      await expect(
        writeApplyReport({
          proposalSet,
          selectionManifest: manifest,
          applySummary: minimalSummary(proposalId),
        })
      ).rejects.toThrow("must match proposalSet.id");
    });

    it("throws when applySummary.proposalSetId does not match", async () => {
      const proposalSet = minimalProposalSet(proposalId);
      await expect(
        writeApplyReport({
          proposalSet,
          selectionManifest: minimalManifest(proposalId),
          applySummary: minimalSummary("other-id"),
        })
      ).rejects.toThrow("must match proposalSet.id");
    });
  });
});
