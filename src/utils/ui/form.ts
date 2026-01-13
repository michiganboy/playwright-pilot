// Form field helpers for Page Objects

import type { Locator } from "@playwright/test";

/**
 * Fills a field only if it is visible.
 * Useful for conditional fields that may or may not appear.
 * @param locator - Locator for the input field
 * @param value - Value to fill
 * @returns true if field was filled, false if not visible
 */
export async function fillIfVisible(locator: Locator, value: string): Promise<boolean> {
  const isVisible = await locator.isVisible().catch(() => false);
  if (isVisible) {
    await locator.fill(value);
    return true;
  }
  return false;
}

/**
 * Checks a checkbox only if it is visible.
 * @param locator - Locator for the checkbox
 * @returns true if checkbox was checked, false if not visible
 */
export async function checkIfVisible(locator: Locator): Promise<boolean> {
  const isVisible = await locator.isVisible().catch(() => false);
  if (isVisible) {
    await locator.check();
    return true;
  }
  return false;
}

/**
 * Selects an option in a dropdown only if it is visible.
 * @param locator - Locator for the select element
 * @param value - Value or label to select
 * @returns true if option was selected, false if not visible
 */
export async function selectIfVisible(
  locator: Locator,
  value: string | { label?: string; value?: string }
): Promise<boolean> {
  const isVisible = await locator.isVisible().catch(() => false);
  if (isVisible) {
    await locator.selectOption(value);
    return true;
  }
  return false;
}
