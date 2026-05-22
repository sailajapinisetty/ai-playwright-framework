import { test as base, expect } from '@playwright/test';
import { AppPage } from '../pom/appPage.js';

export { expect };

export const test = base.extend({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await use(app);
  }
});
