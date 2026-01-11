// Page object for {{description}} UI interactions.
import type { Page } from "@playwright/test";
{{modelImports}}

// Encapsulates interactions with the {{description}} UI.
export class {{PageName}}Page {
  private locators = {
    // TODO: Add your locators here
    container: '[data-testid="{{pageKey}}-container"]',
    primaryButton: '[data-testid="{{pageKey}}-primary-button"]',
    secondaryButton: '[data-testid="{{pageKey}}-secondary-button"]',
  };

  constructor(private page: Page) {}

  // Navigates to the {{description}} page.
  async navigateTo{{PageName}}() {
    await this.page.goto("/{{pageKey}}");
    await this.page.locator(this.locators.container).waitFor({ timeout: 10000 });
  }

  // Performs a primary action on the page.
  async performPrimaryAction() {
    await this.page.locator(this.locators.primaryButton).click();
  }

  // Performs a secondary action on the page.
  async performSecondaryAction() {
    await this.page.locator(this.locators.secondaryButton).click();
  }

  // Health check: verifies key elements are visible on the page.
  async healthCheck() {
    await this.page.locator(this.locators.container).waitFor({ timeout: 10000 });
    const isVisible = await this.page.locator(this.locators.container).isVisible();
    if (!isVisible) {
      throw new Error("{{PageName}}Page health check failed: container not visible");
    }
  }
  {{loginDriverHelper}}
}
