/**
 * Tests for MCP sync command.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { runSync, enrichProposalWithAdoContext } from "../../../mcp/commands/sync";
import { getActiveProposal, clearActiveProposal } from "../../../mcp";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { ACTIVE_DIR, PILOT_DIR } from "../../../mcp/persistence";
import type { ProposalSet } from "../../../mcp/types";
import type { AdoContext } from "../../../mcp/ado/types";

// Mock ADO client
jest.mock("../../../mcp/ado/client", () => ({
  getAdoConfig: jest.fn(),
  getWorkItems: jest.fn(),
}));

import { getAdoConfig, getWorkItems } from "../../../mcp/ado/client";

const mockGetAdoConfig = getAdoConfig as jest.MockedFunction<typeof getAdoConfig>;
const mockGetWorkItems = getWorkItems as jest.MockedFunction<typeof getWorkItems>;

describe("sync command", () => {
  let testDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up test environment
    testDir = path.join(tmpdir(), `pilot-test-${Date.now()}`);
    process.env = {
      ...originalEnv,
      PILOT_ADO_ORG_URL: "https://dev.azure.com/testorg",
      PILOT_ADO_PROJECT: "TestProject",
      PILOT_ADO_PAT: "test-pat-token",
    };

    // Mock ADO config
    mockGetAdoConfig.mockReturnValue({
      orgUrl: "https://dev.azure.com/testorg",
      project: "TestProject",
      pat: "test-pat-token",
    });
  });

  afterEach(async () => {
    process.env = originalEnv;
    clearActiveProposal();
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it("should fail when ADO env vars are missing", async () => {
    delete process.env.PILOT_ADO_ORG_URL;
    delete process.env.PILOT_ADO_PROJECT;
    delete process.env.PILOT_ADO_PAT;

    mockGetAdoConfig.mockImplementation(() => {
      throw new Error("PILOT_ADO_ORG_URL environment variable is required");
    });

    const result = await runSync();
    expect(result).toBe(false);
  });

  it("should fail when no active proposals exist", async () => {
    // Ensure ACTIVE_DIR doesn't exist or is empty
    if (existsSync(ACTIVE_DIR)) {
      const files = await fs.readdir(ACTIVE_DIR);
      for (const file of files) {
        await fs.unlink(path.join(ACTIVE_DIR, file));
      }
    }

    const result = await runSync();
    expect(result).toBe(false);
  });

  it("should extract testId from proposal.source.runId", async () => {
    // Create a test proposal
    const proposal: ProposalSet = {
      id: "test-proposal-123",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "Test title",
        runId: "[10001]",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };

    await fs.mkdir(ACTIVE_DIR, { recursive: true });
    const proposalFile = path.join(ACTIVE_DIR, `${proposal.id}.proposal.json`);
    await fs.writeFile(proposalFile, JSON.stringify(proposal, null, 2));

    // Mock ADO responses
    mockGetWorkItems.mockResolvedValueOnce([
      {
        id: 10001,
        url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/10001",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "Test Case Title",
          "System.State": "Active",
        },
        relations: [],
      },
    ]);

    const result = await runSync();
    
    // Should have called getWorkItems with test ID
    expect(mockGetWorkItems).toHaveBeenCalledWith([10001], true);
    
    // Cleanup
    await fs.unlink(proposalFile);
  });

  it("should extract testId from proposal.source.testTitle as fallback", async () => {
    const proposal: ProposalSet = {
      id: "test-proposal-456",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "[10002] Test title",
        runId: "some-other-id",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };

    await fs.mkdir(ACTIVE_DIR, { recursive: true });
    const proposalFile = path.join(ACTIVE_DIR, `${proposal.id}.proposal.json`);
    await fs.writeFile(proposalFile, JSON.stringify(proposal, null, 2));

    mockGetWorkItems.mockResolvedValueOnce([
      {
        id: 10002,
        url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/10002",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "Test Case Title",
          "System.State": "Active",
        },
        relations: [],
      },
    ]);

    const result = await runSync();
    
    expect(mockGetWorkItems).toHaveBeenCalledWith([10002], true);
    
    // Cleanup
    await fs.unlink(proposalFile);
  });

  it("should find parent work item from relations", async () => {
    const proposal: ProposalSet = {
      id: "test-proposal-789",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "[10003] Test title",
        runId: "[10003]",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };

    await fs.mkdir(ACTIVE_DIR, { recursive: true });
    const proposalFile = path.join(ACTIVE_DIR, `${proposal.id}.proposal.json`);
    await fs.writeFile(proposalFile, JSON.stringify(proposal, null, 2));

    // Mock test case with parent relation
    mockGetWorkItems
      .mockResolvedValueOnce([
        {
          id: 10003,
          url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/10003",
          fields: {
            "System.WorkItemType": "Test Case",
            "System.Title": "Test Case Title",
            "System.State": "Active",
          },
          relations: [
            {
              rel: "System.LinkTypes.Hierarchy-Reverse",
              url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20001",
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 20001,
          url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20001",
          fields: {
            "System.WorkItemType": "User Story",
            "System.Title": "User Story Title",
            "Microsoft.VSTS.Common.AcceptanceCriteria": "Acceptance criteria text",
            "System.Description": "Description text",
          },
        },
      ]);

    const result = await runSync();
    
    // Should have fetched both test case and parent
    expect(mockGetWorkItems).toHaveBeenCalledTimes(2);
    expect(mockGetWorkItems).toHaveBeenNthCalledWith(1, [10003], true);
    expect(mockGetWorkItems).toHaveBeenNthCalledWith(2, [20001], false);

    // Check context file was created
    const contextFile = path.join(PILOT_DIR, "context", "ado", "10003.json");
    if (existsSync(contextFile)) {
      const contextContent = await fs.readFile(contextFile, "utf-8");
      const context = JSON.parse(contextContent);
      expect(context.testId).toBe(10003);
      expect(context.parent).not.toBeNull();
      expect(context.parent?.id).toBe(20001);
      expect(context.parent?.type).toBe("User Story");
      expect(context.parent?.acceptanceCriteria).toBe("Acceptance criteria text");
    }

    // Cleanup
    await fs.unlink(proposalFile);
    if (existsSync(contextFile)) {
      await fs.unlink(contextFile);
    }
  });

  it("should prefer User Story over other parent types", async () => {
    const proposal: ProposalSet = {
      id: "test-proposal-multi",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "[10004] Test title",
        runId: "[10004]",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };

    await fs.mkdir(ACTIVE_DIR, { recursive: true });
    const proposalFile = path.join(ACTIVE_DIR, `${proposal.id}.proposal.json`);
    await fs.writeFile(proposalFile, JSON.stringify(proposal, null, 2));

    // Mock test case with multiple parent relations
    mockGetWorkItems
      .mockResolvedValueOnce([
        {
          id: 10004,
          url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/10004",
          fields: {
            "System.WorkItemType": "Test Case",
            "System.Title": "Test Case Title",
          },
          relations: [
            {
              rel: "System.LinkTypes.Hierarchy-Reverse",
              url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20002",
            },
            {
              rel: "System.LinkTypes.Hierarchy-Reverse",
              url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20003",
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 20002,
          url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20002",
          fields: {
            "System.WorkItemType": "Bug",
          },
        },
        {
          id: 20003,
          url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20003",
          fields: {
            "System.WorkItemType": "User Story",
          },
        },
      ]);

    const result = await runSync();
    
    // Should prefer User Story (20003) over Bug (20002)
    expect(mockGetWorkItems).toHaveBeenCalledWith([20002, 20003], false);
    
    // Cleanup
    await fs.unlink(proposalFile);
  });

  it("should write context file with correct structure", async () => {
    const proposal: ProposalSet = {
      id: "test-proposal-structure",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "[10005] Test title",
        runId: "[10005]",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };

    await fs.mkdir(ACTIVE_DIR, { recursive: true });
    const proposalFile = path.join(ACTIVE_DIR, `${proposal.id}.proposal.json`);
    await fs.writeFile(proposalFile, JSON.stringify(proposal, null, 2));

    mockGetWorkItems.mockResolvedValueOnce([
      {
        id: 10005,
        url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/10005",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "Test Case Title",
          "System.State": "Active",
        },
        relations: [],
      },
    ]);

    const result = await runSync();
    
    // Check context file structure
    const contextFile = path.join(PILOT_DIR, "context", "ado", "10005.json");
    expect(existsSync(contextFile)).toBe(true);
    
    const contextContent = await fs.readFile(contextFile, "utf-8");
    const context = JSON.parse(contextContent);
    
    expect(context).toHaveProperty("testId");
    expect(context).toHaveProperty("testCase");
    expect(context).toHaveProperty("parent");
    expect(context).toHaveProperty("fetchedAt");
    expect(context.testId).toBe(10005);
    expect(context.testCase.id).toBe(10005);
    expect(context.parent).toBeNull();
    
    // Cleanup
    await fs.unlink(proposalFile);
    if (existsSync(contextFile)) {
      await fs.unlink(contextFile);
    }
  });

  it("should enrich proposal with ADO context in-memory during sync and store it", async () => {
    const proposal: ProposalSet = {
      id: "test-proposal-enrich",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "[10006] Test title",
        runId: "[10006]",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };

    await fs.mkdir(ACTIVE_DIR, { recursive: true });
    const proposalFile = path.join(ACTIVE_DIR, `${proposal.id}.proposal.json`);
    await fs.writeFile(proposalFile, JSON.stringify(proposal, null, 2));

    // Mock ADO responses
    mockGetWorkItems.mockResolvedValueOnce([
      {
        id: 10006,
        url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/10006",
        fields: {
          "System.WorkItemType": "Test Case",
          "System.Title": "Test Case Title",
          "System.State": "Active",
        },
        relations: [
          {
            rel: "System.LinkTypes.Hierarchy-Reverse",
            url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20006",
          },
        ],
      },
    ]).mockResolvedValueOnce([
      {
        id: 20006,
        url: "https://dev.azure.com/testorg/TestProject/_apis/wit/workitems/20006",
        fields: {
          "System.WorkItemType": "User Story",
          "System.Title": "User Story Title",
          "Microsoft.VSTS.Common.AcceptanceCriteria": "Acceptance criteria",
          "System.Description": "Description",
        },
      },
    ]);

    const result = await runSync();

    expect(result).toBe(true);
    
    // Verify active proposal store contains enriched proposal
    const activeProposal = getActiveProposal();
    expect(activeProposal).not.toBeNull();
    expect(activeProposal?.id).toBe(proposal.id);
    expect(activeProposal?.context).toBeDefined();
    expect(activeProposal?.context?.ado).toBeDefined();
    expect(activeProposal?.context?.ado?.testId).toBe(10006);
    expect(activeProposal?.context?.ado?.parent).not.toBeNull();
    expect(activeProposal?.context?.ado?.parent?.id).toBe(20006);
    expect(activeProposal?.context?.ado?.parent?.type).toBe("User Story");
    expect(activeProposal?.context?.ado?.parent?.acceptanceCriteria).toBe("Acceptance criteria");

    // Cleanup
    await fs.unlink(proposalFile);
    const contextFile = path.join(PILOT_DIR, "context", "ado", "10006.json");
    if (existsSync(contextFile)) {
      await fs.unlink(contextFile);
    }
  });

  it("should enrich proposal using enrichProposalWithAdoContext helper", () => {
    const proposal: ProposalSet = {
      id: "test-proposal",
      source: {
        testFile: "tests/example.spec.ts",
        testTitle: "Test",
      },
      items: [],
      createdAt: new Date().toISOString(),
      adapterVersion: "1.0.0",
    };

    const adoContext: AdoContext = {
      testId: 12345,
      testCase: {
        id: 12345,
        url: "https://dev.azure.com/org/proj/_apis/wit/workitems/12345",
        fields: {},
      },
      parent: null,
      fetchedAt: new Date().toISOString(),
    };

    enrichProposalWithAdoContext(proposal, adoContext);

    expect(proposal.context).toBeDefined();
    expect(proposal.context?.ado).toBe(adoContext);
    expect(proposal.context?.ado?.testId).toBe(12345);
  });
});
