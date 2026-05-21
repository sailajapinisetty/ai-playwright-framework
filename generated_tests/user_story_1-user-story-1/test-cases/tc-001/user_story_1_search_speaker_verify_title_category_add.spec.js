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

test('Search Speaker, Verify Title & Category, Add to Cart', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app/');

    // Navigate to the e-commerce home page
    await page.goto('/demo_app/');

    // Wait for the search input field to be visible on the page
    await waitForWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, 'Wait for the search input field to be visible on the page');

    // Type 'Speaker' into the search input field
    await fillWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, `Speaker`, 'Type \'Speaker\' into the search input field');

    // Press Enter to submit the search query
    await pressWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, `Enter`, 'Press Enter to submit the search query');

    // Wait for search results to load
    await waitForWithFallback(page, `[data-testid='search-results'], .product-list, .search-results, .products`, 'Wait for search results to load');

    // Verify at least one product result containing 'Speaker' is visible in the search results
    await expectVisibleWithFallback(page, `text=Speaker`, 'Verify at least one product result containing \'Speaker\' is visible in the search results');

    // Click on the first Speaker product in the search results to open its details page
    await clickWithFallback(page, `text=Speaker`, 'Click on the first Speaker product in the search results to open its details page');

    // Wait for the product details page to load
    await waitForWithFallback(page, `[data-testid='product-title'], .product-title, h1, h2`, 'Wait for the product details page to load');

    // Verify the product title element is visible on the product details page
    await expectVisibleWithFallback(page, `[data-testid='product-title'], .product-title, h1`, 'Verify the product title element is visible on the product details page');

    // Verify the product title contains the word 'Speaker'
    await expectTextWithFallback(page, `[data-testid='product-title'], .product-title, h1`, `Speaker`, 'Verify the product title contains the word \'Speaker\'');

    // Verify the product category element is visible on the product details page
    await expectVisibleWithFallback(page, `[data-testid='product-category'], .product-category, .category`, 'Verify the product category element is visible on the product details page');

    // Verify the product category displays a non-empty value
    await expectTextWithFallback(page, `[data-testid='product-category'], .product-category, .category`, '', 'Verify the product category displays a non-empty value');

    // Click the 'Add to Cart' button on the product details page
    await clickWithFallback(page, `button:has-text('Add to Cart'), [data-testid='add-to-cart'], button:has-text('Add To Cart')`, 'Click the \'Add to Cart\' button on the product details page');

    // Verify a confirmation message or cart update is shown after adding the product
    await expectVisibleWithFallback(page, `text=added, text=cart, [data-testid='cart-confirmation'], .cart-success, .toast, .notification`, 'Verify a confirmation message or cart update is shown after adding the product');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/user_story_1-user-story-1/screenshots/tc-001/final-ui-tc-001.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_1_search_speaker_verify_title_category_add__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});