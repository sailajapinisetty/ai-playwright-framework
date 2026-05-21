import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const appBaseUrl = new URL(config.appUrl);

function esc(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

function toJsString(value = '') {
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")}'`;
}

function toPreferredGotoTarget(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '/';
  }

  if (text.startsWith('/')) {
    return text;
  }

  try {
    const parsed = new URL(text);
    if (parsed.origin === appBaseUrl.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    }
  } catch {
    // Keep the original input for non-URL strings.
  }

  return text;
}

function stepToCode(step) {
  const action = step.action;
  const selector = step.selector ? `\`${esc(step.selector)}\`` : null;
  const value = step.value ? `\`${esc(step.value)}\`` : null;
  const description = toJsString(step.description || '');

  switch (action) {
    case 'goto':
      return `await page.goto(${toJsString(toPreferredGotoTarget(step.value || config.appUrl))});`;
    case 'click':
      return `await clickWithFallback(page, ${selector || "''"}, ${description});`;
    case 'fill':
      return `await fillWithFallback(page, ${selector || "''"}, ${value || "''"}, ${description});`;
    case 'press':
      return `await pressWithFallback(page, ${selector || "''"}, ${value || "'Enter'"}, ${description});`;
    case 'waitFor':
      return `await waitForWithFallback(page, ${selector || "''"}, ${description});`;
    case 'assertVisible':
      return `await expectVisibleWithFallback(page, ${selector || "''"}, ${description});`;
    case 'assertText':
      return `await expectTextWithFallback(page, ${selector || "''"}, ${value || "''"}, ${description});`;
    default:
      return `// Unsupported action from AI: ${esc(action)};`;
  }
}

