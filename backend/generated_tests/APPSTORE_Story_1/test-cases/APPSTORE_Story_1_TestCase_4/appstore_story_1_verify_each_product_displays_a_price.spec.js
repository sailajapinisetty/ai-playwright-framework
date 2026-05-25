import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify each product displays a price on the landing page @ai @regression @story-1 @case-4 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the application landing page
    await app.gotoTarget('/demo_app/');

    // Wait for the main content area to be present in the DOM
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM');

    // Wait for network to be idle so dynamic content is fully loaded
    await app.waitForVisible('body', 'Wait for network to be idle so dynamic content is fully loaded');

    // Assert that at least one product card is visible on the landing page
    await app.expectVisible('.card', 'Assert that at least one product card is visible on the landing page');

    // Assert that the first product card contains a price with currency symbol
    await app.expectText('.card:nth-child(1)', '$', 'Assert that the first product card contains a price with currency symbol');

    // Assert that the second product card contains a price with currency symbol
    await app.expectText('.card:nth-child(2)', '$', 'Assert that the second product card contains a price with currency symbol');

    // Assert that the third product card contains a price with currency symbol
    await app.expectText('.card:nth-child(3)', '$', 'Assert that the third product card contains a price with currency symbol');

    // Assert that the fourth product card contains a price with currency symbol
    await app.expectText('.card:nth-child(4)', '$', 'Assert that the fourth product card contains a price with currency symbol');

    // Assert that the fifth product card contains a price with currency symbol
    await app.expectText('.card:nth-child(5)', '$', 'Assert that the fifth product card contains a price with currency symbol');

    // Assert that the sixth product card contains a price with currency symbol
    await app.expectText('.card:nth-child(6)', '$', 'Assert that the sixth product card contains a price with currency symbol');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/APPSTORE_Story_1/screenshots/APPSTORE_Story_1_TestCase_4/final-ui-APPSTORE_Story_1_TestCase_4.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/appstore_story_1_verify_each_product_displays_a_price__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});