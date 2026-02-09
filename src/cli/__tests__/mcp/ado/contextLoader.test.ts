/**
 * Tests for ADO context loader.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { loadAdoContextForTestId } from "../../../mcp/ado/contextLoader";
import { getActiveProposal, setActiveProposal, clearActiveProposal } from "../../../mcp";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { PILOT_DIR } from "../../../mcp/persistence";
import type { ProposalSet } from "../../../mcp/types";
import type { AdoContext } from "../../../mcp/ado/types";

describe("contextLoader", () => {
  let testDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    process.env = {
      ...originalEnv,
      PILOT_DIR: testDir,
    };
    clearActiveProposal();
  });

  afterEach(async () => {
    process.env = originalEnv;
    clearActiveProposal();
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it("should return in-memory context when present", async () => {
    const testId = 12345;
    const adoContext: AdoContext = {
      testId,
      testCase: {
        id: testId,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/12345",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "Test Case Title",
        },
      },
      parent: {
        id: 20001,
        type: "User Story",
        title: "User Story Title",
        acceptanceCriteria: "Acceptance criteria",
        description: "Description",
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/20001",
      },
      fetchedAt: new Date().toISOString(),
    };

    const proposal: ProposalSet = {
      id: "test-proposal",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "[12345] Test",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
      context: {
        ado: adoContext,
      },
    };

    setActiveProposal(proposal);

    const result = await loadAdoContextForTestId(testId);

    expect(result).not.toBeNull();
    expect(result?.testId).toBe(testId);
    expect(result?.testCase.id).toBe(testId);
    expect(result?.parent?.id).toBe(20001);
  });

  it("should return file context when store empty", async () => {
    const testId = 12346;
    const adoContext: AdoContext = {
      testId,
      testCase: {
        id: testId,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/12346",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "Test Case Title",
        },
      },
      parent: null,
      fetchedAt: new Date().toISOString(),
    };

    const contextDir = path.join(PILOT_DIR, "context", "ado");
    await fs.mkdir(contextDir, { recursive: true });
    const contextFile = path.join(contextDir, `${testId}.json`);
    await fs.writeFile(contextFile, JSON.stringify(adoContext, null, 2));

    const result = await loadAdoContextForTestId(testId);

    expect(result).not.toBeNull();
    expect(result?.testId).toBe(testId);
    expect(result?.testCase.id).toBe(testId);
    expect(result?.parent).toBeNull();

    // Cleanup
    await fs.unlink(contextFile);
  });

  it("should return null when neither exists", async () => {
    const result = await loadAdoContextForTestId(99999);
    expect(result).toBeNull();
  });

  it("should throw on invalid JSON if file exists", async () => {
    const testId = 12347;
    const contextDir = path.join(PILOT_DIR, "context", "ado");
    await fs.mkdir(contextDir, { recursive: true });
    const contextFile = path.join(contextDir, `${testId}.json`);
    await fs.writeFile(contextFile, "invalid json {");

    await expect(loadAdoContextForTestId(testId)).rejects.toThrow("Invalid JSON");

    // Cleanup
    await fs.unlink(contextFile);
  });

  it("should throw on invalid shape if file exists", async () => {
    const testId = 12348;
    const contextDir = path.join(PILOT_DIR, "context", "ado");
    await fs.mkdir(contextDir, { recursive: true });
    const contextFile = path.join(contextDir, `${testId}.json`);
    await fs.writeFile(contextFile, JSON.stringify({ invalid: "structure" }));

    await expect(loadAdoContextForTestId(testId)).rejects.toThrow("missing required fields");

    // Cleanup
    await fs.unlink(contextFile);
  });

  it("should prefer in-memory context over file", async () => {
    const testId = 12349;
    
    // Set up file context
    const fileContext: AdoContext = {
      testId,
      testCase: {
        id: testId,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/12349",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "File Context",
        },
      },
      parent: null,
      fetchedAt: new Date().toISOString(),
    };

    const contextDir = path.join(PILOT_DIR, "context", "ado");
    await fs.mkdir(contextDir, { recursive: true });
    const contextFile = path.join(contextDir, `${testId}.json`);
    await fs.writeFile(contextFile, JSON.stringify(fileContext, null, 2));

    // Set up in-memory context
    const memoryContext: AdoContext = {
      testId,
      testCase: {
        id: testId,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/12349",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "Memory Context",
        },
      },
      parent: null,
      fetchedAt: new Date().toISOString(),
    };

    const proposal: ProposalSet = {
      id: "test-proposal",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "[12349] Test",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
      context: {
        ado: memoryContext,
      },
    };

    setActiveProposal(proposal);

    const result = await loadAdoContextForTestId(testId);

    expect(result).not.toBeNull();
    expect(result?.testCase.fields["System.Title"]).toBe("Memory Context");

    // Cleanup
    await fs.unlink(contextFile);
  });
});
