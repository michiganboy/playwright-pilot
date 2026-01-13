// Per-test deterministic seeding (A2 strategy).
import { seed, getSeed } from "mimicry-js";

let testSeedCache: Map<string, number> = new Map();

/**
 * Derives a stable test seed from run seed + test identifier + worker index.
 * This ensures different workers generate different data while maintaining determinism.
 * 
 * Formula: hash(baseSeed|w:workerIndex|t:testIdentifier)
 */
export function deriveTestSeed(runSeed: string, testIdentifier: string, workerIndex: number): number {
  // Use explicit format for seed input: baseSeed|w:workerIndex|t:testId
  const seedInput = `${runSeed}|w:${workerIndex}|t:${testIdentifier}`;
  const cacheKey = seedInput;
  
  if (testSeedCache.has(cacheKey)) {
    return testSeedCache.get(cacheKey)!;
  }

  // FNV-1a 32-bit hash for deterministic seed derivation
  // Includes workerIndex to ensure cross-worker uniqueness
  const FNV_OFFSET_BASIS = 2166136261;
  const FNV_PRIME = 16777619;
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < seedInput.length; i++) {
    hash ^= seedInput.charCodeAt(i);
    hash = (hash * FNV_PRIME) >>> 0; // Use unsigned 32-bit multiplication
  }

  // Convert to positive number and use as seed (mimicry-js compatible)
  const testSeed = hash % 2147483647;
  testSeedCache.set(cacheKey, testSeed);
  
  // Debug logging when PILOT_DEBUG_SEED=true
  if (process.env.PILOT_DEBUG_SEED === "true") {
    console.log(
      `[PILOT] seed base=${runSeed} worker=${workerIndex} test=${testIdentifier} effective=${testSeed}`
    );
  }
  
  return testSeed;
}

/**
 * Sets seed for current test context.
 */
export function setTestSeed(seedValue: number): void {
  seed(seedValue);
}

/**
 * Gets current seed (from mimicry-js).
 */
export function getTestSeed(): number | null {
  return getSeed();
}

/**
 * Resets seed cache (called between tests).
 */
export function resetTestSeedCache(): void {
  testSeedCache.clear();
}
