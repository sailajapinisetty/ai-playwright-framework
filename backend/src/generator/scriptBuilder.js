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

function toPosixPath(value = '') {
  return String(value).replace(/\\/g, '/');
}

function toImportPath(fromDir, targetPath) {
  const relativePath = toPosixPath(path.relative(fromDir, targetPath));
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function sanitizeTag(tag) {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTaggedTitle(title, suiteTags = []) {
  const safeTitle = String(title || 'AI generated test').trim() || 'AI generated test';
  const tags = new Set();
  const preferredTags = Array.isArray(suiteTags) ? suiteTags : ['ai', 'regression'];

  for (const rawTag of preferredTags) {
    const normalized = sanitizeTag(rawTag);
    if (normalized) {
      tags.add(`@${normalized}`);
    }
  }

  const tagSuffix = [...tags].join(' ');
  return tagSuffix ? `${safeTitle} ${tagSuffix}` : safeTitle;
}

function stepToCode(step) {
  const action = step.action;
  const selector = step.selector ? toJsString(step.selector) : null;
  const value = step.value ? toJsString(step.value) : null;
  const description = toJsString(step.description || '');

  switch (action) {
    case 'goto':
      return `await app.gotoTarget(${toJsString(toPreferredGotoTarget(step.value || config.appUrl))});`;
    case 'click':
      return `await app.click(${selector || "''"}, ${description});`;
    case 'fill':
      return `await app.fill(${selector || "''"}, ${value || "''"}, ${description});`;
    case 'press':
      return `await app.press(${selector || "''"}, ${value || "'Enter'"}, ${description});`;
    case 'waitFor':
      return `await app.waitForVisible(${selector || "''"}, ${description});`;
    case 'assertVisible':
      return `await app.expectVisible(${selector || "''"}, ${description});`;
    case 'assertText':
      return `await app.expectText(${selector || "''"}, ${value || "''"}, ${description});`;
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
  const taggedTitle = buildTaggedTitle(plan.title, options.suiteTags);
  const fixturePath = path.resolve(process.cwd(), 'playwright-tests', 'framework', 'fixtures', 'testFixtures.js');
  const fixtureImportPath = toImportPath(path.dirname(filePath), fixturePath);

  const lines = [];
  lines.push(`import { test } from '${esc(fixtureImportPath)}';`);
  lines.push('');
  lines.push(`test('${esc(taggedTitle)}', async ({ app }, testInfo) => {`);
  lines.push('  try {');
  lines.push(`    await app.gotoTarget('${esc(toPreferredGotoTarget(plan.url || config.appUrl))}');`);
  lines.push('');

  for (const step of plan.steps) {
    if (step.description) {
      lines.push(`    // ${esc(step.description)}`);
    }
    lines.push(`    ${stepToCode(step)}`);
    lines.push('');
  }

  lines.push('  } finally {');
  lines.push('    if (!app.page.isClosed()) {');
  lines.push(`      await app.page.screenshot({ path: '${esc(screenshotPath)}', fullPage: true });`);
  if (resultNameBase) {
    lines.push(`      await app.page.screenshot({ path: \`test-results/${esc(resultNameBase)}__\${testInfo.project.name}.png\`, fullPage: true });`);
  }
  lines.push('    }');
  lines.push('  }');
  lines.push('});');

  await fs.writeFile(filePath, lines.join('\n'));
  return filePath;
}
