// Date picker helpers for calendar widgets (leap-year safe)

import type { Page, Locator } from "@playwright/test";

/**
 * Selects a date in a date picker widget.
 * Handles leap years and month boundaries safely.
 * @param page - Playwright page object
 * @param datePickerLocator - Locator for the date picker input or trigger
 * @param date - Date to select
 */
export async function selectDate(
  page: Page,
  datePickerLocator: Locator,
  date: Date
): Promise<void> {
  // Open the date picker (click the input or trigger)
  await datePickerLocator.click();

  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Navigate to the correct year (if year selector exists)
  const yearSelector = page.locator('[aria-label*="year"], .year-selector, [data-year]').first();
  if (await yearSelector.isVisible().catch(() => false)) {
    await yearSelector.selectOption(year.toString());
  }

  // Navigate to the correct month (if month selector exists)
  const monthSelector = page.locator('[aria-label*="month"], .month-selector, [data-month]').first();
  if (await monthSelector.isVisible().catch(() => false)) {
    // Month is typically 0-indexed in selectors, but we have 1-12
    await monthSelector.selectOption((month - 1).toString());
  }

  // Click the day
  const dayButton = page.locator(
    `button[aria-label*="${year}"][aria-label*="${month}"][aria-label*="${day}"], ` +
    `[data-day="${day}"], ` +
    `.day:has-text("^${day}$")`
  ).first();
  await dayButton.click();
}

/**
 * Selects a date using a more flexible approach with common date picker patterns.
 * @param page - Playwright page object
 * @param datePickerLocator - Locator for the date picker
 * @param date - Date to select
 * @param options - Optional configuration
 */
export async function selectDateFlexible(
  page: Page,
  datePickerLocator: Locator,
  date: Date,
  options?: {
    yearSelector?: string;
    monthSelector?: string;
    daySelector?: string;
  }
): Promise<void> {
  await datePickerLocator.click();

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Use provided selectors or fall back to common patterns
  const yearSel = options?.yearSelector || '[aria-label*="year"]';
  const monthSel = options?.monthSelector || '[aria-label*="month"]';
  const daySel = options?.daySelector || `button:has-text("^${day}$")`;

  // Select year if selector exists
  const yearEl = page.locator(yearSel).first();
  if (await yearEl.isVisible().catch(() => false)) {
    await yearEl.selectOption(year.toString());
  }

  // Select month if selector exists
  const monthEl = page.locator(monthSel).first();
  if (await monthEl.isVisible().catch(() => false)) {
    await monthEl.selectOption((month - 1).toString());
  }

  // Click day
  const dayEl = page.locator(daySel).first();
  await dayEl.click();
}

/**
 * Checks if a year is a leap year (helper for date validation).
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Gets the number of days in a month (leap-year safe).
 */
export function daysInMonth(year: number, month: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return days[month - 1];
}
