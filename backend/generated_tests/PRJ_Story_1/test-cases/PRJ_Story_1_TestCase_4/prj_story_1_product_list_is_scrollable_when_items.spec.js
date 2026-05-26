import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Product list is scrollable when items exceed viewport height @ai @regression @story-1 @case-4 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the product listing page
    await app.gotoTarget('/demo_app/');

    // Wait for the page to fully load including dynamic content
    await app.waitForVisible('body', 'Wait for the page to fully load including dynamic content');

    // Wait for main content area to be visible
    await app.waitForVisible('main', 'Wait for main content area to be visible');

    // Assert the main content container is visible on the page
    await app.expectVisible('main', 'Assert the main content container is visible on the page');

    // Assert at least one product card is visible in the initial viewport
    await app.expectVisible('.card', 'Assert at least one product card is visible in the initial viewport');

    // Scroll down the page by 500 pixels to simulate user scrolling
    // Unsupported action from AI: scroll;

    // Wait for product cards to remain visible after scrolling
    await app.waitForVisible('.card', 'Wait for product cards to remain visible after scrolling');

    // Assert product cards are still visible after partial scroll
    await app.expectVisible('.card', 'Assert product cards are still visible after partial scroll');

    // Scroll to the bottom of the page to reach all products
    // Unsupported action from AI: scroll;

    // Wait for product cards to be visible at bottom of scroll
    await app.waitForVisible('.card', 'Wait for product cards to be visible at bottom of scroll');

    // Assert product cards are visible at the bottom of the scrolled page
    await app.expectVisible('.card', 'Assert product cards are visible at the bottom of the scrolled page');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/PRJ_Story_1/screenshots/PRJ_Story_1_TestCase_4/final-ui-PRJ_Story_1_TestCase_4.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/prj_story_1_product_list_is_scrollable_when_items__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});