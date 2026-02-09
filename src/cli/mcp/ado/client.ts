// Azure DevOps Work Item Tracking API client
// Read-only operations for fetching work items

import type { WorkItem } from "./types";

/**
 * ADO configuration from environment variables.
 */
export interface AdoConfig {
  orgUrl: string;
  project: string;
  pat: string;
}

/**
 * Validates and extracts ADO configuration from environment variables.
 */
export function getAdoConfig(): AdoConfig {
  const orgUrl = process.env.PILOT_ADO_ORG_URL;
  const project = process.env.PILOT_ADO_PROJECT;
  const pat = process.env.PILOT_ADO_PAT;

  if (!orgUrl) {
    throw new Error("PILOT_ADO_ORG_URL environment variable is required");
  }
  if (!project) {
    throw new Error("PILOT_ADO_PROJECT environment variable is required");
  }
  if (!pat) {
    throw new Error("PILOT_ADO_PAT environment variable is required");
  }

  // Normalize org URL (remove trailing slash)
  const normalizedOrgUrl = orgUrl.replace(/\/$/, "");

  return {
    orgUrl: normalizedOrgUrl,
    project,
    pat,
  };
}

/**
 * Builds ADO API URL safely (avoids double slashes).
 */
function buildApiUrl(orgUrl: string, project: string, path: string): string {
  // Ensure single slash between segments
  const base = `${orgUrl}/${project}/_apis/wit`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Creates Basic Auth header from PAT.
 */
function createAuthHeader(pat: string): string {
  const token = Buffer.from(`:${pat}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Fetches work items by IDs from Azure DevOps.
 */
export async function getWorkItems(
  ids: number[],
  expandRelations: boolean = false
): Promise<WorkItem[]> {
  const config = getAdoConfig();

  if (ids.length === 0) {
    return [];
  }

  const idsParam = ids.join(",");
  const expandParam = expandRelations ? "&$expand=Relations" : "";
  const url = buildApiUrl(
    config.orgUrl,
    config.project,
    `/workitems?ids=${idsParam}${expandParam}&api-version=7.1`
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: createAuthHeader(config.pat),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `ADO API request failed: ${response.status} ${response.statusText}\n${errorText.substring(0, 500)}`
    );
  }

  const data: unknown = await response.json();

  // Type guard: check if data has the expected ADO API shape { value: WorkItem[] }
  if (
    typeof data === "object" &&
    data !== null &&
    "value" in data &&
    Array.isArray((data as { value: unknown }).value)
  ) {
    return (data as { value: WorkItem[] }).value;
  }

  return [];
}
