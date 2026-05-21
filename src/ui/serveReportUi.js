import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { buildReportData } from './buildReportData.js';

const rootDir = process.cwd();
const reportUiDir = path.join(rootDir, 'report-ui');
const envFilePath = path.join(rootDir, '.env');
const port = Number(process.env.REPORT_UI_PORT || 4173);
const uiHistoryPath = path.join(reportUiDir, 'data', 'ui-run-history.json');
let isRunInProgress = false;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
};

function contentType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
  res.end(JSON.stringify(payload));
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function validateUrlReachability(appUrl) {
  if (!isHttpUrl(appUrl)) {
    return {
      ok: false,
      message: 'URL is invalid. Enter a valid http/https URL.'
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(appUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `URL responded with status ${response.status}.`
      };
    }

    return { ok: true, message: '' };
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? 'request timed out'
      : (error?.message || 'unreachable URL');

    return {
      ok: false,
      message: `URL is not reachable: ${reason}.`
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listDirectories(dirPath) {
  if (!(await pathExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function readJsonFileIfExists(filePath, fallbackValue) {
  if (!(await pathExists(filePath))) {
    return fallbackValue;
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readManualTestCases() {
  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const storyFolders = await listDirectories(generatedTestsDir);
  const items = [];

  for (const storyFolder of storyFolders) {
    const storyDir = path.join(generatedTestsDir, storyFolder);
    const manualPath = path.join(storyDir, 'manual-test-cases.json');
    const manualCatalog = await readJsonFileIfExists(manualPath, {});
    const testCases = Array.isArray(manualCatalog?.testCases) ? manualCatalog.testCases : [];
    const storyTitle = String(manualCatalog?.storyTitle || storyFolder);

    for (const testCase of testCases) {
      items.push({
        storyFolder,
        storyTitle,
        caseId: String(testCase?.id || ''),
        title: String(testCase?.title || ''),
        type: String(testCase?.type || ''),
        priority: String(testCase?.priority || ''),
        expectedResult: String(testCase?.expectedResult || ''),
        automationReason: String(testCase?.automationReason || '')
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    storyCount: storyFolders.length,
    totalCases: items.length,
    items
  };
}

function buildManualCasesCsv(manualData) {
  const header = [
    'Story Folder',
    'Story Title',
    'Case ID',
    'Title',
    'Type',
    'Priority',
    'Expected Result',
    'Automation Reason'
  ];

  const rows = manualData.items.map((item) => [
    item.storyFolder,
    item.storyTitle,
    item.caseId,
    item.title,
    item.type,
    item.priority,
    item.expectedResult,
    item.automationReason
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function buildManualCasesWordHtml(manualData) {
  const rows = manualData.items.map((item) => `
    <tr>
      <td>${htmlEscape(item.storyFolder)}</td>
      <td>${htmlEscape(item.storyTitle)}</td>
      <td>${htmlEscape(item.caseId)}</td>
      <td>${htmlEscape(item.title)}</td>
      <td>${htmlEscape(item.type)}</td>
      <td>${htmlEscape(item.priority)}</td>
      <td>${htmlEscape(item.expectedResult)}</td>
      <td>${htmlEscape(item.automationReason)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Manual Test Cases</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      h1 { margin-bottom: 8px; }
      p { color: #555; margin-top: 0; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f2f2f2; }
    </style>
  </head>
  <body>
    <h1>Manual Test Cases</h1>
    <p>Generated: ${htmlEscape(manualData.generatedAt)} | Total Cases: ${htmlEscape(manualData.totalCases)}</p>
    <table>
      <thead>
        <tr>
          <th>Story Folder</th>
          <th>Story Title</th>
          <th>Case ID</th>
          <th>Title</th>
          <th>Type</th>
          <th>Priority</th>
          <th>Expected Result</th>
          <th>Automation Reason</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
}

async function readRunHistory() {
  if (!(await pathExists(uiHistoryPath))) {
    return [];
  }

  try {
    const raw = await fs.readFile(uiHistoryPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendRunHistory(entry) {
  const history = await readRunHistory();
  history.unshift(entry);
  const recent = history.slice(0, 100);
  await fs.mkdir(path.dirname(uiHistoryPath), { recursive: true });
  await fs.writeFile(uiHistoryPath, JSON.stringify(recent, null, 2));
}

async function appendPrecheckFailure({ reason, appUrl, userStory }) {
  const now = new Date().toISOString();
  const entry = {
    runId: `run_${Date.now()}`,
    startedAt: now,
    finishedAt: now,
    status: 'FAIL',
    exitCode: -1,
    outputTail: String(reason || 'Precheck failed'),
    appUrl: String(appUrl || ''),
    userStoryPreview: String(userStory || '').slice(0, 200),
    totals: { executed: 0, passed: 0, failed: 1 }
  };

  await appendRunHistory(entry);
  return entry;
}

async function readLatestReportTotals() {
  const reportDataPath = path.join(reportUiDir, 'data', 'report-data.json');
  if (!(await pathExists(reportDataPath))) {
    return { executed: 0, passed: 0, failed: 0 };
  }

  try {
    const raw = await fs.readFile(reportDataPath, 'utf8');
    const parsed = JSON.parse(raw);
    const passed = Number(parsed?.totals?.automatedRunPassed || 0);
    const failed = Number(parsed?.totals?.automatedRunFailed || 0);
    return {
      executed: passed + failed,
      passed,
      failed
    };
  } catch {
    return { executed: 0, passed: 0, failed: 0 };
  }
}

function normalizeEnvValue(raw) {
  const text = String(raw || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

async function readDefaultUrlFromEnvFile() {
  if (!(await pathExists(envFilePath))) {
    return process.env.APP_URL || '';
  }

  try {
    const envText = await fs.readFile(envFilePath, 'utf8');
    const match = envText.match(/^APP_URL\s*=\s*(.*)$/m);
    if (!match) {
      return process.env.APP_URL || '';
    }
    return normalizeEnvValue(match[1]);
  } catch {
    return process.env.APP_URL || '';
  }
}

async function saveDefaultUrlToEnvFile(appUrl) {
  const sanitized = String(appUrl || '').trim();
  if (!sanitized) {
    throw new Error('Cannot save empty APP_URL.');
  }

  let envText = '';
  if (await pathExists(envFilePath)) {
    envText = await fs.readFile(envFilePath, 'utf8');
  }

  const line = `APP_URL=${sanitized}`;
  if (/^APP_URL\s*=.*$/m.test(envText)) {
    envText = envText.replace(/^APP_URL\s*=.*$/m, line);
  } else {
    const separator = envText.endsWith('\n') || envText.length === 0 ? '' : '\n';
    envText = `${envText}${separator}${line}\n`;
  }

  await fs.writeFile(envFilePath, envText);
  process.env.APP_URL = sanitized;
  return sanitized;
}

async function runPipeline({ appUrl, userStory }) {
  if (isRunInProgress) {
    return { ok: false, status: 409, error: 'A test run is already in progress. Please wait for completion.' };
  }

  isRunInProgress = true;
  const startedAt = new Date().toISOString();

  return new Promise((resolve) => {
    let output = '';
    const maxChars = 30_000;
    const runId = `run_${Date.now()}`;

    function append(text) {
      output += text;
      if (output.length > maxChars) {
        output = output.slice(output.length - maxChars);
      }
    }

    const env = {
      ...process.env,
      APP_URL: appUrl
    };

    const proc = spawn('node', ['src/index.js'], {
      cwd: rootDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (data) => append(String(data)));
    proc.stderr.on('data', (data) => append(String(data)));

    proc.on('error', async (error) => {
      isRunInProgress = false;
      const finishedAt = new Date().toISOString();
      const entry = {
        runId,
        startedAt,
        finishedAt,
        status: 'ERROR',
        exitCode: -1,
        outputTail: `${output}\n${error.message}`.trim(),
        totals: { executed: 0, passed: 0, failed: 0 }
      };
      await appendRunHistory(entry);
      resolve({ ok: false, status: 500, error: error.message, entry });
    });

    proc.on('close', async (code) => {
      let buildError = null;
      try {
        await buildReportData();
      } catch (error) {
        buildError = error;
      }
      const totals = await readLatestReportTotals();

      isRunInProgress = false;
      const finishedAt = new Date().toISOString();
      const entry = {
        runId,
        startedAt,
        finishedAt,
        status: code === 0 ? 'PASS' : 'FAIL',
        exitCode: Number(code),
        outputTail: output.trim(),
        totals
      };

      await appendRunHistory(entry);

      if (buildError) {
        resolve({ ok: false, status: 500, error: buildError.message, entry });
        return;
      }

      resolve({ ok: code === 0, status: code === 0 ? 200 : 500, entry });
    });

    proc.stdin.write(`${String(userStory || '').trim()}\n`);
    proc.stdin.end();
  });
}

function resolveRequestPath(urlPath) {
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  const decoded = decodeURIComponent(cleanPath.split('?')[0]);
  if (decoded.startsWith('/generated_tests/')) {
    return path.join(rootDir, decoded);
  }
  if (decoded.startsWith('/playwright-report/')) {
    return path.join(rootDir, decoded);
  }
  return path.join(reportUiDir, decoded);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/history') {
    const history = await readRunHistory();
    writeJson(res, 200, { items: history });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/default-url') {
    const appUrl = await readDefaultUrlFromEnvFile();
    writeJson(res, 200, { appUrl });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/manual-test-cases') {
    const manualData = await readManualTestCases();
    writeJson(res, 200, manualData);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/manual-test-cases/download') {
    const format = String(url.searchParams.get('format') || '').toLowerCase();
    const manualData = await readManualTestCases();

    if (format === 'excel') {
      const csv = buildManualCasesCsv(manualData);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="manual-test-cases.csv"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      });
      res.end(csv);
      return;
    }

    if (format === 'word') {
      const wordHtml = buildManualCasesWordHtml(manualData);
      res.writeHead(200, {
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': 'attachment; filename="manual-test-cases.doc"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      });
      res.end(wordHtml);
      return;
    }

    writeJson(res, 400, { error: 'Unsupported format. Use format=word or format=excel.' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/default-url') {
    try {
      const body = await readJsonBody(req);
      const appUrl = String(body.appUrl || '').trim();
      if (!appUrl) {
        writeJson(res, 400, { error: 'appUrl is required.' });
        return;
      }

      const savedUrl = await saveDefaultUrlToEnvFile(appUrl);
      writeJson(res, 200, { appUrl: savedUrl });
      return;
    } catch (error) {
      writeJson(res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/run-tests') {
    try {
      const body = await readJsonBody(req);
      const appUrl = String(body.appUrl || '').trim();
      const userStory = String(body.userStory || '').trim();
      const saveDefaultUrl = Boolean(body.saveDefaultUrl);

      if (!appUrl) {
        const failureEntry = await appendPrecheckFailure({
          reason: 'appUrl is required.',
          appUrl,
          userStory
        });
        writeJson(res, 400, { error: 'appUrl is required.', run: failureEntry });
        return;
      }

      const urlValidation = await validateUrlReachability(appUrl);
      if (!urlValidation.ok) {
        const failureEntry = await appendPrecheckFailure({
          reason: urlValidation.message,
          appUrl,
          userStory
        });
        writeJson(res, 400, { error: urlValidation.message, run: failureEntry });
        return;
      }

      if (!userStory) {
        writeJson(res, 400, { error: 'userStory is required.' });
        return;
      }

      if (saveDefaultUrl) {
        await saveDefaultUrlToEnvFile(appUrl);
      }

      const runResult = await runPipeline({ appUrl, userStory });
      if (!runResult.ok) {
        writeJson(res, runResult.status, { error: runResult.error || 'Run failed', run: runResult.entry });
        return;
      }

      writeJson(res, 200, { message: 'Run completed', run: runResult.entry });
      return;
    } catch (error) {
      writeJson(res, 500, { error: error.message });
      return;
    }
  }

  const requestPath = resolveRequestPath(req.url || '/');
  try {
    const data = await fs.readFile(requestPath);
    res.writeHead(200, {
      'Content-Type': contentType(requestPath),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

buildReportData()
  .catch((error) => {
    console.warn(`Initial report data build skipped: ${error.message}`);
  })
  .finally(() => {
    server.listen(port, () => {
      console.log(`Report UI available at http://localhost:${port}`);
    });
  });
