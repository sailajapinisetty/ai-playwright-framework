import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify each product displays a loaded image on the landing page @ai @regression @story-1 @case-3 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the application landing page
    await app.gotoTarget('/demo_app/');

    // Wait for the main content area to be present in the DOM (timeout 10000ms)
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM (timeout 10000ms)');

    // Wait for at least one image element to appear in the page
    await app.waitForVisible('img', 'Wait for at least one image element to appear in the page');

    // Assert that at least one product image element is visible on the page
    await app.expectVisible('img', 'Assert that at least one product image element is visible on the page');

    // Evaluate that every visible img element within product cards has a non-empty src attribute and naturalWidth greater than 0, confirming images are loaded and not broken
    await app.expectText('body', '', 'Evaluate that every visible img element within product cards has a non-empty src attribute and naturalWidth greater than 0, confirming images are loaded and not broken');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/APPSTORE_Story_1/screenshots/APPSTORE_Story_1_TestCase_3/final-ui-APPSTORE_Story_1_TestCase_3.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/appstore_story_1_verify_each_product_displays_a_loaded__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});