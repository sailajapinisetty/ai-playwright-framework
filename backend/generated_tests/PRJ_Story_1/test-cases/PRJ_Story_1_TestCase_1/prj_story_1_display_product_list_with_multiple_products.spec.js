import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Display product list with multiple products available @ai @regression @story-1 @case-1 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the demo app home page
    await app.gotoTarget('/demo_app/');

    // Wait for the page body to be present in the DOM
    await app.waitForVisible('body', 'Wait for the page body to be present in the DOM');

    // Wait for network to be idle so async-rendered content is fully loaded
    await app.waitForVisible('networkidle', 'Wait for network to be idle so async-rendered content is fully loaded');

    // Assert that the products container element is visible on the page
    await app.expectVisible('.products-container', 'Assert that the products container element is visible on the page');

    // Assert that at least one product card is visible in the product list
    await app.expectVisible('.product-card', 'Assert that at least one product card is visible in the product list');

    // Assert that product items are rendered in the listing area
    await app.expectVisible('.product-item', 'Assert that product items are rendered in the listing area');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/PRJ_Story_1/screenshots/PRJ_Story_1_TestCase_1/final-ui-PRJ_Story_1_TestCase_1.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/prj_story_1_display_product_list_with_multiple_products__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});