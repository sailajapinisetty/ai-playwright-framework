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

test('Search for a speaker by name and view their full details', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app');

    // Navigate to the demo application home page
    await page.goto('/demo_app');

    // Wait for the page body to be present and loaded
    await waitForWithFallback(page, `body`, 'Wait for the page body to be present and loaded');

    // Confirm the page has loaded successfully
    await expectVisibleWithFallback(page, `body`, 'Confirm the page has loaded successfully');

    // Click the Speakers navigation link using href attribute
    await clickWithFallback(page, `a[href*='speaker']`, 'Click the Speakers navigation link using href attribute');

    // Wait for the search input field to appear on the speakers page
    await waitForWithFallback(page, `input[type='search'], input[placeholder*='search' i], input[placeholder*='speaker' i], input[name*='search' i]`, 'Wait for the search input field to appear on the speakers page');

    // Verify the search input field is visible on the speakers page
    await expectVisibleWithFallback(page, `input[type='search'], input[placeholder*='search' i], input[placeholder*='speaker' i], input[name*='search' i]`, 'Verify the search input field is visible on the speakers page');

    // Type 'Jane Doe' into the speaker search input field
    await fillWithFallback(page, `input[type='search'], input[placeholder*='search' i], input[placeholder*='speaker' i], input[name*='search' i]`, `Jane Doe`, 'Type \'Jane Doe\' into the speaker search input field');

    // Press Enter to submit the search query
    await pressWithFallback(page, `input[type='search'], input[placeholder*='search' i], input[placeholder*='speaker' i], input[name*='search' i]`, `Enter`, 'Press Enter to submit the search query');

    // Wait for search results to appear on the page
    await waitForWithFallback(page, `[class*='speaker'], [class*='result'], [data-testid*='speaker'], li[class*='speaker'], div[class*='card']`, 'Wait for search results to appear on the page');

    // Verify that at least one search result is visible after searching
    await expectVisibleWithFallback(page, `[class*='speaker'], [class*='result'], [data-testid*='speaker'], li[class*='speaker'], div[class*='card']`, 'Verify that at least one search result is visible after searching');

    // Verify that 'Jane Doe' appears in the search results
    await expectTextWithFallback(page, `[class*='speaker'], [class*='result'], [data-testid*='speaker'], li[class*='speaker'], div[class*='card']`, `Jane Doe`, 'Verify that \'Jane Doe\' appears in the search results');

    // Click on 'Jane Doe' from the search results to open the detail page
    await clickWithFallback(page, `text=Jane Doe`, 'Click on \'Jane Doe\' from the search results to open the detail page');

    // Wait for the speaker detail page to load
    await waitForWithFallback(page, `[class*='detail'], [class*='profile'], [data-testid*='detail'], [class*='bio'], h1, h2`, 'Wait for the speaker detail page to load');

    // Verify the speaker's full name 'Jane Doe' is visible on the detail page
    await expectVisibleWithFallback(page, `text=Jane Doe`, 'Verify the speaker\'s full name \'Jane Doe\' is visible on the detail page');

    // Verify the speaker's biography or description section is visible
    await expectVisibleWithFallback(page, `[class*='bio'], [class*='description'], [data-testid*='bio'], p`, 'Verify the speaker\'s biography or description section is visible');

    // Verify the speaker's topics or areas of expertise are visible on the detail page
    await expectVisibleWithFallback(page, `[class*='topic'], [class*='expertise'], [class*='tag'], [data-testid*='topic']`, 'Verify the speaker\'s topics or areas of expertise are visible on the detail page');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/user_story_2-story-2/screenshots/tc-001/final-ui-tc-001.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_2_search_for_a_speaker_by_name__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});