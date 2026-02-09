/**
 * Tests for EvidencePacket building from ArtifactIndex.
 */

import { describe, it, expect } from "@jest/globals";
import { buildEvidencePacketFromIndex } from "../../../mcp/artifacts/evidenceBuilder";
import type { ArtifactIndex } from "../../../mcp/artifacts/types";

describe("evidenceBuilder", () => {
  it("should build EvidencePacket from ArtifactIndex with trace", () => {
    const index: ArtifactIndex = {
      traceZip: {
        path: "/test-results/trace.zip",
        sizeBytes: 1024,
        mtime: new Date("2024-01-01"),
      },
      attachments: [],
      notes: [],
      sourcePaths: ["/test-results"],
    };

    const packet = buildEvidencePacketFromIndex(
      index,
      "/evidence",
      "Test failed",
      "Stack trace here",
      {
        testFile: "test.spec.ts",
        testTitle: "Test title",
      }
    );

    expect(packet.traces).toHaveLength(1);
    expect(packet.traces[0].path).toContain("trace.zip");
    expect(packet.errorMessage).toBe("Test failed");
    expect(packet.stackTrace).toBe("Stack trace here");
    expect(packet.testMetadata?.testFile).toBe("test.spec.ts");
  });

  it("should include screenshots in EvidencePacket", () => {
    const index: ArtifactIndex = {
      attachments: [
        {
          kind: "screenshot",
          path: "/test-results/screenshot.png",
          sizeBytes: 512,
          mtime: new Date("2024-01-01"),
          label: "screenshot.png",
        },
      ],
      notes: [],
      sourcePaths: [],
    };

    const packet = buildEvidencePacketFromIndex(index, "/evidence");

    expect(packet.screenshots).toHaveLength(1);
    expect(packet.screenshots[0].path).toContain("screenshot.png");
  });

  it("should include videos in videoReferences", () => {
    const index: ArtifactIndex = {
      attachments: [
        {
          kind: "video",
          path: "/test-results/video.webm",
          sizeBytes: 2048,
          mtime: new Date("2024-01-01"),
          label: "video.webm",
        },
      ],
      notes: [],
      sourcePaths: [],
    };

    const packet = buildEvidencePacketFromIndex(index, "/evidence");

    expect(packet.videoReferences).toBeDefined();
    expect(packet.videoReferences).toHaveLength(1);
    expect(packet.videoReferences![0].path).toContain("video.webm");
  });

  it("should include collectionMetadata", () => {
    const index: ArtifactIndex = {
      attachments: [
        {
          kind: "screenshot",
          path: "/test-results/screenshot.png",
          sizeBytes: 512,
          mtime: new Date("2024-01-01"),
        },
      ],
      notes: ["Note 1"],
      sourcePaths: ["/test-results"],
    };

    const packet = buildEvidencePacketFromIndex(index, "/evidence");

    expect(packet.collectionMetadata).toBeDefined();
    expect(packet.collectionMetadata?.attachmentCounts.screenshots).toBe(1);
    expect(packet.collectionMetadata?.indexingNotes).toHaveLength(1);
    expect(packet.collectionMetadata?.sourcePaths).toContain("/test-results");
  });
});
