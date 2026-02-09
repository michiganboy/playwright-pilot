/**
 * Tests for EvidencePacket building from ArtifactIndex.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { buildEvidencePacketFromIndex } from "../evidenceBuilder";
import type { ArtifactIndex } from "../types";

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

  it("should include logs in attachmentReferences", () => {
    const index: ArtifactIndex = {
      attachments: [
        {
          kind: "log",
          path: "/test-results/error-context.md",
          sizeBytes: 256,
          mtime: new Date("2024-01-01"),
          label: "error-context.md",
        },
      ],
      notes: [],
      sourcePaths: [],
    };

    const packet = buildEvidencePacketFromIndex(index, "/evidence");

    expect(packet.attachmentReferences).toBeDefined();
    expect(packet.attachmentReferences).toHaveLength(1);
    expect(packet.attachmentReferences![0].path).toContain("error-context.md");
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
        {
          kind: "video",
          path: "/test-results/video.webm",
          sizeBytes: 2048,
          mtime: new Date("2024-01-01"),
        },
        {
          kind: "log",
          path: "/test-results/error-context.md",
          sizeBytes: 256,
          mtime: new Date("2024-01-01"),
        },
      ],
      notes: ["Note 1", "Note 2"],
      sourcePaths: ["/test-results"],
    };

    const packet = buildEvidencePacketFromIndex(index, "/evidence");

    expect(packet.collectionMetadata).toBeDefined();
    expect(packet.collectionMetadata?.attachmentCounts.screenshots).toBe(1);
    expect(packet.collectionMetadata?.attachmentCounts.videos).toBe(1);
    expect(packet.collectionMetadata?.attachmentCounts.logs).toBe(1);
    expect(packet.collectionMetadata?.indexingNotes).toHaveLength(2);
    expect(packet.collectionMetadata?.sourcePaths).toContain("/test-results");
  });

  it("should not include optional fields when empty", () => {
    const index: ArtifactIndex = {
      attachments: [],
      notes: [],
      sourcePaths: [],
    };

    const packet = buildEvidencePacketFromIndex(index, "/evidence");

    expect(packet.videoReferences).toBeUndefined();
    expect(packet.attachmentReferences).toBeUndefined();
  });
});
