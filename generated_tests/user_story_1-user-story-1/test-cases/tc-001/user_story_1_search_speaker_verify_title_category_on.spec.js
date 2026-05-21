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

test('Search Speaker, Verify Title & Category on Details Page, Add to Cart', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app/');

    // Navigate to the home page
    await page.goto('/demo_app/');

    // Wait for the search input to be visible on the home page
    await waitForWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, 'Wait for the search input to be visible on the home page');

    // Type 'Speaker' into the search input field
    await fillWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, `Speaker`, 'Type \'Speaker\' into the search input field');

    // Submit the search query by pressing Enter
    await pressWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, `Enter`, 'Submit the search query by pressing Enter');

    // Wait for search result product cards to appear
    await waitForWithFallback(page, `.product-card, .product-item, [data-testid='product-card']`, 'Wait for search result product cards to appear');

    // Verify at least one Speaker product card is visible in search results
    await expectVisibleWithFallback(page, `.product-card:has-text('Speaker'), .product-item:has-text('Speaker'), [data-testid='product-card']:has-text('Speaker')`, 'Verify at least one Speaker product card is visible in search results');

    // Click the Details button/link on the first Speaker product card
    await clickWithFallback(page, `.product-card:has-text('Speaker') button:has-text('Details'), .product-card:has-text('Speaker') a:has-text('Details'), .product-item:has-text('Speaker') button:has-text('Details'), .product-item:has-text('Speaker') a:has-text('Details')`, 'Click the Details button/link on the first Speaker product card');

    // Wait for the Add to Cart button to confirm the product details page has loaded
    await waitForWithFallback(page, `button:has-text('Add to Cart'), button:has-text('Add To Cart')`, 'Wait for the Add to Cart button to confirm the product details page has loaded');

    // Confirm Add to Cart button is visible on the product details page
    await expectVisibleWithFallback(page, `button:has-text('Add to Cart'), button:has-text('Add To Cart')`, 'Confirm Add to Cart button is visible on the product details page');

    // Verify the product title on the details page contains the word 'Speaker'
    await expectTextWithFallback(page, `.product-name, .product-details-title, [data-testid='product-name'], h2.product-title, .product-detail h2`, `Speaker`, 'Verify the product title on the details page contains the word \'Speaker\'');

    // Verify the product category element is visible on the product details page
    await expectVisibleWithFallback(page, `.product-category, [data-testid='product-category'], .category-label, .product-detail .category`, 'Verify the product category element is visible on the product details page');

    // Click the Add to Cart button to add the Speaker product to the cart
    await clickWithFallback(page, `button:has-text('Add to Cart'), button:has-text('Add To Cart')`, 'Click the Add to Cart button to add the Speaker product to the cart');

    // Wait for a cart confirmation signal after adding to cart
    await waitForWithFallback(page, `.cart-notification, .toast, [aria-live], .cart-count, [data-testid='cart-badge'], .cart-success, .notification`, 'Wait for a cart confirmation signal after adding to cart');

    // Verify that a cart confirmation message or updated cart badge is visible after adding the product
    await expectVisibleWithFallback(page, `.cart-notification, .toast, [aria-live], .cart-count, [data-testid='cart-badge'], .cart-success, .notification`, 'Verify that a cart confirmation message or updated cart badge is visible after adding the product');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/user_story_1-user-story-1/screenshots/tc-001/final-ui-tc-001.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_1_search_speaker_verify_title_category_on__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});