// Factory tools: default utilities for test data generation.
// Each factory receives a `tools` object with these utilities.
import { seed, getSeed } from "mimicry-js";
import { deriveTestSeed, setTestSeed, resetTestSeedCache } from "./seed";
import { getTestContext, getWorkerIndex } from "./context";

export interface FactoryTools {
  pick: {
    one: <T>(array: T[]) => T | undefined;
    many: <T>(array: T[], count: number) => T[];
    weighted: <T>(items: Array<{ item: T; weight: number }>) => T | undefined;
    enum: <T extends string>(enumObject: Record<string, T>) => T;
  };
  person: {
    email: (domain?: string) => string;
    phone: () => string;
    firstName: () => string;
    lastName: () => string;
    fullName: () => string;
    streetAddress: () => string;
    city: () => string;
    state: () => string;
    zipCode: () => string;
    address: () => string;
  };
  date: {
    today: () => Date;
    addDays: (date: Date, days: number) => Date;
    nextBusinessDay: (date?: Date) => Date;
    range: (start: Date, end: Date) => Date;
    appointmentSlot: (date: Date, hour: number, minute?: number) => Date;
  };
  id: {
    uuid: () => string;
    numeric: (min?: number, max?: number) => number;
    short: (prefix?: string) => string;
  };
  str: {
    slug: (text: string) => string;
    title: (text: string) => string;
    randomAlphaNumeric: (length?: number) => string;
    mask: (text: string, visibleChars?: number) => string;
  };
  after: {
    build: <T>(hook: (built: T) => T) => (built: T) => T;
  };
  override: {
    merge: <T>(base: T, overrides: Partial<T>) => T;
    pick: <T, K extends keyof T>(obj: T, field: K, generator: () => T[K]) => T;
  };
}

// Helper: Simple hash for deterministic randomness
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

// Helper: Seeded random (0-1)
function seededRandom(): number {
  const currentSeed = getSeed();
  if (currentSeed === null) {
    return Math.random();
  }
  // Simple LCG for seeded randomness
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32);
  const nextSeed = (a * currentSeed + c) % m;
  seed(nextSeed);
  return nextSeed / m;
}

// Helper: Random integer in range
function randomInt(min: number, max: number): number {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

// Helper: Pick random element
function pickOne<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[randomInt(0, array.length - 1)];
}

// Helper: Pick many elements
function pickMany<T>(array: T[], count: number): T[] {
  if (count <= 0 || array.length === 0) return [];
  const shuffled = [...array].sort(() => seededRandom() - 0.5);
  return shuffled.slice(0, Math.min(count, array.length));
}

// Helper: Weighted pick
function pickWeighted<T>(items: Array<{ item: T; weight: number }>): T | undefined {
  if (items.length === 0) return undefined;
  const totalWeight = items.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight === 0) return pickOne(items.map(({ item }) => item));
  
  let random = seededRandom() * totalWeight;
  for (const { item, weight } of items) {
    random -= weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1].item;
}

// Helper: Pick enum value
function pickEnum<T extends string>(enumObject: Record<string, T>): T {
  const values = Object.values(enumObject);
  return pickOne(values) || values[0];
}

// Person generators
const firstNames = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Blake", "Cameron"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
const cities = ["Springfield", "Franklin", "Georgetown", "Madison", "Clinton", "Washington", "Jackson", "Jefferson"];
const states = ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "GA", "NC", "MI"];
const streets = ["Main St", "Oak Ave", "Park Blvd", "Elm St", "Maple Dr", "Cedar Ln"];

function email(domain: string = "example.com"): string {
  const random = Math.floor(seededRandom() * 1000000).toString(36);
  const name = Math.floor(seededRandom() * 1000000).toString(36);
  return `${name}.${random}@${domain}`;
}

function phone(): string {
  const area = randomInt(200, 999);
  const exchange = randomInt(200, 999);
  const number = randomInt(0, 9999).toString().padStart(4, "0");
  return `(${area}) ${exchange}-${number}`;
}

function firstName(): string {
  return pickOne(firstNames) || "Alex";
}

