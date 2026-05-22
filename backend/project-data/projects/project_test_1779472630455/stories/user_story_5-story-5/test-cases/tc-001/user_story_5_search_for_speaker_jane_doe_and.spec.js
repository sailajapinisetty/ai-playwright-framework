import { test, expect } from '@playwright/test';

function parseRoleSelector(selector) {
  const match = String(selector || "").match(/^role=([a-z]+)(?:\[name(\*?)=['"](.+?)['"]\])?$/i);
  if (!match) return null;
  return { role: match[1], isPartial: match[2] === "*", name: match[3] || "" };
}

function textPattern(value) {
  const escaped = String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

async function firstExisting(candidates) {
  for (const locator of candidates) {
    if (!locator) continue;
    try {
      if (await locator.count()) return locator.first();
    } catch {
      // Ignore malformed locator candidates and continue to fallback options.
    }
  }
  return null;
}

function semanticCandidates(page, hint) {
  const text = String(hint || "").toLowerCase();
  const candidates = [];

  if (text.includes("search")) {
    candidates.push(page.getByRole("searchbox", { name: /search/i }));
    candidates.push(page.getByPlaceholder(/search/i));
    candidates.push(page.getByLabel(/search/i));
    candidates.push(page.locator("input[type=\"search\"], input[placeholder*=\"search\" i], input[aria-label*=\"search\" i]"));
  }

  if (text.includes("view details") || text.includes("details")) {
    candidates.push(page.getByRole("link", { name: /details|view details/i }));
  }

  if (text.includes("add to cart") || text.includes("add")) {
    candidates.push(page.getByRole("button", { name: /add to cart|add/i }));
  }

  if (text.includes("cart")) {
    candidates.push(page.getByRole("link", { name: /cart/i }));
  }

  return candidates;
}

async function resolveLocator(page, selector, description) {
  const selectorText = String(selector || "").trim();
  const descriptionText = String(description || "").trim();
  const candidates = [];

  if (selectorText) {
    candidates.push(page.locator(selectorText));

    const roleInfo = parseRoleSelector(selectorText);
    if (roleInfo) {
      if (roleInfo.name) {
        candidates.push(page.getByRole(roleInfo.role, { name: roleInfo.isPartial ? textPattern(roleInfo.name) : roleInfo.name }));
      } else {
        candidates.push(page.getByRole(roleInfo.role));
      }
    }

    if (selectorText.startsWith("text=")) {
      candidates.push(page.getByText(selectorText.slice(5)));
    }
  }

  candidates.push(...semanticCandidates(page, `${selectorText} ${descriptionText}`));

  const resolved = await firstExisting(candidates);
  if (!resolved) {
    throw new Error(`Unable to resolve locator. selector="${selectorText}" description="${descriptionText}"`);
  }
  return resolved;
}

async function clickWithFallback(page, selector, description) {
  const locator = await resolveLocator(page, selector, description);
  await locator.click();
}

async function fillWithFallback(page, selector, value, description) {
  const locator = await resolveLocator(page, selector, description);
  await locator.fill(value);
}

async function pressWithFallback(page, selector, key, description) {
  const locator = await resolveLocator(page, selector, description);
  await locator.press(key);
}

async function waitForWithFallback(page, selector, description) {
  const locator = await resolveLocator(page, selector, description);
  await expect(locator).toBeVisible();
}

async function expectVisibleWithFallback(page, selector, description) {
  const locator = await resolveLocator(page, selector, description);
  await expect(locator).toBeVisible();
}

async function expectTextWithFallback(page, selector, value, description) {
  const locator = await resolveLocator(page, selector, description);
  await expect(locator).toContainText(value);
}

test('Search for Speaker Jane Doe and View Profile Details', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app/#/');

    // Navigate to the demo application home page
    await page.goto('/demo_app/#/');

    // Wait for the page body to be present and fully loaded
    await waitForWithFallback(page, `body`, 'Wait for the page body to be present and fully loaded');

    // Assert that the navigation bar is visible to confirm app has loaded
    await expectVisibleWithFallback(page, `nav`, 'Assert that the navigation bar is visible to confirm app has loaded');

    // Click on the Speakers navigation link to go to the speakers section
    await clickWithFallback(page, `a[href*='speaker'], nav a:has-text('Speaker'), a:has-text('Speakers')`, 'Click on the Speakers navigation link to go to the speakers section');

    // Wait for the search input field to be present on the speakers page
    await waitForWithFallback(page, `input[type='search'], input[placeholder*='search' i], input[placeholder*='speaker' i], input[type='text']`, 'Wait for the search input field to be present on the speakers page');

    // Assert the search input field is visible on the speakers search page
    await expectVisibleWithFallback(page, `input[type='search'], input[placeholder*='search' i], input[placeholder*='speaker' i], input[type='text']`, 'Assert the search input field is visible on the speakers search page');

    // Type 'Jane' into the search input field to search for the speaker
    await fillWithFallback(page, `input[type='search'], input[placeholder*='search' i], input[placeholder*='speaker' i], input[type='text']`, `Jane`, 'Type \'Jane\' into the search input field to search for the speaker');

    // Wait for search result cards or list items to appear after typing
    await waitForWithFallback(page, `[class*='card'], [class*='speaker'], [class*='result'], [role='listitem'], li`, 'Wait for search result cards or list items to appear after typing');

    // Assert that at least one result container is visible after the search
    await expectVisibleWithFallback(page, `[class*='card'], [class*='speaker'], [class*='result'], [role='list'], ul`, 'Assert that at least one result container is visible after the search');

    // Click on the first speaker result card to navigate to the detail page
    await clickWithFallback(page, `[class*='card']:first-child, [class*='speaker']:first-child, [role='listitem']:first-child, li:first-child`, 'Click on the first speaker result card to navigate to the detail page');

    // Wait for the speaker detail page content to load
    await waitForWithFallback(page, `[class*='detail'], [class*='profile'], [class*='bio'], h1, h2`, 'Wait for the speaker detail page content to load');

    // Assert that the speaker's name heading is visible on the detail page
    await expectVisibleWithFallback(page, `h1, h2, [class*='name'], [class*='title']`, 'Assert that the speaker\'s name heading is visible on the detail page');

    // Assert that the speaker's biography or description text is visible
    await expectVisibleWithFallback(page, `[class*='bio'], [class*='description'], [class*='about'], p`, 'Assert that the speaker\'s biography or description text is visible');

    // Assert that the speaker's topics or areas of expertise are listed
    await expectVisibleWithFallback(page, `[class*='topic'], [class*='expertise'], [class*='tag'], [class*='skill']`, 'Assert that the speaker\'s topics or areas of expertise are listed');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/user_story_5-story-5/screenshots/tc-001/final-ui-tc-001.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_5_search_for_speaker_jane_doe_and__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});