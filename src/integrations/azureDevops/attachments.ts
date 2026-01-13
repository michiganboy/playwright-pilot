// Azure DevOps test result attachment upload utilities.
import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { resolve, basename } from "path";
import {
  findTraceZip,
  findErrorContext,
  findLastRunJson,
} from "./artifacts";

interface AttachmentInfo {
  filePath: string;
  fileName: string;
  contentType: string;
  sanitized?: boolean;
}

/**
 * Uploads an attachment to an Azure DevOps test result.
 */
async function uploadAttachment(
  orgUrl: string,
  project: string,
  token: string,
  runId: number,
  testCaseResultId: number,
  attachment: AttachmentInfo
): Promise<void> {
  const url = `${orgUrl}/${project}/_apis/test/Runs/${runId}/Results/${testCaseResultId}/attachments?api-version=7.0`;

  let fileBuffer: Buffer;

  // Read file as buffer
  if (attachment.sanitized) {
    // For sanitized files, read as buffer
    fileBuffer = await readFile(attachment.filePath);
  } else {
    // For binary files (like trace.zip), read as buffer without any encoding
    // This ensures binary files are read correctly
    fileBuffer = await readFile(attachment.filePath);
  }

  // Azure DevOps Test Result Attachment API requires JSON with base64-encoded content
  // Ensure we have a proper Buffer before encoding
  if (!Buffer.isBuffer(fileBuffer)) {
    fileBuffer = Buffer.from(fileBuffer);
  }
  
  const base64Content = fileBuffer.toString("base64");
  
  const requestBody = {
    attachmentType: "GeneralAttachment",
    comment: "Playwright test artifact",
    fileName: attachment.fileName,
    stream: base64Content,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload attachment ${attachment.fileName}: ${response.status} ${errorText}`);
  }
}

/**
 * Collects all artifacts for a failed test and uploads them to Azure DevOps.
 */
export async function uploadTestArtifacts(
  orgUrl: string,
  project: string,
  token: string,
  runId: number,
  testCaseResultId: number,
  testResultDir: string,
  testResultsDir: string = "./test-results",
  quiet: boolean = false
): Promise<void> {
  const log = quiet ? () => { } : (...args: any[]) => console.log(...args);
  const warn = quiet ? () => { } : (...args: any[]) => console.warn(...args);

  const attachments: AttachmentInfo[] = [];

  // Check which artifacts to attach based on environment variables
  const attachTrace = process.env.ADO_ATTACH_TRACE !== "false";
  const attachErrorContext = process.env.ADO_ATTACH_ERROR_CONTEXT !== "false";
  const attachLastRun = process.env.ADO_ATTACH_LAST_RUN !== "false";
  const attachRunState = process.env.ADO_ATTACH_RUN_STATE === "true";

  // Collect trace.zip
  if (attachTrace) {
    const tracePath = findTraceZip(testResultDir);
    if (tracePath) {
      attachments.push({
        filePath: tracePath,
        fileName: "trace.zip",
        contentType: "application/zip",
        sanitized: false,
      });
    }
  }

  // Collect error-context.md
  if (attachErrorContext) {
    const errorContextPath = findErrorContext(testResultDir);
    if (errorContextPath) {
      attachments.push({
        filePath: errorContextPath,
        fileName: "error-context.md",
        contentType: "text/markdown",
        sanitized: false,
      });
    }
  }

  // Collect .last-run.json
  if (attachLastRun) {
    const lastRunPath = findLastRunJson(testResultsDir);
    if (lastRunPath) {
      attachments.push({
        filePath: lastRunPath,
        fileName: ".last-run.json",
        contentType: "application/json",
        sanitized: false,
      });
    }
  }

  // Upload all attachments
  for (const attachment of attachments) {
    try {
      await uploadAttachment(orgUrl, project, token, runId, testCaseResultId, attachment);
      log(`Uploaded ${attachment.fileName} for test result ${testCaseResultId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to upload ${attachment.fileName}: ${errorMessage}`);
    }
  }
}
