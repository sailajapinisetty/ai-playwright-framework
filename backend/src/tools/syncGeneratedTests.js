import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export function parseBoolean(value, fallbackValue = false) {
  if (value === undefined || value === null || value === '') {
    return fallbackValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallbackValue;
}

function toRelativeDisplayPath(absPath, repoRoot) {
  return path.relative(repoRoot, absPath) || '.';
}

async function assertDirectoryExists(dirPath, label) {
  const stats = await fs.stat(dirPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${dirPath}`);
  }
}

function isMetadataFile(fileName) {
  return fileName === 'manual-test-cases.json'
    || fileName === 'manual-test-cases.md'
    || fileName === 'automation-selection.json'
    || fileName === 'multi-agent-summary.json'
    || fileName === 'multi-agent-history.json'
    || fileName === 'multi-agent-dashboard.md';
}

async function removeMetadataFiles(rootDir) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (isMetadataFile(entry.name)) {
        await fs.rm(entryPath, { force: true });
      }
    }
  }
}

export async function syncGeneratedTestsToExternalSuite(options = {}) {
  const repoRoot = path.resolve(process.cwd());
  const sourceRoot = path.resolve(repoRoot, 'backend', 'generated_tests');
  const targetRootInput = String(options.targetDir || process.env.SYNC_TARGET_DIR || '').trim();

  if (!targetRootInput) {
    throw new Error('SYNC_TARGET_DIR is required. Example: SYNC_TARGET_DIR="../playwright-manual-suite" npm run sync:tester-suite');
  }

  const targetRoot = path.resolve(repoRoot, targetRootInput);
  const targetSubdir = String(options.targetSubdir || process.env.SYNC_TARGET_SUBDIR || 'generated_tests').trim() || 'generated_tests';
  const includeMetadata = parseBoolean(options.includeMetadata ?? process.env.SYNC_INCLUDE_SELECTION_FILES, true);
  const cleanTarget = parseBoolean(options.cleanTarget ?? process.env.SYNC_CLEAN_TARGET, false);
  const targetGeneratedTestsDir = path.resolve(targetRoot, targetSubdir);

  await assertDirectoryExists(sourceRoot, 'Source generated_tests folder');
  await assertDirectoryExists(targetRoot, 'SYNC_TARGET_DIR');

  if (cleanTarget) {
    await fs.rm(targetGeneratedTestsDir, { recursive: true, force: true });
  }

  await fs.mkdir(targetGeneratedTestsDir, { recursive: true });
  await fs.cp(sourceRoot, targetGeneratedTestsDir, { recursive: true, force: true });

  if (!includeMetadata) {
    await removeMetadataFiles(targetGeneratedTestsDir);
  }

  return {
    source: sourceRoot,
    target: targetGeneratedTestsDir,
    targetRoot,
    targetSubdir,
    sourceDisplay: toRelativeDisplayPath(sourceRoot, repoRoot),
    targetDisplay: toRelativeDisplayPath(targetGeneratedTestsDir, repoRoot),
    cleanTarget,
    includeMetadata
  };
}
