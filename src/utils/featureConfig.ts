// Loads feature configuration and selects entries based on the FEATURE environment variable.
import featureConfigRaw from "../testdata/featureConfig.json";

export interface FeatureConfig {
  tag: string;
  planId: number;
  suites: number[];
}

export const FEATURE_CONFIG: Record<string, FeatureConfig> =
  featureConfigRaw as unknown as Record<string, FeatureConfig>;

export function getAvailableFeatureKeys(): string[] {
  return Object.keys(FEATURE_CONFIG);
}
