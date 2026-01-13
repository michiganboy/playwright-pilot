// Radio button selection helpers for Page Objects

import type { Page, Locator } from "@playwright/test";

/**
 * Selects a radio button by label text.
 * @param page - Playwright page object
 * @param labelText - Text of the radio button label
 */
export async function selectRadioByLabel(page: Page, labelText: string): Promise<void> {
  const radio = page.locator(`input[type="radio"]`).filter({ hasText: labelText });
  await radio.check();
}

/**
 * Selects a radio button by value.
 * @param page - Playwright page object
 * @param name - Name attribute of the radio group
 * @param value - Value attribute of the radio option
 */
export async function selectRadioByValue(page: Page, name: string, value: string): Promise<void> {
  const radio = page.locator(`input[type="radio"][name="${name}"][value="${value}"]`);
  await radio.check();
}

/**
 * Selects a radio button from a locator group.
 * @param radioGroup - Locator for the radio button group container
 * @param option - Object with label or value to select
 */
export async function selectRadioOption(
  radioGroup: Locator,
  option: { label?: string; value?: string }
): Promise<void> {
  if (option.label) {
    const radio = radioGroup.locator(`input[type="radio"]`).filter({ hasText: option.label });
    await radio.check();
  } else if (option.value) {
    const radio = radioGroup.locator(`input[type="radio"][value="${option.value}"]`);
    await radio.check();
  } else {
    throw new Error("Either label or value must be provided");
  }
}
