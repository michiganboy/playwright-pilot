// Input normalization utilities.

/**
 * Normalizes a string to a safe kebab-case key.
 * Only allows [a-z0-9-], collapses repeated dashes, trims dashes.
 * Returns null if empty after sanitization.
 */
export function normalizeToKey(input: string): string | null {
  let normalized = input
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with dashes
    .replace(/[\s_]+/g, "-")
    // Remove all non-alphanumeric except dashes
    .replace(/[^a-z0-9-]/g, "")
    // Collapse repeated dashes
    .replace(/-+/g, "-")
    // Trim dashes from start and end
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

/**
 * Converts a key or name to PascalCase (e.g., "appointment-booking" -> "AppointmentBooking").
 */
export function toPascalCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/**
 * Converts a key or name to camelCase (e.g., "appointment-booking" -> "appointmentBooking").
 */
export function toCamelCase(input: string): string {
  const pascal = toPascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Normalizes a suite name to Title Case (e.g., "create schedule" -> "Create Schedule").
 * This ensures consistent storage and prevents case-sensitive duplicates.
 */
export function normalizeSuiteName(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Normalizes and validates input, printing transformation if changed.
 */
export function normalizeAndPrint(original: string, type: string): string {
  const normalized = normalizeToKey(original);
  if (!normalized) {
    throw new Error(`Invalid ${type}: "${original}" becomes empty after normalization.`);
  }
  if (normalized !== original.toLowerCase().trim()) {
    console.log(`  Normalized ${type}: "${original}" → "${normalized}"`);
  }
  return normalized;
}
