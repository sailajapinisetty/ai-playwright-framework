import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify graceful handling of gibberish input @ai @regression @story-1 @case-1 @type-negative @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Navigate to the main application page
    await app.gotoTarget('/demo_app/');

    // Wait for the page body to be visible
    await app.waitForVisible('body', 'Wait for the page body to be visible');

    // Type gibberish text into the first available input field
    await app.fill('input[type=\'text\'], input[type=\'search\'], input:not([type=\'hidden\']):not([type=\'submit\']):not([type=\'button\']):not([type=\'checkbox\']):not([type=\'radio\'])', 'af sdfjksldaf', 'Type gibberish text into the first available input field');

    // Submit the gibberish input by pressing Enter
    await app.press('input[type=\'text\'], input[type=\'search\'], input:not([type=\'hidden\']):not([type=\'submit\']):not([type=\'button\']):not([type=\'checkbox\']):not([type=\'radio\'])', 'Enter', 'Submit the gibberish input by pressing Enter');

    // Wait for the page to respond after submission
    await app.waitForVisible('body', 'Wait for the page to respond after submission');

    // Assert the page is still visible and has not crashed
    await app.expectVisible('body', 'Assert the page is still visible and has not crashed');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/TEST_Story_1/screenshots/TEST_Story_1_TestCase_1/final-ui-TEST_Story_1_TestCase_1.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/test_story_1_verify_graceful_handling_of_gibberish_input__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});