// Test context tracking for per-test seed initialization.
let currentTestIdentifier: string | null = null;
let currentWorkerIndex: number | null = null;

export function setTestContext(testIdentifier: string, workerIndex: number): void {
  currentTestIdentifier = testIdentifier;
  currentWorkerIndex = workerIndex;
}

export function getTestContext(): string | null {
  return currentTestIdentifier;
}

export function getWorkerIndex(): number | null {
  return currentWorkerIndex;
}

export function clearTestContext(): void {
  currentTestIdentifier = null;
  currentWorkerIndex = null;
}