function lastName(): string {
  return pickOne(lastNames) || "Smith";
}

function fullName(): string {
  return `${firstName()} ${lastName()}`;
}

function streetAddress(): string {
  const number = randomInt(1, 9999);
  const street = pickOne(streets) || "Main St";
  return `${number} ${street}`;
}

function city(): string {
  return pickOne(cities) || "Springfield";
}

function state(): string {
  return pickOne(states) || "CA";
}

function zipCode(): string {
  return randomInt(10000, 99999).toString();
}

function address(): string {
  return `${streetAddress()}, ${city()}, ${state()} ${zipCode()}`;
}

// Date helpers (leap-year safe)
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return days[month - 1];
}

function today(): Date {
  return new Date();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function nextBusinessDay(date: Date = new Date()): Date {
  let result = new Date(date);
  result.setDate(result.getDate() + 1);
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function range(start: Date, end: Date): Date {
  const diff = end.getTime() - start.getTime();
  const randomDiff = seededRandom() * diff;
  return new Date(start.getTime() + randomDiff);
}

function appointmentSlot(date: Date, hour: number, minute: number = 0): Date {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

// ID generators
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(seededRandom() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function numeric(min: number = 1, max: number = 999999): number {
  return randomInt(min, max);
}

function short(prefix: string = "id"): string {
  const random = Math.floor(seededRandom() * 1000000).toString(36);
  return `${prefix}_${random}`;
}

// String helpers
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function title(text: string): string {
  return text.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function randomAlphaNumeric(length: number = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(seededRandom() * chars.length));
  }
  return result;
}

function mask(text: string, visibleChars: number = 4): string {
  if (text.length <= visibleChars) return text;
  return text.slice(0, visibleChars) + "*".repeat(text.length - visibleChars);
}

// Post-build and override utilities
function afterBuild<T>(hook: (built: T) => T): (built: T) => T {
  return hook;
}

function overrideMerge<T>(base: T, overrides: Partial<T>): T {
  return { ...base, ...overrides };
}

function overridePick<T, K extends keyof T>(obj: T, field: K, generator: () => T[K]): T {
  return { ...obj, [field]: generator() };
}

// Initialize seed for current context (test or global)
function initializeSeedForContext(): void {
  const runSeed = (global as any).__PILOT_SEED__ || process.env.PILOT_SEED || "";
  if (!runSeed) {
    // No run seed set, use non-deterministic (shouldn't happen in normal flow)
    return;
  }

  const testContext = getTestContext();
  const workerIndex = getWorkerIndex();
  
  if (testContext !== null && workerIndex !== null) {
    // In test context: use test-specific seed with worker index
    const testSeed = deriveTestSeed(runSeed, testContext, workerIndex);
    setTestSeed(testSeed);
  } else {
    // Outside test context: use global fallback (workerIndex defaults to 0)
    const globalSeed = deriveTestSeed(runSeed, "global", 0);
    setTestSeed(globalSeed);
  }
}

// Export tools factory
export function createTools(idPrefix?: string): FactoryTools {
  // Initialize seed when tools are created
  initializeSeedForContext();
  
  return {
    pick: {
      one: pickOne,
      many: pickMany,
      weighted: pickWeighted,
      enum: pickEnum,
    },
    person: {
      email,
      phone,
      firstName,
      lastName,
      fullName,
      streetAddress,
      city,
      state,
      zipCode,
      address,
    },
    date: {
      today,
      addDays,
      nextBusinessDay,
      range,
      appointmentSlot,
    },
    id: {
      uuid,
      numeric,
      short: (prefix?: string) => short(prefix || idPrefix || "id"),
    },
    str: {
      slug,
      title,
      randomAlphaNumeric,
      mask,
    },
    after: {
      build: afterBuild,
    },
    override: {
      merge: overrideMerge,
      pick: overridePick,
    },
  };
}

// Export seed utilities
export { deriveTestSeed, setTestSeed, resetTestSeedCache };
export { setTestContext, getTestContext, getWorkerIndex, clearTestContext } from "./context";
