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

test('Search Arc Mechanical Keyboard and Add to Cart', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app/');

    // Navigate to the application homepage
    await page.goto('/demo_app/');

    // Wait for the search bar to be visible on the page
    await waitForWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, 'Wait for the search bar to be visible on the page');

    // Click on the search bar to activate it
    await clickWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, 'Click on the search bar to activate it');

    // Type 'Arc Mechanical Keyboard' into the search input field
    await fillWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, `Arc Mechanical Keyboard`, 'Type \'Arc Mechanical Keyboard\' into the search input field');

    // Press Enter to submit the search query
    await pressWithFallback(page, `input[type='search'], input[placeholder*='Search'], input[name='search']`, `Enter`, 'Press Enter to submit the search query');

    // Wait for search results to load and display Arc Mechanical Keyboard
    await waitForWithFallback(page, `text=Arc Mechanical Keyboard`, 'Wait for search results to load and display Arc Mechanical Keyboard');

    // Assert that Arc Mechanical Keyboard appears in search results
    await expectVisibleWithFallback(page, `text=Arc Mechanical Keyboard`, 'Assert that Arc Mechanical Keyboard appears in search results');

    // Click the Details button on the Arc Mechanical Keyboard product card to open the product detail page
    await clickWithFallback(page, `button:has-text('Details')`, 'Click the Details button on the Arc Mechanical Keyboard product card to open the product detail page');

    // Wait for the product detail page heading to confirm correct page loaded
    await waitForWithFallback(page, `h1:has-text('Arc Mechanical Keyboard')`, 'Wait for the product detail page heading to confirm correct page loaded');

    // Assert the product detail page shows the correct product name
    await expectVisibleWithFallback(page, `h1:has-text('Arc Mechanical Keyboard')`, 'Assert the product detail page shows the correct product name');

    // Click the Add to Cart button on the product detail page
    await clickWithFallback(page, `button:has-text('Add to Cart')`, 'Click the Add to Cart button on the product detail page');

    // Wait for cart confirmation feedback after adding item
    await waitForWithFallback(page, `text=Item added, text=Added to cart, text=Successfully added, [data-testid='cart-count'], .cart-badge`, 'Wait for cart confirmation feedback after adding item');

    // Click the cart icon or link to navigate to the shopping cart
    await clickWithFallback(page, `[data-testid='cart-icon'], .cart-icon, a[href*='cart'], button[aria-label*='cart']`, 'Click the cart icon or link to navigate to the shopping cart');

    // Wait for the cart page to load and show the added product
    await waitForWithFallback(page, `text=Arc Mechanical Keyboard`, 'Wait for the cart page to load and show the added product');

    // Assert that Arc Mechanical Keyboard is listed in the cart
    await expectVisibleWithFallback(page, `text=Arc Mechanical Keyboard`, 'Assert that Arc Mechanical Keyboard is listed in the cart');

    // Verify the product name in the cart matches Arc Mechanical Keyboard
    await expectTextWithFallback(page, `text=Arc Mechanical Keyboard`, `Arc Mechanical Keyboard`, 'Verify the product name in the cart matches Arc Mechanical Keyboard');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/user_story_1-cli-input/screenshots/tc-001/final-ui-tc-001.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_1_search_arc_mechanical_keyboard_and_add__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});