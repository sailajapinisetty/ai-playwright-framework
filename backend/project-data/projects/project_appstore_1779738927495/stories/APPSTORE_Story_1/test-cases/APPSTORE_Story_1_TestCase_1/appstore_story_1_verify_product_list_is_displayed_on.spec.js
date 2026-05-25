import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify product list is displayed on landing page for a guest user @ai @regression @story-1 @case-1 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the application landing page
    await app.gotoTarget('/demo_app/');

    // Wait for the main content area to be present in the DOM
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM');

    // Wait for networkidle to ensure dynamic/React content is fully rendered
    await app.waitForVisible('body', 'Wait for networkidle to ensure dynamic/React content is fully rendered');

    // Assert that at least one product card is visible on the landing page
    await app.expectVisible('.card', 'Assert that at least one product card is visible on the landing page');

    // Assert that product name is visible within the product card
    await app.expectVisible('.card-title', 'Assert that product name is visible within the product card');

    // Assert that product image is visible within the product card
    await app.expectVisible('.card-img-top', 'Assert that product image is visible within the product card');

    // Assert that product price or description text is visible within the product card
    await app.expectVisible('.card-text', 'Assert that product price or description text is visible within the product card');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/APPSTORE_Story_1/screenshots/APPSTORE_Story_1_TestCase_1/final-ui-APPSTORE_Story_1_TestCase_1.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/appstore_story_1_verify_product_list_is_displayed_on__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});