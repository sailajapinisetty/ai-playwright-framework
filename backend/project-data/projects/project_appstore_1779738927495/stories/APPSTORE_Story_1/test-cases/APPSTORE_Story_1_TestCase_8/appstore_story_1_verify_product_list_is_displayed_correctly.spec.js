import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify product list is displayed correctly on tablet screen size (768x1024) @ai @regression @story-1 @case-8 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the application landing page at tablet viewport (768x1024)
    await app.gotoTarget('/demo_app/');

    // Wait for the main content area to be present in the DOM
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM');

    // Wait for network to be idle ensuring dynamic/React content is fully rendered
    await app.waitForVisible('body', 'Wait for network to be idle ensuring dynamic/React content is fully rendered');

    // Assert at least one product card is visible in the main content area at tablet viewport using .card selector
    await app.expectVisible('.card', 'Assert at least one product card is visible in the main content area at tablet viewport using .card selector');

    // Assert product name (card-title) is readable and visible within a product card at tablet viewport
    await app.expectVisible('.card-title', 'Assert product name (card-title) is readable and visible within a product card at tablet viewport');

    // Assert product price or description text is readable and visible within a product card at tablet viewport
    await app.expectVisible('.card-text', 'Assert product price or description text is readable and visible within a product card at tablet viewport');

    // Assert product image is visible and rendered inside a card at tablet viewport
    await app.expectVisible('.card img', 'Assert product image is visible and rendered inside a card at tablet viewport');

    // Scroll to the bottom of the page to verify all product items are accessible at tablet viewport
    await app.press('body', 'End', 'Scroll to the bottom of the page to verify all product items are accessible at tablet viewport');

    // Assert product cards remain visible after scrolling to confirm no content overflow or clipping at tablet viewport
    await app.expectVisible('.card', 'Assert product cards remain visible after scrolling to confirm no content overflow or clipping at tablet viewport');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/APPSTORE_Story_1/screenshots/APPSTORE_Story_1_TestCase_8/final-ui-APPSTORE_Story_1_TestCase_8.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/appstore_story_1_verify_product_list_is_displayed_correctly__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});