export async function buildPlaywrightScript(plan, options = {}) {
  const generatedDir = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : path.resolve(process.cwd(), 'generated_tests');
  await fs.mkdir(generatedDir, { recursive: true });

  const nameSource = options.fileNameHint || plan.title;
  const safeName = String(nameSource || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const fileName = `${safeName || 'ai-generated'}.spec.js`;
  const filePath = path.join(generatedDir, fileName);
  const screenshotPath = options.screenshotPath || 'artifacts/final-ui.png';
  const resultNameBase = options.resultNameBase || null;

  const lines = [];
  lines.push("import { test, expect } from '@playwright/test';");
  lines.push('');
  lines.push('function parseRoleSelector(selector) {');
  lines.push('  const match = String(selector || "").match(/^role=([a-z]+)(?:\\[name(\\*?)=[\'\"](.+?)[\'\"]\\])?$/i);');
  lines.push('  if (!match) return null;');
  lines.push('  return { role: match[1], isPartial: match[2] === "*", name: match[3] || "" };');
  lines.push('}');
  lines.push('');
  lines.push('function textPattern(value) {');
  lines.push('  const escaped = String(value || "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");');
  lines.push('  return new RegExp(escaped, "i");');
  lines.push('}');
  lines.push('');
  lines.push('async function firstExisting(candidates) {');
  lines.push('  for (const locator of candidates) {');
  lines.push('    if (!locator) continue;');
  lines.push('    try {');
  lines.push('      if (await locator.count()) return locator.first();');
  lines.push('    } catch {');
  lines.push('      // Ignore malformed locator candidates and continue to fallback options.');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return null;');
  lines.push('}');
  lines.push('');
  lines.push('function semanticCandidates(page, hint) {');
  lines.push('  const text = String(hint || "").toLowerCase();');
  lines.push('  const candidates = [];');
  lines.push('');
  lines.push('  if (text.includes("search")) {');
  lines.push('    candidates.push(page.getByRole("searchbox", { name: /search/i }));');
  lines.push('    candidates.push(page.getByPlaceholder(/search/i));');
  lines.push('    candidates.push(page.getByLabel(/search/i));');
  lines.push('    candidates.push(page.locator("input[type=\\"search\\"], input[placeholder*=\\"search\\" i], input[aria-label*=\\"search\\" i]"));');
  lines.push('  }');
  lines.push('');
  lines.push('  if (text.includes("view details") || text.includes("details")) {');
  lines.push('    candidates.push(page.getByRole("link", { name: /details|view details/i }));');
  lines.push('  }');
  lines.push('');
  lines.push('  if (text.includes("add to cart") || text.includes("add")) {');
  lines.push('    candidates.push(page.getByRole("button", { name: /add to cart|add/i }));');
  lines.push('  }');
  lines.push('');
  lines.push('  if (text.includes("cart")) {');
  lines.push('    candidates.push(page.getByRole("link", { name: /cart/i }));');
  lines.push('  }');
  lines.push('');
  lines.push('  return candidates;');
  lines.push('}');
  lines.push('');
  lines.push('async function resolveLocator(page, selector, description) {');
  lines.push('  const selectorText = String(selector || "").trim();');
  lines.push('  const descriptionText = String(description || "").trim();');
  lines.push('  const candidates = [];');
  lines.push('');
  lines.push('  if (selectorText) {');
  lines.push('    candidates.push(page.locator(selectorText));');
  lines.push('');
  lines.push('    const roleInfo = parseRoleSelector(selectorText);');
  lines.push('    if (roleInfo) {');
  lines.push('      if (roleInfo.name) {');
  lines.push('        candidates.push(page.getByRole(roleInfo.role, { name: roleInfo.isPartial ? textPattern(roleInfo.name) : roleInfo.name }));');
  lines.push('      } else {');
  lines.push('        candidates.push(page.getByRole(roleInfo.role));');
  lines.push('      }');
  lines.push('    }');
  lines.push('');
  lines.push('    if (selectorText.startsWith("text=")) {');
  lines.push('      candidates.push(page.getByText(selectorText.slice(5)));');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push('  candidates.push(...semanticCandidates(page, `${selectorText} ${descriptionText}`));');
  lines.push('');
  lines.push('  const resolved = await firstExisting(candidates);');
  lines.push('  if (!resolved) {');
  lines.push('    throw new Error(`Unable to resolve locator. selector="${selectorText}" description="${descriptionText}"`);');
  lines.push('  }');
  lines.push('  return resolved;');
  lines.push('}');
  lines.push('');
  lines.push('async function clickWithFallback(page, selector, description) {');
  lines.push('  const locator = await resolveLocator(page, selector, description);');
  lines.push('  await locator.click();');
  lines.push('}');
  lines.push('');
  lines.push('async function fillWithFallback(page, selector, value, description) {');
  lines.push('  const locator = await resolveLocator(page, selector, description);');
  lines.push('  await locator.fill(value);');
  lines.push('}');
  lines.push('');
  lines.push('async function pressWithFallback(page, selector, key, description) {');
  lines.push('  const locator = await resolveLocator(page, selector, description);');
  lines.push('  await locator.press(key);');
  lines.push('}');
  lines.push('');
  lines.push('async function waitForWithFallback(page, selector, description) {');
  lines.push('  const locator = await resolveLocator(page, selector, description);');
  lines.push('  await expect(locator).toBeVisible();');
  lines.push('}');
  lines.push('');
  lines.push('async function expectVisibleWithFallback(page, selector, description) {');
  lines.push('  const locator = await resolveLocator(page, selector, description);');
  lines.push('  await expect(locator).toBeVisible();');
  lines.push('}');
  lines.push('');
  lines.push('async function expectTextWithFallback(page, selector, value, description) {');
  lines.push('  const locator = await resolveLocator(page, selector, description);');
  lines.push('  await expect(locator).toContainText(value);');
  lines.push('}');
  lines.push('');
  lines.push(`test('${esc(plan.title)}', async ({ page }, testInfo) => {`);
  lines.push('  try {');
  lines.push(`    await page.goto('${esc(toPreferredGotoTarget(plan.url || config.appUrl))}');`);
  lines.push('');

  for (const step of plan.steps) {
    if (step.description) {
      lines.push(`    // ${esc(step.description)}`);
    }
    lines.push(`    ${stepToCode(step)}`);
    lines.push('');
  }

  lines.push('  } finally {');
  lines.push('    if (!page.isClosed()) {');
  lines.push(`      await page.screenshot({ path: '${esc(screenshotPath)}', fullPage: true });`);
  if (resultNameBase) {
    lines.push(`      await page.screenshot({ path: \`test-results/${esc(resultNameBase)}__\${testInfo.project.name}.png\`, fullPage: true });`);
  }
  lines.push('    }');
  lines.push('  }');
  lines.push('});');

  await fs.writeFile(filePath, lines.join('\n'));
  return filePath;
}
