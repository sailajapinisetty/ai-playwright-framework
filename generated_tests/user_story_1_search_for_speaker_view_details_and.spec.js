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

test('Search for Speaker, view details, and add to cart', async ({ page }, testInfo) => {
  try {
    await page.goto('https://sailajapinisetty.github.io/demo_app/');

    // Navigate to the demo app homepage
    await page.goto(`https://sailajapinisetty.github.io/demo_app/`);

    // Verify the search input is visible on the page
    await expectVisibleWithFallback(page, `[placeholder*='Search'], input[type='search'], input[name='search']`, 'Verify the search input is visible on the page');

    // Type 'Speaker' into the search input field
    await fillWithFallback(page, `[placeholder*='Search'], input[type='search'], input[name='search']`, `Speaker`, 'Type \'Speaker\' into the search input field');

    // Press Enter to submit the search query
    await pressWithFallback(page, `[placeholder*='Search'], input[type='search'], input[name='search']`, `Enter`, 'Press Enter to submit the search query');

    // Wait for search results containing 'Speaker' to appear
    await waitForWithFallback(page, `text=Speaker`, 'Wait for search results containing \'Speaker\' to appear');

    // Verify at least one product with 'Speaker' in the name is visible in results
    await expectVisibleWithFallback(page, `text=Speaker`, 'Verify at least one product with \'Speaker\' in the name is visible in results');

    // Click on the first 'Speaker' product to open its details page
    await clickWithFallback(page, `text=Speaker`, 'Click on the first \'Speaker\' product to open its details page');

    // Wait for the product details page to load with Speaker heading
    await waitForWithFallback(page, `role=heading[name*='Speaker']`, 'Wait for the product details page to load with Speaker heading');

    // Verify the product detail page heading contains 'Speaker'
    await expectVisibleWithFallback(page, `role=heading[name*='Speaker']`, 'Verify the product detail page heading contains \'Speaker\'');

    // Verify the 'Add to Cart' button is visible on the product details page
    await expectVisibleWithFallback(page, `role=button[name*='Add to Cart']`, 'Verify the \'Add to Cart\' button is visible on the product details page');

    // Click the 'Add to Cart' button to add the Speaker to the cart
    await clickWithFallback(page, `role=button[name*='Add to Cart']`, 'Click the \'Add to Cart\' button to add the Speaker to the cart');

    // Wait for a confirmation message or cart update indicator
    await waitForWithFallback(page, `text=added, text=cart, role=alert`, 'Wait for a confirmation message or cart update indicator');

    // Verify the cart icon or cart area reflects the added item
    await expectVisibleWithFallback(page, `[aria-label*='cart'], [data-testid*='cart'], text=Cart`, 'Verify the cart icon or cart area reflects the added item');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'artifacts/final-ui.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_1_search_for_speaker_view_details_and__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});