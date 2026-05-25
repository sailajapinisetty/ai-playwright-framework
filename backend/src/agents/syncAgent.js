import { syncGeneratedTestsToExternalSuite, parseBoolean } from '../tools/syncGeneratedTests.js';
import { spawn } from 'child_process';

export function isSyncAgentEnabled() {
  return parseBoolean(process.env.SYNC_AGENT_ENABLED, false);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      shell: false,
      env: process.env
    });

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    proc.on('error', (error) => reject(error));
    proc.on('close', (code) => {
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
      if (code === 0 || options.allowFailure) {
        resolve(result);
        return;
      }

      reject(new Error(result.stderr || result.stdout || `${command} exited with code ${code}`));
    });
  });
}

async function detectBranch(cwd) {
  const result = await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  return String(result.stdout || '').trim();
}

function sanitizeBranchSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '') || 'sync';
}

function buildPrBranchName(sourceBranch) {
  const explicit = String(process.env.SYNC_GIT_PR_BRANCH || '').trim();
  if (explicit) {
    return explicit;
  }

  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `sync/generated-tests/${sanitizeBranchSegment(sourceBranch)}/${ts}`;
}

async function commandExists(commandName, cwd) {
  const result = await runCommand('which', [commandName], { cwd, allowFailure: true });
  return result.code === 0;
}

async function getOriginRemoteUrl(cwd) {
  const result = await runCommand('git', ['remote', 'get-url', 'origin'], { cwd, allowFailure: true });
  if (result.code !== 0) {
    return '';
  }

  return String(result.stdout || '').trim();
}

function toHttpsRepoUrl(remoteUrl) {
  const value = String(remoteUrl || '').trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.replace(/\.git$/, '');
  }

  const sshMatch = value.match(/^git@github\.com:(.+)\.git$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`;
  }

  const sshNoGitMatch = value.match(/^git@github\.com:(.+)$/);
  if (sshNoGitMatch) {
    return `https://github.com/${sshNoGitMatch[1].replace(/\.git$/, '')}`;
  }

  return '';
}

function resolveTargetSubdirForBranch({ sourceBranch, explicitTargetSubdir }) {
  if (explicitTargetSubdir) {
    return explicitTargetSubdir;
  }

  const rawMap = String(process.env.SYNC_TARGET_SUBDIR_MAP || '').trim();
  if (!rawMap) {
    return '';
  }

  let mapping;
  try {
    mapping = JSON.parse(rawMap);
  } catch {
    throw new Error('SYNC_TARGET_SUBDIR_MAP must be valid JSON. Example: {"main":"tests/release","feature/*":"tests/dev"}');
  }

  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('SYNC_TARGET_SUBDIR_MAP must be a JSON object.');
  }

  if (mapping[sourceBranch]) {
    return String(mapping[sourceBranch] || '').trim();
  }

  for (const [pattern, value] of Object.entries(mapping)) {
    if (!pattern.endsWith('*')) {
      continue;
    }

    const prefix = pattern.slice(0, -1);
    if (sourceBranch.startsWith(prefix)) {
      return String(value || '').trim();
    }
  }

  if (mapping.default) {
    return String(mapping.default || '').trim();
  }

  return '';
}

