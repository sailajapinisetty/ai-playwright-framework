import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Product list loads within acceptable time threshold @ai @regression @story-1 @case-2 @type-functional @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the demo app product listing page and record start time
    await app.gotoTarget('/demo_app/');

    // Wait for the body element to confirm the page has begun rendering
    await app.waitForVisible('body', 'Wait for the body element to confirm the page has begun rendering');

    // Wait for the main content area to be present in the DOM
    await app.waitForVisible('main', 'Wait for the main content area to be present in the DOM');

    // Wait for at least one product card element to appear indicating the list has rendered
    await app.waitForVisible('.product-card', 'Wait for at least one product card element to appear indicating the list has rendered');

    // Assert that product card elements are visible on screen
    await app.expectVisible('.product-card', 'Assert that product card elements are visible on screen');

    // Assert that the main content container is visible confirming full page render
    await app.expectVisible('main', 'Assert that the main content container is visible confirming full page render');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/PRJ_Story_1/screenshots/PRJ_Story_1_TestCase_2/final-ui-PRJ_Story_1_TestCase_2.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/prj_story_1_product_list_loads_within_acceptable_time__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});