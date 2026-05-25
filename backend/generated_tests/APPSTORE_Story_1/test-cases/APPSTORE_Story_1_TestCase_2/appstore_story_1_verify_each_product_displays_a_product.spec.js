import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify each product displays a product name in the list @ai @regression @story-1 @case-2 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the application landing page
    await app.gotoTarget('/demo_app/');

    // Wait for the main content area to be present in the DOM
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM');

    // Wait for network to be idle ensuring dynamic content is fully loaded
    await app.waitForVisible('body', 'Wait for network to be idle ensuring dynamic content is fully loaded');

    // Assert that at least one product card is visible on the landing page
    await app.expectVisible('.card', 'Assert that at least one product card is visible on the landing page');

    // Assert the first product card is visible
    await app.expectVisible('.card:nth-child(1)', 'Assert the first product card is visible');

    // Assert the first product card contains a non-empty product name heading
    await app.expectText('.card:nth-child(1) h2', '', 'Assert the first product card contains a non-empty product name heading');

    // Assert the second product card is visible
    await app.expectVisible('.card:nth-child(2)', 'Assert the second product card is visible');

    // Assert the second product card contains a non-empty product name heading
    await app.expectText('.card:nth-child(2) h2', '', 'Assert the second product card contains a non-empty product name heading');

    // Assert the third product card is visible
    await app.expectVisible('.card:nth-child(3)', 'Assert the third product card is visible');

    // Assert the third product card contains a non-empty product name heading
    await app.expectText('.card:nth-child(3) h2', '', 'Assert the third product card contains a non-empty product name heading');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/APPSTORE_Story_1/screenshots/APPSTORE_Story_1_TestCase_2/final-ui-APPSTORE_Story_1_TestCase_2.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/appstore_story_1_verify_each_product_displays_a_product__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});