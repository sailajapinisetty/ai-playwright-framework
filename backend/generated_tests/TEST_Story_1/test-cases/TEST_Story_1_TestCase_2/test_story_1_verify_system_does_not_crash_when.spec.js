import { test } from '../../../../playwright-tests/framework/fixtures/testFixtures.js';

test('Verify system does not crash when receiving random alphanumeric gibberish input @ai @regression @story-1 @case-2 @type-error-handling @priority-high', async ({ app }, testInfo) => {
  try {
    await app.gotoTarget('/demo_app/');

    // Open the demo application in the browser
    await app.gotoTarget('/demo_app/');

    // Wait for the page body to be present and loaded
    await app.waitForVisible('body', 'Wait for the page body to be present and loaded');

    // Enter gibberish text into the primary input field
    await app.fill('input[type=\'text\'], input[type=\'search\'], textarea', 'af sdfjksldaf', 'Enter gibberish text into the primary input field');

    // Submit the gibberish input by pressing Enter
    await app.press('input[type=\'text\'], input[type=\'search\'], textarea', 'Enter', 'Submit the gibberish input by pressing Enter');

    // Wait for the UI to settle after submission
    await app.waitForVisible('body', 'Wait for the UI to settle after submission');

    // Assert that the page body is still visible and has not crashed or gone blank
    await app.expectVisible('body', 'Assert that the page body is still visible and has not crashed or gone blank');

    // Assert that the page body contains readable text content, indicating no blank-screen crash
    await app.expectText('body', '', 'Assert that the page body contains readable text content, indicating no blank-screen crash');

  } finally {
    if (!app.page.isClosed()) {
      await app.page.screenshot({ path: 'generated_tests/TEST_Story_1/screenshots/TEST_Story_1_TestCase_2/final-ui-TEST_Story_1_TestCase_2.png', fullPage: true });
      await app.page.screenshot({ path: `test-results/test_story_1_verify_system_does_not_crash_when__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});