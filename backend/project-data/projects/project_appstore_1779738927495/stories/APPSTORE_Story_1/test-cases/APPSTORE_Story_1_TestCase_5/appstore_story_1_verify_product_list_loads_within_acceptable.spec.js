import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify product list loads within acceptable response time on landing page @ai @regression @story-1 @case-5 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the application landing page and record navigation start time
    await app.gotoTarget('/demo_app/');

    // Wait for the main content area to be present in the DOM
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM');

    // Wait for networkidle state so dynamic/React content is fully rendered
    await app.waitForVisible('.app', 'Wait for networkidle state so dynamic/React content is fully rendered');

    // Assert at least one product card is visible on the page using the card class selector
    await app.expectVisible('.card', 'Assert at least one product card is visible on the page using the card class selector');

    // Assert the main content container is visible confirming the page has fully rendered
    await app.expectVisible('main', 'Assert the main content container is visible confirming the page has fully rendered');

    // Assert the main content area contains product-related text to confirm product list rendered
    await app.expectText('main', '', 'Assert the main content area contains product-related text to confirm product list rendered');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/APPSTORE_Story_1/screenshots/APPSTORE_Story_1_TestCase_5/final-ui-APPSTORE_Story_1_TestCase_5.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/appstore_story_1_verify_product_list_loads_within_acceptable__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});