async function runGitSyncActions(syncResult, sourceBranch) {
  const autoCommit = parseBoolean(process.env.SYNC_GIT_AUTO_COMMIT, false);
  const autoPush = parseBoolean(process.env.SYNC_GIT_AUTO_PUSH, false);
  const createPr = parseBoolean(process.env.SYNC_GIT_CREATE_PR, false);
  const prBaseBranch = String(process.env.SYNC_GIT_PR_BASE_BRANCH || 'main').trim() || 'main';

  if (createPr && (!autoCommit || !autoPush)) {
    throw new Error('SYNC_GIT_CREATE_PR=true requires SYNC_GIT_AUTO_COMMIT=true and SYNC_GIT_AUTO_PUSH=true.');
  }

  if (!autoCommit && !autoPush) {
    return {
      enabled: false,
      committed: false,
      pushed: false,
      commitSha: '',
      pushBranch: '',
      createPr,
      prCreated: false,
      prUrl: '',
      prHeadBranch: ''
    };
  }

  const targetRoot = syncResult.targetRoot;
  const addPath = syncResult.targetSubdir;
  await runCommand('git', ['rev-parse', '--is-inside-work-tree'], { cwd: targetRoot });
  await runCommand('git', ['add', '--', addPath], { cwd: targetRoot });

  const staged = await runCommand('git', ['diff', '--cached', '--name-only', '--', addPath], { cwd: targetRoot });
  const hasStagedChanges = Boolean(String(staged.stdout || '').trim());
  let committed = false;
  let commitSha = '';
  const currentTargetBranch = await detectBranch(targetRoot);
  const prHeadBranch = createPr ? buildPrBranchName(sourceBranch) : '';

  if (createPr) {
    await runCommand('git', ['checkout', '-B', prHeadBranch], { cwd: targetRoot });
  }

  if (hasStagedChanges && autoCommit) {
    const defaultMessage = `chore(tests): sync generated playwright tests from ${sourceBranch}`;
    const commitMessage = String(process.env.SYNC_GIT_COMMIT_MESSAGE || defaultMessage).trim() || defaultMessage;
    await runCommand('git', ['commit', '-m', commitMessage], { cwd: targetRoot });
    const shaResult = await runCommand('git', ['rev-parse', '--short', 'HEAD'], { cwd: targetRoot });
    commitSha = String(shaResult.stdout || '').trim();
    committed = true;
  }

  let pushed = false;
  let pushBranch = '';
  if (autoPush) {
    if (!committed) {
      return {
        enabled: true,
        committed,
        pushed,
        commitSha,
        pushBranch,
        createPr,
        prCreated: false,
        prUrl: '',
        prHeadBranch
      };
    }

    const configuredPushBranch = String(process.env.SYNC_GIT_PUSH_BRANCH || '').trim();
    if (createPr) {
      pushBranch = prHeadBranch;
    } else {
      pushBranch = configuredPushBranch || await detectBranch(targetRoot);
    }
    await runCommand('git', ['push', 'origin', `HEAD:${pushBranch}`], { cwd: targetRoot });
    pushed = true;
  }

  let prCreated = false;
  let prUrl = '';
  if (createPr && pushed) {
    const ghAvailable = await commandExists('gh', targetRoot);
    const repoUrl = toHttpsRepoUrl(await getOriginRemoteUrl(targetRoot));

    if (ghAvailable) {
      const titleDefault = `chore(tests): sync generated suite from ${sourceBranch}`;
      const title = String(process.env.SYNC_GIT_PR_TITLE || titleDefault).trim() || titleDefault;
      const bodyDefault = [
        'Automated sync of generated Playwright tests from AI framework.',
        '',
        `Source branch: ${sourceBranch}`,
        `Synced folder: ${syncResult.targetSubdir}`
      ].join('\n');
      const body = String(process.env.SYNC_GIT_PR_BODY || bodyDefault);
      const prResult = await runCommand(
        'gh',
        ['pr', 'create', '--head', prHeadBranch, '--base', prBaseBranch, '--title', title, '--body', body],
        { cwd: targetRoot, allowFailure: true }
      );

      if (prResult.code === 0) {
        prCreated = true;
        prUrl = String(prResult.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
      }
    }

    if (!prUrl && repoUrl) {
      prUrl = `${repoUrl}/compare/${prBaseBranch}...${prHeadBranch}?expand=1`;
    }
  }

  if (createPr) {
    await runCommand('git', ['checkout', currentTargetBranch], { cwd: targetRoot, allowFailure: true });
  }

  return {
    enabled: true,
    committed,
    pushed,
    commitSha,
    pushBranch,
    createPr,
    prCreated,
    prUrl,
    prHeadBranch
  };
}

export async function syncAgentRun(options = {}) {
  const startedAt = new Date().toISOString();
  const sourceBranch = String(process.env.SYNC_SOURCE_BRANCH || '').trim() || await detectBranch(process.cwd());
  const mappedTargetSubdir = resolveTargetSubdirForBranch({
    sourceBranch,
    explicitTargetSubdir: options.targetSubdir || process.env.SYNC_TARGET_SUBDIR
  });

  const result = await syncGeneratedTestsToExternalSuite({
    ...options,
    targetSubdir: mappedTargetSubdir || options.targetSubdir || process.env.SYNC_TARGET_SUBDIR
  });
  const gitResult = await runGitSyncActions(result, sourceBranch);

  return {
    status: 'SUCCESS',
    startedAt,
    completedAt: new Date().toISOString(),
    sourceBranch,
    git: gitResult,
    ...result
  };
}
