import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { runRun, type RunOptions } from "../../../mcp/commands/run";
import { runHeal, runReview, runApply } from "../../../mcp";

jest.mock("../../../mcp", () => ({
  __esModule: true,
  runHeal: jest.fn(),
  runReview: jest.fn(),
  runApply: jest.fn(),
}));

const mockedRunHeal = runHeal as jest.MockedFunction<typeof runHeal>;
const mockedRunReview = runReview as jest.MockedFunction<typeof runReview>;
const mockedRunApply = runApply as jest.MockedFunction<typeof runApply>;

describe("mcp run command", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs heal then review then apply on success", async () => {
    mockedRunHeal.mockResolvedValue(true);
    mockedRunReview.mockResolvedValue(true);
    mockedRunApply.mockResolvedValue(true);

    const result = await runRun({
      trace: "trace.zip",
      runId: "123",
      preview: true,
      yes: true,
      quiet: true,
    });

    expect(result).toBe(true);
    expect(mockedRunHeal).toHaveBeenCalledTimes(1);
    expect(mockedRunReview).toHaveBeenCalledTimes(1);
    expect(mockedRunApply).toHaveBeenCalledTimes(1);

    expect(mockedRunHeal).toHaveBeenCalledWith({
      trace: "trace.zip",
      runId: "123",
      quiet: true,
    });

    expect(mockedRunReview).toHaveBeenCalledWith({
      latest: true,
      quiet: true,
    });

    expect(mockedRunApply).toHaveBeenCalledWith({
      latest: true,
      preview: true,
      yes: true,
      quiet: true,
    } as any);

    expect(
      mockedRunHeal.mock.invocationCallOrder[0]
    ).toBeLessThan(mockedRunReview.mock.invocationCallOrder[0]);
    expect(
      mockedRunReview.mock.invocationCallOrder[0]
    ).toBeLessThan(mockedRunApply.mock.invocationCallOrder[0]);
  });

  it("stops after heal when heal fails", async () => {
    mockedRunHeal.mockResolvedValue(false);

    const result = await runRun({ quiet: true });

    expect(result).toBe(false);
    expect(mockedRunHeal).toHaveBeenCalledTimes(1);
    expect(mockedRunReview).not.toHaveBeenCalled();
    expect(mockedRunApply).not.toHaveBeenCalled();
  });

  it("stops after review when review fails", async () => {
    mockedRunHeal.mockResolvedValue(true);
    mockedRunReview.mockResolvedValue(false);

    const result = await runRun({ quiet: true });

    expect(result).toBe(false);
    expect(mockedRunHeal).toHaveBeenCalledTimes(1);
    expect(mockedRunReview).toHaveBeenCalledTimes(1);
    expect(mockedRunApply).not.toHaveBeenCalled();
  });

  it("returns false when apply fails", async () => {
    mockedRunHeal.mockResolvedValue(true);
    mockedRunReview.mockResolvedValue(true);
    mockedRunApply.mockResolvedValue(false);

    const result = await runRun({ quiet: true });

    expect(result).toBe(false);
    expect(mockedRunHeal).toHaveBeenCalledTimes(1);
    expect(mockedRunReview).toHaveBeenCalledTimes(1);
    expect(mockedRunApply).toHaveBeenCalledTimes(1);
  });

  it("passes options through correctly and respects defaults", async () => {
    mockedRunHeal.mockResolvedValue(true);
    mockedRunReview.mockResolvedValue(true);
    mockedRunApply.mockResolvedValue(true);

    const options: RunOptions = {};

    await runRun(options);

    expect(mockedRunHeal).toHaveBeenCalledWith({
      trace: undefined,
      runId: undefined,
      quiet: undefined,
    });

    expect(mockedRunReview).toHaveBeenCalledWith({
      latest: true,
      quiet: undefined,
    });

    expect(mockedRunApply).toHaveBeenCalledWith({
      latest: true,
      preview: false,
      yes: false,
      quiet: undefined,
    } as any);
  });
});

