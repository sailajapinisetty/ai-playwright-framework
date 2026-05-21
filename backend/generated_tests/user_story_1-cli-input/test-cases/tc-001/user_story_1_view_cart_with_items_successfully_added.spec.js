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

test('View cart with items successfully added', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app/');

    // Navigate to the homepage
    await page.goto('/demo_app/');

    // Wait for the main content area to be visible
    await waitForWithFallback(page, `role=main`, 'Wait for the main content area to be visible');

    // Click 'Add to Cart' on the first available product
    await clickWithFallback(page, `role=button[name=/add to cart/i]`, 'Click \'Add to Cart\' on the first available product');

    // Wait for the nav cart link to update after adding item
    await waitForWithFallback(page, `[data-testid='nav-cart']`, 'Wait for the nav cart link to update after adding item');

    // Verify the cart navigation link is visible in the header
    await expectVisibleWithFallback(page, `[data-testid='nav-cart']`, 'Verify the cart navigation link is visible in the header');

    // Click the cart icon/link in the navigation header
    await clickWithFallback(page, `[data-testid='nav-cart']`, 'Click the cart icon/link in the navigation header');

    // Wait for URL to change to the cart page
    await waitForWithFallback(page, `url=/cart/`, 'Wait for URL to change to the cart page');

    // Verify the cart page heading is visible
    await expectVisibleWithFallback(page, `role=heading[name=/cart/i]`, 'Verify the cart page heading is visible');

    // Verify the cart items list is visible
    await expectVisibleWithFallback(page, `role=list`, 'Verify the cart items list is visible');

    // Verify at least one cart item is displayed
    await expectVisibleWithFallback(page, `role=listitem`, 'Verify at least one cart item is displayed');

    // Verify product name is visible in cart item
    await expectVisibleWithFallback(page, `[data-testid='cart-item-name']`, 'Verify product name is visible in cart item');

    // Verify product quantity is visible in cart item
    await expectVisibleWithFallback(page, `[data-testid='cart-item-quantity']`, 'Verify product quantity is visible in cart item');

    // Verify unit price is visible in cart item
    await expectVisibleWithFallback(page, `[data-testid='cart-item-price']`, 'Verify unit price is visible in cart item');

    // Verify the subtotal/total section is visible in the cart
    await expectVisibleWithFallback(page, `[data-testid='cart-subtotal']`, 'Verify the subtotal/total section is visible in the cart');

    // Verify the subtotal displays a dollar amount with currency symbol
    await expectTextWithFallback(page, `[data-testid='cart-subtotal']`, `\$`, 'Verify the subtotal displays a dollar amount with currency symbol');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/user_story_1-cli-input/screenshots/tc-001/final-ui-tc-001.png', fullPage: true });
      await page.screenshot({ path: `test-results/user_story_1_view_cart_with_items_successfully_added__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});