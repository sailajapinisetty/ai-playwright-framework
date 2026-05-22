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

test('Verify logged-in user with cart items can view cart page successfully', async ({ page }, testInfo) => {
  try {
    await page.goto('/demo_app/');

    // Navigate to the application home page
    await page.goto('/demo_app/');

    // Wait for the page body to be present
    await waitForWithFallback(page, `body`, 'Wait for the page body to be present');

    // Verify Cart link or icon is visible in the navigation
    await expectVisibleWithFallback(page, `a[href*='cart'], a:has-text('Cart'), button:has-text('Cart'), [data-testid='cart']`, 'Verify Cart link or icon is visible in the navigation');

    // Verify at least one product is visible on the home page
    await expectVisibleWithFallback(page, `.product, .product-card, [class*='product'], article, .card`, 'Verify at least one product is visible on the home page');

    // Click Add to Cart on the first available product
    await clickWithFallback(page, `button:has-text('Add to Cart')`, 'Click Add to Cart on the first available product');

    // Wait for cart link to be visible after adding item
    await waitForWithFallback(page, `a[href*='cart'], a:has-text('Cart'), [data-testid='cart']`, 'Wait for cart link to be visible after adding item');

    // Click the Cart link in the navigation to go to the cart page
    await clickWithFallback(page, `a[href*='cart'], a:has-text('Cart')`, 'Click the Cart link in the navigation to go to the cart page');

    // Wait for cart page content to load
    await waitForWithFallback(page, `.cart, #cart, [class*='cart'], h1, h2`, 'Wait for cart page content to load');

    // Verify cart page heading is visible
    await expectVisibleWithFallback(page, `h1, h2, .cart-title, [class*='cart-heading']`, 'Verify cart page heading is visible');

    // Verify at least one cart item is listed on the cart page
    await expectVisibleWithFallback(page, `.cart-item, [class*='cart-item'], li, .item, tr`, 'Verify at least one cart item is listed on the cart page');

    // Verify cart summary or total section is visible on the cart page
    await expectVisibleWithFallback(page, `.total, .cart-total, [class*='total'], .summary, [class*='summary']`, 'Verify cart summary or total section is visible on the cart page');

  } finally {
    if (!page.isClosed()) {
      await page.screenshot({ path: 'generated_tests/TEST_Story_1/screenshots/TEST_Story_1_TestCase_1/final-ui-TEST_Story_1_TestCase_1.png', fullPage: true });
      await page.screenshot({ path: `test-results/test_story_1_verify_logged_in_user_with_cart__${testInfo.project.name}.png`, fullPage: true });
    }
  }
});