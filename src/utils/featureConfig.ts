// Loads feature configuration and selects entries based on the FEATURE environment variable.
import featureConfigRaw from "../testdata/featureConfig.json";

export interface FeatureConfig {
  tag: string;
  planId: number;
  suites: Record<string, string>; // Suite ID (as string) -> Suite Name
}

export const FEATURE_CONFIG: Record<string, FeatureConfig> =
  featureConfigRaw as unknown as Record<string, FeatureConfig>;

export function getAvailableFeatureKeys(): string[] {
  return Object.keys(FEATURE_CONFIG);
}

/**
 * Extracts suite IDs from a suite config.
 */
export function getSuiteIds(suites: Record<string, string>): number[] {
  return Object.keys(suites).map((id) => parseInt(id, 10));
}

/**
 * Gets suite name by ID.
 */
export function getSuiteName(suites: Record<string, string>, suiteId: number): string | undefined {
  return suites[suiteId.toString()];
}

/**
 * Gets all suite names.
 */
export function getSuiteNames(suites: Record<string, string>): string[] {
  return Object.values(suites);
}

/**
 * Checks if a suite ID exists in the config.
 */
export function hasSuiteId(suites: Record<string, string>, suiteId: number): boolean {
  return suiteId.toString() in suites;
}
