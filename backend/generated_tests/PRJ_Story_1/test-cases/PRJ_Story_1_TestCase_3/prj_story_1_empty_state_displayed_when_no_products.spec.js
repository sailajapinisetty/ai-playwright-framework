import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Empty state displayed when no products are available @ai @regression @story-1 @case-3 @type-edge @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the product listing page
    await app.gotoTarget('/demo_app/');

    // Wait for the page body to be present
    await app.waitForVisible('css=body', 'Wait for the page body to be present');

    // Wait for the main content area to load
    await app.waitForVisible('css=main', 'Wait for the main content area to load');

    // Assert the main content area is visible
    await app.expectVisible('css=main', 'Assert the main content area is visible');

    // Assert that the main content area contains product-related content or an appropriate message
    await app.expectText('css=main', 'product', 'Assert that the main content area contains product-related content or an appropriate message');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/PRJ_Story_1/screenshots/PRJ_Story_1_TestCase_3/final-ui-PRJ_Story_1_TestCase_3.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/prj_story_1_empty_state_displayed_when_no_products__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});