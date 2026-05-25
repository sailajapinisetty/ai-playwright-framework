import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { buildReportData } from './buildReportData.js';

const rootDir = process.cwd();
const reportUiDir = path.resolve(rootDir, '../frontend/report-ui');
const envFilePath = path.resolve(rootDir, '../.env');
const port = Number(process.env.PORT || process.env.REPORT_UI_PORT || 4173);
const uiHistoryPath = path.join(reportUiDir, 'data', 'ui-run-history.json');
const projectRegistryPath = path.join(reportUiDir, 'data', 'projects-registry.json');
const sharedReportDataPath = path.join(reportUiDir, 'data', 'report-data.json');
const projectDataRootDir = path.join(rootDir, 'project-data', 'projects');
let isRunInProgress = false;
const defaultCorsOrigins = [
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://sailajapinisetty.github.io'
];
const corsOrigins = String(process.env.CORS_ALLOW_ORIGINS || defaultCorsOrigins.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

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

function buildCorsHeaders(req) {
  const requestOrigin = String(req.headers.origin || '').trim();
  const allowAll = corsOrigins.includes('*');
  const allowedOrigin = allowAll
    ? '*'
    : (corsOrigins.includes(requestOrigin) ? requestOrigin : '');

  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function writeJson(req, res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...buildCorsHeaders(req),
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

async function listFilesRecursive(dirPath, fileExtension = '') {
  if (!(await pathExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(entryPath, fileExtension)));
      continue;
    }

    if (entry.isFile() && (!fileExtension || entry.name.endsWith(fileExtension))) {
      files.push(entryPath);
    }
  }

  return files.sort();
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

function normalizeProjectRegistry(value) {
  const projects = Array.isArray(value?.projects) ? value.projects : [];
  const selectedProjectId = String(value?.selectedProjectId || '').trim();

  return {
    selectedProjectId,
    projects: projects.map((project) => ({
      id: String(project?.id || '').trim(),
      name: String(project?.name || '').trim(),
      description: String(project?.description || '').trim(),
      createdAt: String(project?.createdAt || ''),
      updatedAt: String(project?.updatedAt || ''),
      storyFolders: Array.isArray(project?.storyFolders)
        ? project.storyFolders.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [],
      urls: Array.isArray(project?.urls)
        ? project.urls.map((entry) => ({
          id: String(entry?.id || '').trim(),
          label: String(entry?.label || '').trim(),
          url: String(entry?.url || '').trim(),
          isDefault: Boolean(entry?.isDefault),
          createdAt: String(entry?.createdAt || ''),
          updatedAt: String(entry?.updatedAt || '')
        }))
        : []
    })).filter((project) => project.id && project.name)
  };
}

async function readProjectRegistry() {
  const raw = await readJsonFileIfExists(projectRegistryPath, {
    selectedProjectId: '',
    projects: []
  });
  return normalizeProjectRegistry(raw);
}

async function writeProjectRegistry(registry) {
  await fs.mkdir(path.dirname(projectRegistryPath), { recursive: true });
  await fs.writeFile(projectRegistryPath, JSON.stringify(normalizeProjectRegistry(registry), null, 2));
}

function sanitizeProjectName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function makeEntityId(prefix, value) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || prefix;
  return `${prefix}_${base}_${Date.now()}`;
}

function getProjectDefaultUrl(project) {
  const urls = Array.isArray(project?.urls) ? project.urls : [];
  const explicitDefault = urls.find((entry) => entry.isDefault && isHttpUrl(entry.url));
  if (explicitDefault) {
    return explicitDefault;
  }

  const firstValid = urls.find((entry) => isHttpUrl(entry.url));
  return firstValid || null;
}

function getSelectedProject(registry) {
  const selectedProjectId = String(registry?.selectedProjectId || '').trim();
  const projects = Array.isArray(registry?.projects) ? registry.projects : [];
  if (!selectedProjectId) {
    return null;
  }

  return projects.find((project) => project.id === selectedProjectId) || null;
}

async function getSelectedProjectInfo() {
  const registry = await readProjectRegistry();
  const selectedProject = getSelectedProject(registry);
  if (!selectedProject) {
    return null;
  }

  return {
    projectId: selectedProject.id,
    projectName: selectedProject.name
  };
}

async function saveDefaultUrlForSelectedProject(appUrl) {
  const sanitized = String(appUrl || '').trim();
  if (!sanitized || !isHttpUrl(sanitized)) {
    return null;
  }

  const registry = await readProjectRegistry();
  const selectedProjectId = String(registry.selectedProjectId || '').trim();
  if (!selectedProjectId) {
    return null;
  }

  const now = new Date().toISOString();
  let savedUrl = null;

  registry.projects = registry.projects.map((project) => {
    if (project.id !== selectedProjectId) {
      return project;
    }

    const currentUrls = Array.isArray(project.urls) ? project.urls : [];
    const existing = currentUrls.find((entry) => String(entry.url || '').trim() === sanitized);
    const nextUrls = currentUrls.map((entry) => ({ ...entry, isDefault: false, updatedAt: now }));

    if (existing) {
      const updated = {
        ...existing,
        isDefault: true,
        updatedAt: now
      };
      const merged = nextUrls.map((entry) => (entry.id === existing.id ? updated : entry));
      savedUrl = updated;
      return {
        ...project,
        urls: merged,
        updatedAt: now
      };
    }

    const created = {
      id: makeEntityId('url', sanitized),
      label: 'Default URL',
      url: sanitized,
      isDefault: true,
      createdAt: now,
      updatedAt: now
    };
    savedUrl = created;
    return {
      ...project,
      urls: [...nextUrls, created],
      updatedAt: now
    };
  });

  await writeProjectRegistry(registry);
  return savedUrl;
}

function summarizeReportTotals(stories) {
  const safeStories = Array.isArray(stories) ? stories : [];
  const totals = {
    stories: safeStories.length,
    tests: 0,
    manual: 0,
    automated: 0,
    automatable: 0,
    automatedRunPassed: 0,
    automatedRunFailed: 0,
    executionPassed: 0,
    executionFailed: 0,
    notRun: 0
  };

  for (const story of safeStories) {
    totals.tests += Number(story?.totals?.tests || 0);
    totals.manual += Number(story?.totals?.manual || 0);
    totals.automated += Number(story?.totals?.automated || 0);
    totals.automatable += Number(story?.totals?.automatable || 0);
    totals.automatedRunPassed += Number(story?.totals?.automatedRunPassed || 0);
    totals.automatedRunFailed += Number(story?.totals?.automatedRunFailed || 0);
    totals.executionPassed += Number(story?.totals?.executionPassed || 0);
    totals.executionFailed += Number(story?.totals?.executionFailed || 0);
    totals.notRun += Number(story?.totals?.notRun || 0);
  }

  return totals;
}

function filterReportByStoryFolders(reportData, storyFolders) {
  const folderSet = new Set((Array.isArray(storyFolders) ? storyFolders : []).map((entry) => String(entry || '').trim()).filter(Boolean));
  const allStories = Array.isArray(reportData?.stories) ? reportData.stories : [];
  const selectedStories = folderSet.size === 0
    ? allStories
    : allStories.filter((story) => folderSet.has(String(story?.id || '')));

  const totals = summarizeReportTotals(selectedStories);
  const coverageCovered = selectedStories.reduce((sum, story) => sum + Number(story?.totals?.covered || 0), 0);
  const coverageAutomatable = selectedStories.reduce((sum, story) => sum + Number(story?.totals?.automatable || 0), 0);

  return {
    ...reportData,
    storyCount: selectedStories.length,
    stories: selectedStories,
    totals,
    coverage: {
      covered: coverageCovered,
      automatable: coverageAutomatable,
      overallPercent: coverageAutomatable === 0 ? 0 : Math.round((coverageCovered / coverageAutomatable) * 100)
    }
  };
}

async function copyDirectoryRecursive(sourceDir, targetDir) {
  if (!(await pathExists(sourceDir))) {
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function trackProjectStoryFolder(projectId, storyFolder) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  if (!safeProjectId || !safeStoryFolder) {
    return;
  }

  const registry = await readProjectRegistry();
  let changed = false;
  registry.projects = registry.projects.map((project) => {
    if (project.id !== safeProjectId) {
      return project;
    }

    const storyFolders = new Set(Array.isArray(project.storyFolders) ? project.storyFolders : []);
    if (storyFolders.has(safeStoryFolder)) {
      return project;
    }

    storyFolders.add(safeStoryFolder);
    changed = true;
    return {
      ...project,
      storyFolders: [...storyFolders].sort(),
      updatedAt: new Date().toISOString()
    };
  });

  if (changed) {
    await writeProjectRegistry(registry);
  }
}

function normalizeManualCaseArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

function normalizeCaseText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function caseTokens(value) {
  return new Set(normalizeCaseText(value).split(' ').filter(Boolean));
}

function caseSimilarity(aText, bText) {
  const a = caseTokens(aText);
  const b = caseTokens(bText);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(a.size, b.size);
}

function manualCaseSignature(testCase) {
  const steps = Array.isArray(testCase?.steps) ? testCase.steps.join(' ') : '';
  const preconditions = Array.isArray(testCase?.preconditions) ? testCase.preconditions.join(' ') : '';
  return normalizeCaseText([
    testCase?.title,
    testCase?.expectedResult,
    steps,
    preconditions
  ].join(' '));
}

function normalizeManualCaseInput(value, fallbackId = '') {
  const raw = value && typeof value === 'object' ? value : {};
  const normalizedId = String(raw.id || fallbackId || '').trim();
  const normalizedStatus = String(raw.status || 'Not Run').trim() || 'Not Run';
  return {
    id: normalizedId,
    title: String(raw.title || '').trim(),
    description: String(raw.description || '').trim(),
    type: String(raw.type || '').trim() || 'functional',
    priority: String(raw.priority || '').trim() || 'medium',
    preconditions: normalizeManualCaseArray(raw.preconditions),
    steps: normalizeManualCaseArray(raw.steps),
    expectedResult: String(raw.expectedResult || '').trim(),
    actualResult: String(raw.actualResult || '').trim(),
    status: normalizedStatus,
    acceptanceCriteria: normalizeManualCaseArray(raw.acceptanceCriteria),
    automationCandidate: Boolean(raw.automationCandidate),
    automationReason: String(raw.automationReason || '').trim()
  };
}

function buildAutomatedCaseResultMap(reportData) {
  const map = new Map();
  const stories = Array.isArray(reportData?.stories) ? reportData.stories : [];

  for (const story of stories) {
    const storyFolder = String(story?.id || '').trim();
    const cases = Array.isArray(story?.cases) ? story.cases : [];
    for (const entry of cases) {
      const caseId = String(entry?.caseId || '').trim();
      if (!storyFolder || !caseId) {
        continue;
      }

      const executionStatus = String(entry?.executionStatus || 'NOT_RUN').toUpperCase();
      const status = executionStatus === 'PASS'
        ? 'Pass'
        : (executionStatus === 'FAIL' ? 'Fail' : 'Not Run');
      const actualResult = executionStatus === 'PASS'
        ? (String(entry?.validationSummary || '').trim() || 'Automated execution passed.')
        : (String(entry?.failureCause || entry?.validationSummary || '').trim() || 'Automated execution not completed yet.');

      map.set(`${storyFolder}::${caseId}`, {
        status,
        actualResult
      });
    }
  }

  return map;
}

async function saveProjectStory({ projectId = '', storyFolder = '', content = '', source = 'UI input' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  const safeContent = String(content || '').trim();
  const safeSource = String(source || 'UI input').trim();

  if (!safeProjectId) {
    throw new Error('projectId is required.');
  }
  if (!safeContent) {
    throw new Error('content is required.');
  }

  const registry = await readProjectRegistry();
  const project = registry.projects.find((entry) => entry.id === safeProjectId);
  if (!project) {
    throw new Error('Project not found.');
  }

  const projectCode = normalizeProjectCode(project.name || project.id || 'PRJ');
  const isUpdate = Boolean(safeStoryFolder);
  const storyNumber = isUpdate ? null : await getNextStorySequenceNumber();
  const resolvedStoryFolder = isUpdate ? safeStoryFolder : buildStoryName(projectCode, storyNumber);
  const projectStoryDir = path.join(projectDataRootDir, safeProjectId, 'stories', resolvedStoryFolder);

  if (isUpdate && !(await pathExists(projectStoryDir))) {
    throw new Error('Story folder not found for update.');
  }

  await fs.mkdir(projectStoryDir, { recursive: true });
  await fs.writeFile(path.join(projectStoryDir, 'user-story.txt'), `${safeContent}\n`);
  await fs.writeFile(path.join(projectStoryDir, 'story-meta.json'), JSON.stringify({
    savedAt: new Date().toISOString(),
    source: safeSource,
    storyFolder: resolvedStoryFolder,
    mode: isUpdate ? 'update' : 'create'
  }, null, 2));

  await trackProjectStoryFolder(safeProjectId, resolvedStoryFolder);

  return {
    projectId: safeProjectId,
    projectName: String(project.name || ''),
    storyFolder: resolvedStoryFolder,
    storyNumber,
    source: safeSource,
    mode: isUpdate ? 'update' : 'create'
  };
}

async function upsertManualTestCase({ projectId = '', storyFolder = '', testCase = {} } = {}) {
  const safeStoryFolder = String(storyFolder || '').trim();
  const safeProjectId = String(projectId || '').trim();
  if (!safeStoryFolder) {
    throw new Error('storyFolder is required.');
  }

  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const storyDir = path.join(generatedTestsDir, safeStoryFolder);
  const manualPath = path.join(storyDir, 'manual-test-cases.json');
  const manualCatalog = await readJsonFileIfExists(manualPath, null);
  if (!manualCatalog || typeof manualCatalog !== 'object') {
    throw new Error('Manual catalog not found for storyFolder. Run story generation first.');
  }

  const normalizedInput = normalizeManualCaseInput(testCase);
  const originalCaseId = String(testCase?.originalCaseId || '').trim();
  if (!normalizedInput.title) {
    throw new Error('testCase.title is required.');
  }

  const existingCases = Array.isArray(manualCatalog.testCases) ? manualCatalog.testCases : [];
  const targetId = normalizedInput.id || originalCaseId || `${safeStoryFolder}_MANUAL_${Date.now()}`;
  const matchId = originalCaseId || targetId;
  const finalCase = normalizeManualCaseInput({ ...normalizedInput, id: targetId }, targetId);

  const incomingSignature = manualCaseSignature(finalCase);
  let bestDuplicate = null;
  for (const entry of existingCases) {
    const existingId = String(entry?.id || '').trim();
    if (!existingId || existingId === targetId || (matchId && existingId === matchId)) {
      continue;
    }

    const similarity = caseSimilarity(incomingSignature, manualCaseSignature(entry));
    if (!bestDuplicate || similarity > bestDuplicate.similarity) {
      bestDuplicate = {
        id: existingId,
        title: String(entry?.title || '').trim(),
        similarity
      };
    }
  }

  if (bestDuplicate && bestDuplicate.similarity >= 0.75) {
    throw new Error(`Duplicate manual test case detected with ${bestDuplicate.id} (${Math.round(bestDuplicate.similarity * 100)}% similarity).`);
  }

  let action = 'created';
  const updatedCases = existingCases.map((entry) => {
    if (String(entry?.id || '').trim() !== matchId) {
      return entry;
    }

    action = 'updated';
    return {
      ...entry,
      ...finalCase
    };
  });

  if (action === 'created') {
    updatedCases.push(finalCase);
  }

  const nextCatalog = {
    ...manualCatalog,
    testCases: updatedCases
  };

  await fs.mkdir(storyDir, { recursive: true });
  await fs.writeFile(manualPath, JSON.stringify(nextCatalog, null, 2));

  if (safeProjectId) {
    const projectStoryDir = path.join(projectDataRootDir, safeProjectId, 'stories', safeStoryFolder);
    if (await pathExists(projectStoryDir)) {
      await fs.writeFile(path.join(projectStoryDir, 'manual-test-cases.json'), JSON.stringify(nextCatalog, null, 2));
    }
  }

  return {
    storyFolder: safeStoryFolder,
    action,
    testCase: finalCase
  };
}

async function mapGeneratedStoriesToProject(projectId) {
  const safeProjectId = String(projectId || '').trim();
  if (!safeProjectId) {
    throw new Error('projectId is required.');
  }

  const registry = await readProjectRegistry();
  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const discoveredStoryFolders = await listDirectories(generatedTestsDir);
  const now = new Date().toISOString();
  let mappedCount = 0;
  let projectFound = false;

  registry.projects = registry.projects.map((project) => {
    if (project.id !== safeProjectId) {
      return project;
    }

    projectFound = true;
    const existing = new Set(Array.isArray(project.storyFolders) ? project.storyFolders : []);
    for (const folder of discoveredStoryFolders) {
      if (!existing.has(folder)) {
        existing.add(folder);
        mappedCount += 1;
      }
    }

    return {
      ...project,
      storyFolders: [...existing].sort(),
      updatedAt: now
    };
  });

  if (!projectFound) {
    throw new Error('Project not found.');
  }

  await writeProjectRegistry(registry);
  const project = registry.projects.find((entry) => entry.id === safeProjectId) || null;

  return {
    projectId: safeProjectId,
    projectName: String(project?.name || ''),
    discoveredStories: discoveredStoryFolders.length,
    mappedCount,
    totalMappedStories: Array.isArray(project?.storyFolders) ? project.storyFolders.length : 0
  };
}

async function persistProjectRunArtifacts({ runEntry, includeStoryFolder = '' }) {
  const projectId = String(runEntry?.projectId || '').trim();
  const runId = String(runEntry?.runId || '').trim();
  if (!projectId || !runId) {
    return;
  }

  const registry = await readProjectRegistry();
  const project = registry.projects.find((entry) => entry.id === projectId);
  const trackedStoryFolders = Array.isArray(project?.storyFolders) ? project.storyFolders : [];
  const oneStory = String(includeStoryFolder || '').trim();
  const storyFolders = oneStory ? [oneStory] : trackedStoryFolders;

  const projectRootDir = path.join(projectDataRootDir, projectId);
  const runsDir = path.join(projectRootDir, 'runs', runId);
  const storiesDir = path.join(projectRootDir, 'stories');
  await fs.mkdir(runsDir, { recursive: true });
  await fs.mkdir(storiesDir, { recursive: true });

  await fs.writeFile(path.join(runsDir, 'run-entry.json'), JSON.stringify(runEntry, null, 2));

  const reportData = await readJsonFileIfExists(sharedReportDataPath, null);
  if (reportData) {
    const filteredReport = filterReportByStoryFolders(reportData, storyFolders);
    await fs.writeFile(path.join(runsDir, 'report-data.json'), JSON.stringify(filteredReport, null, 2));
  }

  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  for (const storyFolder of storyFolders) {
    const safeFolder = String(storyFolder || '').trim();
    if (!safeFolder) {
      continue;
    }

    const sourceStoryDir = path.join(generatedTestsDir, safeFolder);
    const targetStoryDir = path.join(storiesDir, safeFolder);
    await copyDirectoryRecursive(sourceStoryDir, targetStoryDir);
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

async function readManualTestCases({ projectId = '' } = {}) {
  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const latestReportData = await readJsonFileIfExists(sharedReportDataPath, null);
  const automatedResultMap = buildAutomatedCaseResultMap(latestReportData);
  let storyFolders = await listDirectories(generatedTestsDir);
  const requestedProjectId = String(projectId || '').trim();

  if (requestedProjectId) {
    const registry = await readProjectRegistry();
    const project = registry.projects.find((entry) => entry.id === requestedProjectId);
    const allowedStoryFolders = new Set(Array.isArray(project?.storyFolders) ? project.storyFolders : []);
    if (allowedStoryFolders.size > 0) {
      storyFolders = storyFolders.filter((folder) => allowedStoryFolders.has(folder));
    }
  }
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
        source: 'manual',
        caseId: String(testCase?.id || ''),
        title: String(testCase?.title || ''),
        description: String(testCase?.description || testCase?.title || ''),
        type: String(testCase?.type || ''),
        priority: String(testCase?.priority || ''),
        preconditions: Array.isArray(testCase?.preconditions) ? testCase.preconditions : [],
        steps: Array.isArray(testCase?.steps) ? testCase.steps : [],
        expectedResult: String(testCase?.expectedResult || ''),
        actualResult: String(testCase?.actualResult || ''),
        status: String(testCase?.status || 'Not Run'),
        automationReason: String(testCase?.automationReason || '')
      });
    }

    const testCasesDir = path.join(storyDir, 'test-cases');
    const scriptFiles = await listFilesRecursive(testCasesDir, '.spec.js');
    for (const scriptPath of scriptFiles) {
      const relativePath = path.relative(testCasesDir, scriptPath).replace(/\\/g, '/');
      const pathParts = relativePath.split('/');
      const caseId = String(pathParts[0] || '').trim() || 'unknown-case';
      const fileName = String(pathParts[pathParts.length - 1] || '').trim();
      const prettyTitle = fileName
        .replace(/\.spec\.js$/i, '')
        .replace(/_/g, ' ')
        .trim();
      const resultEntry = automatedResultMap.get(`${storyFolder}::${caseId}`) || {
        status: 'Not Run',
        actualResult: 'Automated execution not completed yet.'
      };
      const linkedManualCase = testCases.find((entry) => String(entry?.id || '').trim() === caseId) || null;

      items.push({
        storyFolder,
        storyTitle,
        source: 'automated',
        caseId,
        title: prettyTitle || fileName,
        description: String(linkedManualCase?.description || linkedManualCase?.title || prettyTitle || fileName),
        type: 'automated-script',
        priority: '',
        preconditions: Array.isArray(linkedManualCase?.preconditions) ? linkedManualCase.preconditions : [],
        steps: Array.isArray(linkedManualCase?.steps) ? linkedManualCase.steps : [],
        expectedResult: String(linkedManualCase?.expectedResult || ''),
        actualResult: String(resultEntry.actualResult || ''),
        status: String(resultEntry.status || 'Not Run'),
        automationReason: relativePath,
        scriptPath: `generated_tests/${storyFolder}/test-cases/${relativePath}`
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

async function readStoryTextForFolder({ projectId = '', storyFolder = '' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  if (!safeProjectId || !safeStoryFolder) {
    return { content: '', source: '' };
  }

  const projectStoryDir = path.join(projectDataRootDir, safeProjectId, 'stories', safeStoryFolder);
  const projectCandidates = ['user-story.txt', 'user_story.txt'];
  for (const fileName of projectCandidates) {
    const filePath = path.join(projectStoryDir, fileName);
    if (await pathExists(filePath)) {
      const content = String(await fs.readFile(filePath, 'utf8')).trim();
      if (content) {
        return { content, source: `project-data/${safeStoryFolder}/${fileName}` };
      }
    }
  }

  const storyKeyMatch = safeStoryFolder.match(/^(user_story_\d+)|([a-z0-9_]+_story_\d+)$/i);
  if (storyKeyMatch) {
    const storyKey = String(storyKeyMatch[1] || storyKeyMatch[2] || '').trim().toLowerCase();
    const legacyStoriesDir = path.join(rootDir, 'user-stories');
    const legacyFiles = await listFilesRecursive(legacyStoriesDir, '.txt');
    const matchedLegacy = legacyFiles.find((filePath) => {
      const base = path.basename(filePath, '.txt').toLowerCase();
      return base === storyKey;
    });

    if (matchedLegacy) {
      const content = String(await fs.readFile(matchedLegacy, 'utf8')).trim();
      if (content) {
        return { content, source: `user-stories/${path.basename(matchedLegacy)}` };
      }
    }
  }

  const manualCatalogPath = path.join(projectStoryDir, 'manual-test-cases.json');
  const manualCatalog = await readJsonFileIfExists(manualCatalogPath, {});
  const storyTitle = String(manualCatalog?.storyTitle || '').trim();
  const criteria = Array.isArray(manualCatalog?.storyAcceptanceCriteria)
    ? manualCatalog.storyAcceptanceCriteria.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  if (storyTitle || criteria.length > 0) {
    const criteriaText = criteria.length > 0
      ? `\n\nAcceptance Criteria:\n${criteria.map((entry) => `- ${entry}`).join('\n')}`
      : '';
    const content = `${storyTitle ? `Story title: ${storyTitle}` : ''}${criteriaText}`.trim();
    return { content, source: `project-data/${safeStoryFolder}/manual-test-cases.json` };
  }

  return { content: '', source: '' };
}

async function readProjectStories({ projectId = '' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const registry = await readProjectRegistry();
  const project = safeProjectId
    ? registry.projects.find((entry) => entry.id === safeProjectId)
    : null;

  let storyFolders = Array.isArray(project?.storyFolders)
    ? project.storyFolders.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  if (storyFolders.length === 0) {
    storyFolders = await listDirectories(generatedTestsDir);
  }

  const items = [];
  for (const storyFolder of storyFolders) {
    const storyText = safeProjectId
      ? await readStoryTextForFolder({ projectId: safeProjectId, storyFolder })
      : { content: '', source: '' };

    let storyContent = String(storyText?.content || '').trim();
    let storySource = String(storyText?.source || '').trim();

    if (!storyContent) {
      const manualCatalogPath = path.join(generatedTestsDir, storyFolder, 'manual-test-cases.json');
      const manualCatalog = await readJsonFileIfExists(manualCatalogPath, {});
      const storyTitle = String(manualCatalog?.storyTitle || '').trim();
      const criteria = Array.isArray(manualCatalog?.storyAcceptanceCriteria)
        ? manualCatalog.storyAcceptanceCriteria.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];

      const criteriaText = criteria.length > 0
        ? `\n\nAcceptance Criteria:\n${criteria.map((entry) => `- ${entry}`).join('\n')}`
        : '';
      storyContent = `${storyTitle ? `Story title: ${storyTitle}` : ''}${criteriaText}`.trim();
      if (storyContent && !storySource) {
        storySource = `generated_tests/${storyFolder}/manual-test-cases.json`;
      }
    }

    items.push({
      storyFolder,
      content: storyContent,
      source: storySource
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    projectId: safeProjectId,
    projectName: String(project?.name || ''),
    storyCount: storyFolders.length,
    items
  };
}

function buildManualCasesCsv(manualData) {
  const header = [
    'Story Folder',
    'Story Title',
    'Source',
    'Case ID',
    'Title',
    'Description',
    'Type',
    'Priority',
    'Preconditions',
    'Steps',
    'Expected Result',
    'Actual Result',
    'Status',
    'Automation Reason'
  ];

  const rows = manualData.items.map((item) => [
    item.storyFolder,
    item.storyTitle,
    item.source,
    item.caseId,
    item.title,
    item.description,
    item.type,
    item.priority,
    Array.isArray(item.preconditions) ? item.preconditions.join(' | ') : '',
    Array.isArray(item.steps) ? item.steps.join(' | ') : '',
    item.expectedResult,
    item.actualResult,
    item.status,
    item.automationReason
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function buildManualCasesWordHtml(manualData) {
  const rows = manualData.items.map((item) => `
    <tr>
      <td>${htmlEscape(item.storyFolder)}</td>
      <td>${htmlEscape(item.storyTitle)}</td>
      <td>${htmlEscape(item.source)}</td>
      <td>${htmlEscape(item.caseId)}</td>
      <td>${htmlEscape(item.title)}</td>
      <td>${htmlEscape(item.description)}</td>
      <td>${htmlEscape(item.type)}</td>
      <td>${htmlEscape(item.priority)}</td>
      <td>${htmlEscape(Array.isArray(item.preconditions) ? item.preconditions.join(' | ') : '')}</td>
      <td>${htmlEscape(Array.isArray(item.steps) ? item.steps.join(' | ') : '')}</td>
      <td>${htmlEscape(item.expectedResult)}</td>
      <td>${htmlEscape(item.actualResult)}</td>
      <td>${htmlEscape(item.status)}</td>
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
          <th>Source</th>
          <th>Case ID</th>
          <th>Title</th>
          <th>Description</th>
          <th>Type</th>
          <th>Priority</th>
          <th>Preconditions</th>
          <th>Steps</th>
          <th>Expected Result</th>
          <th>Actual Result</th>
          <th>Status</th>
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

function getProjectRunReportDataPath(projectId, runId) {
  const safeProjectId = String(projectId || '').trim();
  const safeRunId = String(runId || '').trim();
  if (!safeProjectId || !safeRunId) {
    return '';
  }

  return path.join(projectDataRootDir, safeProjectId, 'runs', safeRunId, 'report-data.json');
}

async function readRunScopedReportData(runId) {
  const safeRunId = String(runId || '').trim();
  if (!safeRunId) {
    return await readJsonFileIfExists(sharedReportDataPath, null);
  }

  const history = await readRunHistory();
  const runEntry = history.find((entry) => String(entry?.runId || '') === safeRunId);
  const runReportPath = getProjectRunReportDataPath(runEntry?.projectId, safeRunId);
  if (runReportPath) {
    const runReport = await readJsonFileIfExists(runReportPath, null);
    if (runReport) {
      return runReport;
    }
  }

  return await readJsonFileIfExists(sharedReportDataPath, null);
}

async function appendPrecheckFailure({ reason, appUrl, userStory, runType = 'FULL' }) {
  const now = new Date().toISOString();
  const projectInfo = await getSelectedProjectInfo();
  const entry = {
    runId: `run_${Date.now()}`,
    startedAt: now,
    finishedAt: now,
    runType: String(runType || 'FULL').toUpperCase(),
    status: 'FAIL',
    exitCode: -1,
    outputTail: String(reason || 'Precheck failed'),
    appUrl: String(appUrl || ''),
    userStoryPreview: String(userStory || '').slice(0, 200),
    projectId: String(projectInfo?.projectId || ''),
    projectName: String(projectInfo?.projectName || ''),
    totals: { executed: 0, passed: 0, failed: 1 }
  };

  await appendRunHistory(entry);
  return entry;
}

function parseRegressionTotals(outputText) {
  const text = String(outputText || '');
  const passedMatch = text.match(/(\d+)\s+passed/i);
  const failedMatch = text.match(/(\d+)\s+failed/i);
  const skippedMatch = text.match(/(\d+)\s+skipped/i);

  const passed = Number(passedMatch?.[1] || 0);
  const failed = Number(failedMatch?.[1] || 0);
  const skipped = Number(skippedMatch?.[1] || 0);
  const executed = passed + failed;

  return { executed, passed, failed, skipped };
}

async function readLatestReportTotals(storyFolder = '') {
  const reportDataPath = path.join(reportUiDir, 'data', 'report-data.json');
  if (!(await pathExists(reportDataPath))) {
    return { executed: 0, passed: 0, failed: 0 };
  }

  try {
    const raw = await fs.readFile(reportDataPath, 'utf8');
    const parsed = JSON.parse(raw);
    const requestedStoryFolder = String(storyFolder || '').trim();
    if (requestedStoryFolder) {
      const stories = Array.isArray(parsed?.stories) ? parsed.stories : [];
      const matchedStory = stories.find((story) => String(story?.id || '') === requestedStoryFolder);
      if (matchedStory) {
        const passed = Number(matchedStory?.totals?.automatedRunPassed || 0);
        const failed = Number(matchedStory?.totals?.automatedRunFailed || 0);
        return {
          executed: passed + failed,
          passed,
          failed
        };
      }
    }

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

async function readDefaultUrl() {
  const registry = await readProjectRegistry();
  const selectedProject = getSelectedProject(registry);
  if (selectedProject) {
    const defaultUrlEntry = getProjectDefaultUrl(selectedProject);
    if (defaultUrlEntry && isHttpUrl(defaultUrlEntry.url)) {
      return {
        appUrl: defaultUrlEntry.url,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        urlId: defaultUrlEntry.id
      };
    }
  }

  return {
    appUrl: await readDefaultUrlFromEnvFile(),
    projectId: String(selectedProject?.id || ''),
    projectName: String(selectedProject?.name || ''),
    urlId: ''
  };
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

function toSafeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'story';
}

function normalizeProjectCode(value) {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'PRJ';
}

function buildStoryName(projectCode, storyNumber) {
  return `${normalizeProjectCode(projectCode)}_Story_${Number(storyNumber)}`;
}

async function getNextStorySequenceNumber() {
  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const folders = await listDirectories(generatedTestsDir);
  let maxNumber = 0;

  for (const folder of folders) {
    const match = String(folder).match(/(?:^user_story_(\d+)-|_Story_(\d+)$)/i);
    if (!match) {
      continue;
    }

    const value = Number.parseInt(match[1] || match[2], 10);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return maxNumber + 1;
}

async function runPipeline({ appUrl, userStory }) {
  if (isRunInProgress) {
    return { ok: false, status: 409, error: 'A test run is already in progress. Please wait for completion.' };
  }

  isRunInProgress = true;
  const startedAt = new Date().toISOString();
  const projectInfo = await getSelectedProjectInfo();
  const projectCode = normalizeProjectCode(projectInfo?.projectName || projectInfo?.projectId || 'PRJ');
  const storyNumber = await getNextStorySequenceNumber();
  const storySource = `Story ${storyNumber} (UI input)`;
  const storyFolder = buildStoryName(projectCode, storyNumber);
  const storyId = toSafeId(storyFolder);

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
      APP_URL: appUrl,
      CLI_STORY_ID: storyId,
      CLI_STORY_SOURCE: storySource,
      CLI_STORY_NUMBER: String(storyNumber),
      CLI_PROJECT_CODE: projectCode
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
        runType: 'FULL',
        storyFolder,
        storySource,
        projectId: String(projectInfo?.projectId || ''),
        projectName: String(projectInfo?.projectName || ''),
        status: 'ERROR',
        exitCode: -1,
        outputTail: `${output}\n${error.message}`.trim(),
        totals: { executed: 0, passed: 0, failed: 0 }
      };
      await appendRunHistory(entry);
      await persistProjectRunArtifacts({ runEntry: entry, includeStoryFolder: storyFolder });
      resolve({ ok: false, status: 500, error: error.message, entry });
    });

    proc.on('close', async (code) => {
      let buildError = null;
      try {
        await buildReportData();
      } catch (error) {
        buildError = error;
      }
      const totals = await readLatestReportTotals(storyFolder);

      isRunInProgress = false;
      const finishedAt = new Date().toISOString();
      const entry = {
        runId,
        startedAt,
        finishedAt,
        runType: 'FULL',
        storyFolder,
        storySource,
        projectId: String(projectInfo?.projectId || ''),
        projectName: String(projectInfo?.projectName || ''),
        status: code === 0 ? 'PASS' : 'FAIL',
        exitCode: Number(code),
        outputTail: output.trim(),
        totals
      };

      await appendRunHistory(entry);
      await trackProjectStoryFolder(entry.projectId, storyFolder);
      await persistProjectRunArtifacts({ runEntry: entry, includeStoryFolder: storyFolder });

      if (buildError) {
        resolve({ ok: false, status: 500, error: buildError.message, entry });
        return;
      }

      // Non-zero exit means tests failed, but the run itself completed successfully.
      resolve({ ok: true, status: 200, entry });
    });

    proc.stdin.write(`${String(userStory || '').trim()}\n`);
    proc.stdin.end();
  });
}

function normalizeRegressionScripts(selectedScripts) {
  const scripts = Array.isArray(selectedScripts) ? selectedScripts : [];
  const normalized = scripts
    .map((entry) => String(entry || '').trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .filter((entry) => entry.startsWith('generated_tests/'))
    .filter((entry) => entry.endsWith('.spec.js'))
    .filter((entry) => !entry.includes('..'));

  return [...new Set(normalized)];
}

async function runRegressionPipeline({ appUrl, selectedScripts = [], suiteName = '' }) {
  if (isRunInProgress) {
    return { ok: false, status: 409, error: 'A test run is already in progress. Please wait for completion.' };
  }

  isRunInProgress = true;
  const startedAt = new Date().toISOString();
  const projectInfo = await getSelectedProjectInfo();

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

    const safeSelectedScripts = normalizeRegressionScripts(selectedScripts);
    const safeSuiteName = String(suiteName || '').trim();
    const playwrightArgs = ['playwright', 'test', '--config=playwright.config.js'];
    if (safeSelectedScripts.length > 0) {
      playwrightArgs.push(...safeSelectedScripts);
    } else {
      playwrightArgs.push('generated_tests');
    }

    const proc = spawn('npx', playwrightArgs, {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
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
        runType: 'REGRESSION',
        suiteName: safeSuiteName,
        selectedScripts: safeSelectedScripts,
        projectId: String(projectInfo?.projectId || ''),
        projectName: String(projectInfo?.projectName || ''),
        status: 'ERROR',
        exitCode: -1,
        outputTail: `${output}\n${error.message}`.trim(),
        totals: { executed: 0, passed: 0, failed: 0 }
      };
      await appendRunHistory(entry);
      await persistProjectRunArtifacts({ runEntry: entry });
      resolve({ ok: false, status: 500, error: error.message, entry });
    });

    proc.on('close', async (code) => {
      let buildError = null;
      try {
        await buildReportData();
      } catch (error) {
        buildError = error;
      }

      isRunInProgress = false;
      const finishedAt = new Date().toISOString();
      const parsedTotals = parseRegressionTotals(output);
      const fallbackTotals = await readLatestReportTotals();
      const totals = parsedTotals.executed > 0 ? {
        executed: parsedTotals.executed,
        passed: parsedTotals.passed,
        failed: parsedTotals.failed
      } : fallbackTotals;

      const entry = {
        runId,
        startedAt,
        finishedAt,
        runType: 'REGRESSION',
        suiteName: safeSuiteName,
        selectedScripts: safeSelectedScripts,
        projectId: String(projectInfo?.projectId || ''),
        projectName: String(projectInfo?.projectName || ''),
        status: code === 0 ? 'PASS' : 'FAIL',
        exitCode: Number(code),
        outputTail: output.trim(),
        totals
      };

      await appendRunHistory(entry);
      await persistProjectRunArtifacts({ runEntry: entry });

      if (buildError) {
        resolve({ ok: false, status: 500, error: buildError.message, entry });
        return;
      }

      resolve({ ok: true, status: 200, entry });
    });
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
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    const history = await readRunHistory();
    const projectIdFilter = String(url.searchParams.get('projectId') || '').trim();
    const items = projectIdFilter
      ? history.filter((entry) => String(entry?.projectId || '') === projectIdFilter)
      : history;
    writeJson(req, res, 200, { items });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/report-data') {
    const runId = String(url.searchParams.get('runId') || '').trim();
    const reportData = await readRunScopedReportData(runId);
    if (!reportData) {
      writeJson(req, res, 404, { error: 'Report data not found.' });
      return;
    }

    writeJson(req, res, 200, reportData);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const registry = await readProjectRegistry();
    writeJson(req, res, 200, registry);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try {
      const body = await readJsonBody(req);
      const name = sanitizeProjectName(body.name);
      const description = String(body.description || '').trim();

      if (!name) {
        writeJson(req, res, 400, { error: 'Project name is required.' });
        return;
      }

      const registry = await readProjectRegistry();
      const duplicate = registry.projects.find((project) => project.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        writeJson(req, res, 409, { error: 'Project name already exists.' });
        return;
      }

      const now = new Date().toISOString();
      const project = {
        id: makeEntityId('project', name),
        name,
        description,
        createdAt: now,
        updatedAt: now,
        storyFolders: [],
        urls: []
      };

      registry.projects.push(project);
      registry.selectedProjectId = project.id;
      await writeProjectRegistry(registry);
      writeJson(req, res, 200, { project, selectedProjectId: project.id });
      return;
    } catch (error) {
      writeJson(req, res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/select') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      if (!projectId) {
        writeJson(req, res, 400, { error: 'projectId is required.' });
        return;
      }

      const registry = await readProjectRegistry();
      const selected = registry.projects.find((project) => project.id === projectId);
      if (!selected) {
        writeJson(req, res, 404, { error: 'Project not found.' });
        return;
      }

      registry.selectedProjectId = projectId;
      await writeProjectRegistry(registry);
      writeJson(req, res, 200, { selectedProjectId: projectId });
      return;
    } catch (error) {
      writeJson(req, res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/map-stories') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      if (!projectId) {
        writeJson(req, res, 400, { error: 'projectId is required.' });
        return;
      }

      const result = await mapGeneratedStoriesToProject(projectId);
      writeJson(req, res, 200, result);
      return;
    } catch (error) {
      const message = String(error?.message || 'Unable to map stories to project.');
      const statusCode = message === 'Project not found.' ? 404 : 500;
      writeJson(req, res, statusCode, { error: message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/projects/urls') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      const urlValue = String(body.url || '').trim();
      const label = String(body.label || '').trim() || 'Saved URL';
      const isDefault = Boolean(body.isDefault);

      if (!projectId) {
        writeJson(req, res, 400, { error: 'projectId is required.' });
        return;
      }

      if (!isHttpUrl(urlValue)) {
        writeJson(req, res, 400, { error: 'A valid http/https url is required.' });
        return;
      }

      const registry = await readProjectRegistry();
      const now = new Date().toISOString();
      let savedUrl = null;
      let projectFound = false;

      registry.projects = registry.projects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }

        projectFound = true;
        const urls = Array.isArray(project.urls) ? project.urls : [];
        const existing = urls.find((entry) => String(entry.url || '').trim() === urlValue);
        const nextUrls = urls.map((entry) => ({
          ...entry,
          isDefault: isDefault ? false : Boolean(entry.isDefault),
          updatedAt: now
        }));

        if (existing) {
          const updated = {
            ...existing,
            label,
            isDefault: isDefault ? true : Boolean(existing.isDefault),
            updatedAt: now
          };
          savedUrl = updated;
          return {
            ...project,
            urls: nextUrls.map((entry) => (entry.id === existing.id ? updated : entry)),
            updatedAt: now
          };
        }

        const created = {
          id: makeEntityId('url', label),
          label,
          url: urlValue,
          isDefault,
          createdAt: now,
          updatedAt: now
        };
        savedUrl = created;
        return {
          ...project,
          urls: [...nextUrls, created],
          updatedAt: now
        };
      });

      if (!projectFound) {
        writeJson(req, res, 404, { error: 'Project not found.' });
        return;
      }

      await writeProjectRegistry(registry);
      writeJson(req, res, 200, { url: savedUrl });
      return;
    } catch (error) {
      writeJson(req, res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/default-url') {
    const result = await readDefaultUrl();
    writeJson(req, res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/manual-test-cases') {
    const projectId = String(url.searchParams.get('projectId') || '').trim();
    const manualData = await readManualTestCases({ projectId });
    writeJson(req, res, 200, manualData);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/project-stories') {
    const projectId = String(url.searchParams.get('projectId') || '').trim();
    const storyData = await readProjectStories({ projectId });
    writeJson(req, res, 200, storyData);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/project-stories') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      const storyFolder = String(body.storyFolder || '').trim();
      const content = String(body.content || '').trim();
      const source = String(body.source || 'UI input').trim();

      if (!projectId) {
        writeJson(req, res, 400, { error: 'projectId is required.' });
        return;
      }
      if (!content) {
        writeJson(req, res, 400, { error: 'content is required.' });
        return;
      }

      const saved = await saveProjectStory({ projectId, storyFolder, content, source });
      writeJson(req, res, 200, saved);
      return;
    } catch (error) {
      const message = String(error?.message || 'Unable to save project story.');
      const statusCode = (message === 'Project not found.' || message === 'Story folder not found for update.') ? 404 : 500;
      writeJson(req, res, statusCode, { error: message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/manual-test-cases') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      const storyFolder = String(body.storyFolder || '').trim();
      const testCase = body.testCase;

      const saved = await upsertManualTestCase({ projectId, storyFolder, testCase });
      writeJson(req, res, 200, saved);
      return;
    } catch (error) {
      const message = String(error?.message || 'Unable to save manual test case.');
      const statusCode = message.includes('not found') ? 404 : 400;
      writeJson(req, res, statusCode, { error: message });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/manual-test-cases/download') {
    const format = String(url.searchParams.get('format') || '').toLowerCase();
    const projectId = String(url.searchParams.get('projectId') || '').trim();
    const manualData = await readManualTestCases({ projectId });

    if (format === 'excel') {
      const csv = buildManualCasesCsv(manualData);
      res.writeHead(200, {
        ...corsHeaders,
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
        ...corsHeaders,
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': 'attachment; filename="manual-test-cases.doc"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      });
      res.end(wordHtml);
      return;
    }

    writeJson(req, res, 400, { error: 'Unsupported format. Use format=word or format=excel.' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/default-url') {
    try {
      const body = await readJsonBody(req);
      const appUrl = String(body.appUrl || '').trim();
      if (!appUrl) {
        writeJson(req, res, 400, { error: 'appUrl is required.' });
        return;
      }

      const savedProjectUrl = await saveDefaultUrlForSelectedProject(appUrl);
      await saveDefaultUrlToEnvFile(appUrl);
      writeJson(req, res, 200, {
        appUrl,
        savedToProject: Boolean(savedProjectUrl),
        projectUrlId: String(savedProjectUrl?.id || '')
      });
      return;
    } catch (error) {
      writeJson(req, res, 500, { error: error.message });
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
        writeJson(req, res, 400, { error: 'appUrl is required.', run: failureEntry });
        return;
      }

      const urlValidation = await validateUrlReachability(appUrl);
      if (!urlValidation.ok) {
        const failureEntry = await appendPrecheckFailure({
          reason: urlValidation.message,
          appUrl,
          userStory
        });
        writeJson(req, res, 400, { error: urlValidation.message, run: failureEntry });
        return;
      }

      if (!userStory) {
        writeJson(req, res, 400, { error: 'userStory is required.' });
        return;
      }

      if (saveDefaultUrl) {
        await saveDefaultUrlForSelectedProject(appUrl);
        await saveDefaultUrlToEnvFile(appUrl);
      }

      const runResult = await runPipeline({ appUrl, userStory });
      if (!runResult.ok) {
        writeJson(req, res, runResult.status, { error: runResult.error || 'Run failed', run: runResult.entry });
        return;
      }

      writeJson(req, res, 200, { message: 'Run completed', run: runResult.entry });
      return;
    } catch (error) {
      writeJson(req, res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/run-regression') {
    try {
      const body = await readJsonBody(req);
      const appUrl = String(body.appUrl || '').trim();
      const saveDefaultUrl = Boolean(body.saveDefaultUrl);
      const selectedScripts = normalizeRegressionScripts(body.selectedScripts);
      const suiteName = String(body.suiteName || '').trim();

      if (!suiteName) {
        writeJson(req, res, 400, { error: 'suiteName is required for regression run.' });
        return;
      }

      if (Array.isArray(body.selectedScripts) && body.selectedScripts.length > 0 && selectedScripts.length === 0) {
        writeJson(req, res, 400, { error: 'No valid regression scripts were selected.' });
        return;
      }

      if (!appUrl) {
        const failureEntry = await appendPrecheckFailure({
          reason: 'appUrl is required.',
          appUrl,
          userStory: '',
          runType: 'REGRESSION'
        });
        writeJson(req, res, 400, { error: 'appUrl is required.', run: failureEntry });
        return;
      }

      const urlValidation = await validateUrlReachability(appUrl);
      if (!urlValidation.ok) {
        const failureEntry = await appendPrecheckFailure({
          reason: urlValidation.message,
          appUrl,
          userStory: '',
          runType: 'REGRESSION'
        });
        writeJson(req, res, 400, { error: urlValidation.message, run: failureEntry });
        return;
      }

      if (saveDefaultUrl) {
        await saveDefaultUrlForSelectedProject(appUrl);
        await saveDefaultUrlToEnvFile(appUrl);
      }

      const runResult = await runRegressionPipeline({ appUrl, selectedScripts, suiteName });
      if (!runResult.ok) {
        writeJson(req, res, runResult.status, { error: runResult.error || 'Regression run failed', run: runResult.entry });
        return;
      }

      writeJson(req, res, 200, { message: 'Regression run completed', run: runResult.entry });
      return;
    } catch (error) {
      writeJson(req, res, 500, { error: error.message });
      return;
    }
  }

  const requestPath = resolveRequestPath(req.url || '/');
  try {
    const data = await fs.readFile(requestPath);
    res.writeHead(200, {
      ...corsHeaders,
      'Content-Type': contentType(requestPath),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
    res.end(data);
  } catch {
    res.writeHead(404, {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8'
    });
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
