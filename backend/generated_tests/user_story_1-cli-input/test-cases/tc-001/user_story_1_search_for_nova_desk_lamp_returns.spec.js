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

test('Search for NOVA Desk lamp returns relevant results', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app/');

    // Navigate to the application homepage
    await page.goto('/demo_app/');

    // Wait for the search bar to be visible on the page
    await waitForWithFallback(page, `[data-testid='search-input'], input[type='search'], input[placeholder*='Search']`, 'Wait for the search bar to be visible on the page');

    // Click on the search bar to focus it
    await clickWithFallback(page, `[data-testid='search-input'], input[type='search'], input[placeholder*='Search']`, 'Click on the search bar to focus it');

    // Type 'NOVA Desk lamp' into the search input field
    await fillWithFallback(page, `[data-testid='search-input'], input[type='search'], input[placeholder*='Search']`, `NOVA Desk lamp`, 'Type \'NOVA Desk lamp\' into the search input field');

    // Press Enter to submit the search query
    await pressWithFallback(page, `[data-testid='search-input'], input[type='search'], input[placeholder*='Search']`, `Enter`, 'Press Enter to submit the search query');

    // Wait for the Nova Desk Lamp product card to be visible in search results
    await waitForWithFallback(page, `[data-testid='product-card-nova-lamp']`, 'Wait for the Nova Desk Lamp product card to be visible in search results');

    // Assert that the Nova Desk Lamp product card is displayed in search results
    await expectVisibleWithFallback(page, `[data-testid='product-card-nova-lamp']`, 'Assert that the Nova Desk Lamp product card is displayed in search results');

    // Assert that the product name contains 'Nova Desk Lamp' (case-sensitive match to DOM text)
    await expectTextWithFallback(page, `[data-testid='product-card-nova-lamp'] [data-testid='product-name'], [data-testid='product-card-nova-lamp'] .product-name`, `Nova Desk Lamp`, 'Assert that the product name contains \'Nova Desk Lamp\' (case-sensitive match to DOM text)');

    // Assert that the product price '\$74' is visible within the product card
    await expectTextWithFallback(page, `[data-testid='product-card-nova-lamp']`, `\$74`, 'Assert that the product price \'$74\' is visible within the product card');

    // Assert that the product image is visible within the Nova Desk Lamp card
    await expectVisibleWithFallback(page, `[data-testid='product-card-nova-lamp'] img`, 'Assert that the product image is visible within the Nova Desk Lamp card');

    // Assert that the search input is still visible and retains the query
    await expectVisibleWithFallback(page, `[data-testid='search-input'], input[type='search'], input[placeholder*='Search']`, 'Assert that the search input is still visible and retains the query');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/user_story_1-cli-input/screenshots/tc-001/final-ui-tc-001.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_1_search_for_nova_desk_lamp_returns__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});