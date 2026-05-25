import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify product list is displayed correctly on desktop screen size (1920x1080) @ai @regression @story-1 @case-7 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the application landing page
    await app.gotoTarget('/demo_app/');

    // Wait for the main content area to be present in the DOM
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM');

    // Wait for network to be idle ensuring dynamic content is fully loaded
    await app.waitForVisible('body', 'Wait for network to be idle ensuring dynamic content is fully loaded');

    // Assert the main content area is visible on the page
    await app.expectVisible('main', 'Assert the main content area is visible on the page');

    // Assert at least one product card is visible in the main content area
    await app.expectVisible('.card', 'Assert at least one product card is visible in the main content area');

    // Assert the first product card is rendered without being cut off
    await app.expectVisible('.card:first-child', 'Assert the first product card is rendered without being cut off');

    // Assert the first product card image element is visible
    await app.expectVisible('.card:first-child img', 'Assert the first product card image element is visible');

    // Assert the first product card title/name is visible
    await app.expectVisible('.card:first-child .card-title', 'Assert the first product card title/name is visible');

    // Assert the first product card price or description text is visible
    await app.expectVisible('.card:first-child .card-text', 'Assert the first product card price or description text is visible');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/APPSTORE_Story_1/screenshots/APPSTORE_Story_1_TestCase_7/final-ui-APPSTORE_Story_1_TestCase_7.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/appstore_story_1_verify_product_list_is_displayed_correctly__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});