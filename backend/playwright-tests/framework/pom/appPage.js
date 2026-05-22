import { expect } from '@playwright/test';
import { BasePage } from './basePage.js';

export class AppPage extends BasePage {
  async gotoTarget(target) {
    await this.page.goto(target);
  }

  async click(selector, description = '') {
    const locator = await this.resolveLocator(selector, description);
    await locator.click();
  }

  async fill(selector, value, description = '') {
    const locator = await this.resolveLocator(selector, description);
    await locator.fill(String(value || ''));
  }

  async press(selector, key = 'Enter', description = '') {
    const locator = await this.resolveLocator(selector, description);
    await locator.press(String(key || 'Enter'));
  }

  async waitForVisible(selector, description = '') {
    const locator = await this.resolveLocator(selector, description);
    await expect(locator).toBeVisible();
  }

  async expectVisible(selector, description = '') {
    const locator = await this.resolveLocator(selector, description);
    await expect(locator).toBeVisible();
  }

  async expectText(selector, value, description = '') {
    const locator = await this.resolveLocator(selector, description);
    await expect(locator).toContainText(String(value || ''));
  }
}
