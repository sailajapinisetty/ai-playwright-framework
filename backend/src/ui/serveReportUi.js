import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { buildReportData } from './buildReportData.js';
import { askClaude } from '../ai/claudeClient.js';
import { config } from '../config.js';

const rootDir = process.cwd();
const reportUiDir = path.resolve(rootDir, '../frontend/report-ui');
const envFilePath = path.resolve(rootDir, '../.env');
const port = Number(process.env.PORT || process.env.REPORT_UI_PORT || 4173);
const uiHistoryPath = path.join(reportUiDir, 'data', 'ui-run-history.json');
const projectRegistryPath = path.join(reportUiDir, 'data', 'projects-registry.json');
const sharedReportDataPath = path.join(reportUiDir, 'data', 'report-data.json');
const projectDataRootDir = path.join(rootDir, 'project-data', 'projects');
let isRunInProgress = false;
let activeRun = null;
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

function sendStopSignal(proc, signal = 'SIGTERM') {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
    return false;
  }

  try {
    if (process.platform !== 'win32' && Number.isFinite(proc.pid)) {
      process.kill(-proc.pid, signal);
    } else {
      proc.kill(signal);
    }
    return true;
  } catch {
    try {
      proc.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
}

async function stopActiveRun() {
  if (!isRunInProgress || !activeRun) {
    return { ok: false, status: 409, error: 'No automation run is currently in progress.' };
  }

  activeRun.stopRequested = true;

  if (activeRun.proc) {
    sendStopSignal(activeRun.proc, 'SIGTERM');
    setTimeout(() => {
      if (activeRun?.proc && activeRun.proc.exitCode === null && activeRun.proc.signalCode === null) {
        sendStopSignal(activeRun.proc, 'SIGKILL');
      }
    }, 2000).unref?.();
  }

  return {
    ok: true,
    status: 200,
    message: 'Stop request sent to the current automation run.',
    runId: String(activeRun.runId || '')
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

function normalizeUrlEnvironment(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['QA', 'UAT', 'PROD'].includes(normalized) ? normalized : '';
}

function inferUrlEnvironmentFromLabel(label) {
  const normalized = String(label || '').trim().toUpperCase();
  if (normalized === 'QA' || normalized.startsWith('QA ')) {
    return 'QA';
  }
  if (normalized === 'UAT' || normalized.startsWith('UAT ')) {
    return 'UAT';
  }
  if (normalized === 'PROD' || normalized.startsWith('PROD ')) {
    return 'PROD';
  }
  return '';
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

// Story point scale:
//   1 = half day
//   2 = full day (1 working day)
//   3 = 2 working days
const STORY_POINT_SCALE = [
  { points: 0, label: '0 points – may need discussion' },
  { points: 1, label: '1 point  – half day' },
  { points: 2, label: '2 points – full day' },
  { points: 3, label: '3 points – 2 working days' }
];

function normalizeStoryPoints(value) {
  const allowed = STORY_POINT_SCALE.map((entry) => entry.points);
  const numeric = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (allowed.includes(numeric)) {
    return numeric;
  }

  // Clamp to scale instead of finding nearest – anything above 3 becomes 3.
  if (numeric >= 3) return 3;
  if (numeric <= 0) return 0;
  if (numeric <= 1) return 1;
  return 2;
}

function evaluateStoryForDiscussion(userStory) {
  const text = String(userStory || '').trim();
  if (!text) {
    return {
      needsDiscussion: true,
      reasoning: 'Story content is unavailable or empty, so it cannot be estimated accurately.',
      escalationSuggestion: 'Escalate this story to the user dashboard and ask for the business goal, user action, expected outcome, and acceptance criteria.'
    };
  }

  const words = text.split(/\s+/).filter(Boolean);
  const normalized = text.toLowerCase();
  const fillerOnly = /^(test|testing|random|dummy|sample|none|na|n\/a|abc|xyz|hello|irrelevant|asdf|qwerty|123)+([\s,.-]+(test|testing|random|dummy|sample|none|na|n\/a|abc|xyz|hello|irrelevant|asdf|qwerty|123))*$/i.test(text);
  const uniqueWords = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean));
  const hasActionSignal = /\b(user|customer|admin|system|buyer|seller|manager|agent|dashboard|report|create|update|delete|view|submit|search|filter|login|checkout|upload|download|save|configure|approve|reject|notify|validate)\b/i.test(text);

  if (fillerOnly || words.length < 5 || uniqueWords.size < 4 || !hasActionSignal) {
    return {
      needsDiscussion: true,
      reasoning: 'Story content appears irrelevant, unclear, inappropriate, or not actionable enough to estimate accurately.',
      escalationSuggestion: 'Escalate this story to the user dashboard for clarification. Ask the user to provide the business context, user role, desired action, expected result, and acceptance criteria.'
    };
  }

  if (normalized.includes('inappropriate') || normalized.includes('irrelevant')) {
    return {
      needsDiscussion: true,
      reasoning: 'Story content is marked as irrelevant or inappropriate and should be clarified before estimation.',
      escalationSuggestion: 'Escalate this story to the user dashboard and request a meaningful replacement story with clear intent and testable outcomes.'
    };
  }

  return {
    needsDiscussion: false,
    reasoning: '',
    escalationSuggestion: ''
  };
}

function estimateStoryPointsHeuristic(userStory) {
  const text = String(userStory || '').trim();
  if (!text) {
    return 1;
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  const criteriaCount = (text.match(/\n\s*[-*\d.]+\s+/g) || []).length;
  let complexityScore = 0;

  if (words > 40) complexityScore += 1;
  if (words > 90) complexityScore += 1;
  if (criteriaCount >= 3) complexityScore += 1;
  if (criteriaCount >= 6) complexityScore += 1;

  if (/\b(payment|checkout|refund|invoice|billing)\b/i.test(text)) complexityScore += 1;
  if (/\b(auth|login|oauth|permission|role|security)\b/i.test(text)) complexityScore += 1;
  if (/\b(integration|api|webhook|sync|import|export)\b/i.test(text)) complexityScore += 1;
  if (/\b(report|dashboard|analytics|filter|search|sort)\b/i.test(text)) complexityScore += 1;

  // Map to 3-point scale: 1=half day, 2=full day, 3=2 working days
  if (complexityScore <= 1) return 1;
  if (complexityScore <= 3) return 2;
  return 3;
}

function extractJsonObjectFromText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    // Continue to relaxed extraction.
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // Continue.
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
}

const STORY_POINT_DEFINITIONS = [
  '0 points = story is unclear, irrelevant, inappropriate, or needs discussion before estimation',
  '1 point  = half day of work',
  '2 points = one full working day',
  '3 points = two full working days'
].join('\n');

async function estimateStoryPoints({ userStory = '', storyFolder = '' } = {}) {
  const discussionCheck = evaluateStoryForDiscussion(userStory);
  if (discussionCheck.needsDiscussion) {
    return {
      storyPoints: 0,
      storyPointLabel: '0 points – may need discussion',
      source: 'quality-gate',
      reasoning: discussionCheck.reasoning,
      escalationSuggestion: discussionCheck.escalationSuggestion,
      needsDiscussion: true,
      estimatedAt: new Date().toISOString(),
      storyFolder: String(storyFolder || '').trim()
    };
  }

  const heuristicPoints = estimateStoryPointsHeuristic(userStory);
  const heuristicLabel = STORY_POINT_SCALE.find((entry) => entry.points === heuristicPoints)?.label || String(heuristicPoints);

  if (!config.aiEnabled) {
    return {
      storyPoints: heuristicPoints,
      storyPointLabel: heuristicLabel,
      source: 'heuristic',
      reasoning: 'AI not configured; estimated using local heuristic based on story scope.',
      escalationSuggestion: '',
      needsDiscussion: false,
      estimatedAt: new Date().toISOString(),
      storyFolder: String(storyFolder || '').trim()
    };
  }

  try {
    const responseText = await askClaude({
      system: [
        'You are an agile story-point estimation agent.',
        'Use ONLY this scale:',
        STORY_POINT_DEFINITIONS,
        'If the story is irrelevant, inappropriate, meaningless, or not actionable, return storyPoints 0 and mark it as needing discussion.',
        'Analyse the user story and return ONLY strict JSON with four keys:',
        '  storyPoints: integer (0, 1, 2, or 3)',
        '  reasoning: one concise sentence explaining your choice in terms of the scale above.',
        '  needsDiscussion: boolean',
        '  escalationSuggestion: one concise sentence suggesting what clarification should be requested if needsDiscussion is true.'
      ].join('\n'),
      user: [
        `Story folder: ${String(storyFolder || '').trim() || 'N/A'}`,
        '\nUser story:',
        String(userStory || '').trim() || '(empty)'
      ].join('\n'),
      maxTokens: 280
    });

    const parsed = extractJsonObjectFromText(responseText) || {};
    const storyPoints = normalizeStoryPoints(parsed.storyPoints);
    const needsDiscussion = Boolean(parsed.needsDiscussion) || storyPoints === 0;
    const safePoints = needsDiscussion ? 0 : (storyPoints || heuristicPoints);
    const label = STORY_POINT_SCALE.find((entry) => entry.points === safePoints)?.label || String(safePoints);
    const reasoning = String(parsed.reasoning || '').trim() || (needsDiscussion
      ? 'Story content needs discussion before it can be estimated accurately.'
      : 'Estimated from story scope and acceptance criteria complexity.');
    const escalationSuggestion = needsDiscussion
      ? (String(parsed.escalationSuggestion || '').trim() || 'Escalate this story to the user dashboard and request clearer business context, action, expected outcome, and acceptance criteria.')
      : '';

    return {
      storyPoints: safePoints,
      storyPointLabel: label,
      source: 'ai',
      reasoning,
      escalationSuggestion,
      needsDiscussion,
      estimatedAt: new Date().toISOString(),
      storyFolder: String(storyFolder || '').trim()
    };
  } catch {
    return {
      storyPoints: heuristicPoints,
      storyPointLabel: heuristicLabel,
      source: 'heuristic-fallback',
      reasoning: 'AI estimation failed; fallback heuristic used.',
      escalationSuggestion: '',
      needsDiscussion: false,
      estimatedAt: new Date().toISOString(),
      storyFolder: String(storyFolder || '').trim()
    };
  }
}

async function saveStoryPointEstimate({ projectId = '', storyFolder = '', estimate = null } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  if (!safeProjectId || !safeStoryFolder || !estimate) {
    return;
  }

  const projectStoryDir = path.join(projectDataRootDir, safeProjectId, 'stories', safeStoryFolder);
  await fs.mkdir(projectStoryDir, { recursive: true });

  const metaPath = path.join(projectStoryDir, 'story-meta.json');
  const existingMeta = await readJsonFileIfExists(metaPath, {});
  const storyPoints = normalizeStoryPoints(estimate.storyPoints);

  const nextMeta = {
    ...existingMeta,
    storyFolder: safeStoryFolder,
    storyPoints,
    storyPointEstimate: {
      storyPoints,
      storyPointLabel: String(estimate.storyPointLabel || String(storyPoints)),
      source: String(estimate.source || 'heuristic'),
      reasoning: String(estimate.reasoning || ''),
      escalationSuggestion: String(estimate.escalationSuggestion || ''),
      needsDiscussion: Boolean(estimate.needsDiscussion),
      estimatedAt: String(estimate.estimatedAt || new Date().toISOString())
    },
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(metaPath, JSON.stringify(nextMeta, null, 2));
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

async function saveDefaultUrlForSelectedProject(appUrl, urlEnvironment = '') {
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
  const normalizedEnvironment = normalizeUrlEnvironment(urlEnvironment);
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
        environment: normalizedEnvironment || normalizeUrlEnvironment(existing.environment) || inferUrlEnvironmentFromLabel(existing.label),
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
      label: normalizedEnvironment || 'Default URL',
      url: sanitized,
      environment: normalizedEnvironment,
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

async function saveStoryRunUrl({ projectId = '', storyFolder = '', appUrl = '', urlEnvironment = '' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  const safeAppUrl = String(appUrl || '').trim();
  if (!safeProjectId || !safeStoryFolder || !isHttpUrl(safeAppUrl)) {
    return;
  }

  const normalizedEnvironment = normalizeUrlEnvironment(urlEnvironment);
  const projectStoryDir = path.join(projectDataRootDir, safeProjectId, 'stories', safeStoryFolder);
  await fs.mkdir(projectStoryDir, { recursive: true });

  const metaPath = path.join(projectStoryDir, 'story-meta.json');
  const existingMeta = await readJsonFileIfExists(metaPath, {});
  const now = new Date().toISOString();

  const runUrlHistory = Array.isArray(existingMeta?.runUrlHistory)
    ? existingMeta.runUrlHistory
        .map((entry) => ({
          appUrl: String(entry?.appUrl || '').trim(),
          environment: normalizeUrlEnvironment(entry?.environment),
          recordedAt: String(entry?.recordedAt || '').trim()
        }))
        .filter((entry) => isHttpUrl(entry.appUrl))
    : [];

  runUrlHistory.unshift({
    appUrl: safeAppUrl,
    environment: normalizedEnvironment,
    recordedAt: now
  });

  const dedupedHistory = [];
  const seen = new Set();
  for (const entry of runUrlHistory) {
    const key = `${entry.appUrl}::${entry.environment}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedHistory.push(entry);
    if (dedupedHistory.length >= 20) {
      break;
    }
  }

  const nextMeta = {
    ...existingMeta,
    storyFolder: safeStoryFolder,
    lastRunAppUrl: safeAppUrl,
    lastRunUrlEnvironment: normalizedEnvironment,
    lastRunAt: now,
    runUrlHistory: dedupedHistory,
    updatedAt: now
  };

  await fs.writeFile(metaPath, JSON.stringify(nextMeta, null, 2));
}

function archiveStatePath(projectId) {
  return path.join(projectDataRootDir, String(projectId || '').trim(), 'archive-state.json');
}

function normalizeArchiveState(value) {
  const rawStories = Array.isArray(value?.archivedStories) ? value.archivedStories : [];
  const rawCases = Array.isArray(value?.archivedCases) ? value.archivedCases : [];
  const archivedStories = [...new Set(rawStories.map((entry) => String(entry || '').trim()).filter(Boolean))].sort();
  const archivedCases = [];
  const seenCaseKeys = new Set();

  for (const entry of rawCases) {
    const storyFolder = String(entry?.storyFolder || '').trim();
    const caseId = String(entry?.caseId || '').trim();
    if (!storyFolder || !caseId) {
      continue;
    }

    const key = `${storyFolder}::${caseId}`;
    if (seenCaseKeys.has(key)) {
      continue;
    }

    seenCaseKeys.add(key);
    archivedCases.push({
      storyFolder,
      caseId,
      archivedAt: String(entry?.archivedAt || '')
    });
  }

  return { archivedStories, archivedCases };
}

async function readArchiveState(projectId) {
  const safeProjectId = String(projectId || '').trim();
  if (!safeProjectId) {
    return { archivedStories: [], archivedCases: [] };
  }

  const raw = await readJsonFileIfExists(archiveStatePath(safeProjectId), {
    archivedStories: [],
    archivedCases: []
  });
  return normalizeArchiveState(raw);
}

async function writeArchiveState(projectId, archiveState) {
  const safeProjectId = String(projectId || '').trim();
  if (!safeProjectId) {
    throw new Error('projectId is required.');
  }

  const nextState = normalizeArchiveState(archiveState);
  const targetPath = archiveStatePath(safeProjectId);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(nextState, null, 2));
  return nextState;
}

function archivedCaseKey(storyFolder, caseId) {
  return `${String(storyFolder || '').trim()}::${String(caseId || '').trim()}`;
}

function buildArchivedCaseSet(archiveState) {
  const archivedCases = Array.isArray(archiveState?.archivedCases) ? archiveState.archivedCases : [];
  return new Set(archivedCases.map((entry) => archivedCaseKey(entry?.storyFolder, entry?.caseId)).filter((entry) => entry !== '::'));
}

async function archiveProjectStory({ projectId = '', storyFolder = '' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  if (!safeProjectId) {
    throw new Error('projectId is required.');
  }
  if (!safeStoryFolder) {
    throw new Error('storyFolder is required.');
  }

  const registry = await readProjectRegistry();
  const project = registry.projects.find((entry) => entry.id === safeProjectId);
  if (!project) {
    throw new Error('Project not found.');
  }

  const archiveState = await readArchiveState(safeProjectId);
  if (!archiveState.archivedStories.includes(safeStoryFolder)) {
    archiveState.archivedStories.push(safeStoryFolder);
    archiveState.archivedStories.sort();
  }

  const nextState = await writeArchiveState(safeProjectId, archiveState);
  return {
    projectId: safeProjectId,
    storyFolder: safeStoryFolder,
    archivedStories: nextState.archivedStories.length
  };
}

async function archiveManualTestCase({ projectId = '', storyFolder = '', caseId = '' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  const safeCaseId = String(caseId || '').trim();
  if (!safeProjectId) {
    throw new Error('projectId is required.');
  }
  if (!safeStoryFolder) {
    throw new Error('storyFolder is required.');
  }
  if (!safeCaseId) {
    throw new Error('caseId is required.');
  }

  const registry = await readProjectRegistry();
  const project = registry.projects.find((entry) => entry.id === safeProjectId);
  if (!project) {
    throw new Error('Project not found.');
  }

  const archiveState = await readArchiveState(safeProjectId);
  const archivedCases = Array.isArray(archiveState.archivedCases) ? archiveState.archivedCases : [];
  const key = archivedCaseKey(safeStoryFolder, safeCaseId);
  const exists = archivedCases.some((entry) => archivedCaseKey(entry?.storyFolder, entry?.caseId) === key);
  if (!exists) {
    archivedCases.push({
      storyFolder: safeStoryFolder,
      caseId: safeCaseId,
      archivedAt: new Date().toISOString()
    });
  }

  const nextState = await writeArchiveState(safeProjectId, {
    ...archiveState,
    archivedCases
  });

  return {
    projectId: safeProjectId,
    storyFolder: safeStoryFolder,
    caseId: safeCaseId,
    archivedCases: nextState.archivedCases.length
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
  const requestedProjectId = String(projectId || '').trim();
  let storyFolders = await listDirectories(generatedTestsDir);
  const archiveState = requestedProjectId
    ? await readArchiveState(requestedProjectId)
    : { archivedStories: [], archivedCases: [] };
  const archivedStoriesSet = new Set(Array.isArray(archiveState?.archivedStories) ? archiveState.archivedStories : []);
  const archivedCasesSet = buildArchivedCaseSet(archiveState);

  if (requestedProjectId) {
    const registry = await readProjectRegistry();
    const project = registry.projects.find((entry) => entry.id === requestedProjectId);
    const allowedStoryFolders = Array.isArray(project?.storyFolders)
      ? project.storyFolders.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
    // For a selected project, show only explicitly mapped stories. If none are mapped yet,
    // keep the list empty instead of leaking stories from other projects.
    storyFolders = storyFolders.filter((folder) => allowedStoryFolders.includes(folder));
  }
  storyFolders = storyFolders.filter((folder) => !archivedStoriesSet.has(folder));
  const items = [];

  for (const storyFolder of storyFolders) {
    const storyDir = path.join(generatedTestsDir, storyFolder);
    const manualPath = path.join(storyDir, 'manual-test-cases.json');
    const manualCatalog = await readJsonFileIfExists(manualPath, {});
    const testCases = Array.isArray(manualCatalog?.testCases) ? manualCatalog.testCases : [];
    const storyTitle = String(manualCatalog?.storyTitle || storyFolder);

    const automatableCaseIds = new Set(
      testCases
        .filter((entry) => Boolean(entry?.automationCandidate))
        .map((entry) => String(entry?.id || '').trim())
        .filter(Boolean)
    );

    const testCasesDir = path.join(storyDir, 'test-cases');
    const scriptFiles = await listFilesRecursive(testCasesDir, '.spec.js');
    const automatedScriptByCaseId = new Map();
    for (const scriptPath of scriptFiles) {
      const relativePath = path.relative(testCasesDir, scriptPath).replace(/\\/g, '/');
      const pathParts = relativePath.split('/');
      const caseId = String(pathParts[0] || '').trim();
      if (!caseId) {
        continue;
      }
      automatableCaseIds.add(caseId);
      const list = automatedScriptByCaseId.get(caseId) || [];
      list.push(relativePath);
      automatedScriptByCaseId.set(caseId, list);
    }

    for (const testCase of testCases) {
      const caseId = String(testCase?.id || '').trim();
      if (archivedCasesSet.has(archivedCaseKey(storyFolder, caseId))) {
        continue;
      }

      // Keep lists exclusive: automatable/automated cases should appear only in automated list.
      if (automatableCaseIds.has(caseId)) {
        continue;
      }

      items.push({
        storyFolder,
        storyTitle,
        source: 'manual',
        caseId,
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

    for (const [caseId, caseScripts] of automatedScriptByCaseId.entries()) {
      if (archivedCasesSet.has(archivedCaseKey(storyFolder, caseId))) {
        continue;
      }
      const firstScript = String(caseScripts?.[0] || '').trim();
      const fileName = firstScript
        ? String(firstScript.split('/').at(-1) || '').trim()
        : `${caseId}.spec.js`;
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
        automationReason: firstScript || String(linkedManualCase?.automationReason || ''),
        scriptPath: firstScript ? `generated_tests/${storyFolder}/test-cases/${firstScript}` : ''
      });
    }

    // Include automatable cases in automated list even before script generation, so they do not reappear as manual duplicates.
    for (const caseId of automatableCaseIds) {
      if (automatedScriptByCaseId.has(caseId)) {
        continue;
      }
      if (archivedCasesSet.has(archivedCaseKey(storyFolder, caseId))) {
        continue;
      }

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
        title: String(linkedManualCase?.title || caseId),
        description: String(linkedManualCase?.description || linkedManualCase?.title || caseId),
        type: 'automated-script',
        priority: '',
        preconditions: Array.isArray(linkedManualCase?.preconditions) ? linkedManualCase.preconditions : [],
        steps: Array.isArray(linkedManualCase?.steps) ? linkedManualCase.steps : [],
        expectedResult: String(linkedManualCase?.expectedResult || ''),
        actualResult: String(resultEntry.actualResult || ''),
        status: String(resultEntry.status || 'Not Run'),
        automationReason: String(linkedManualCase?.automationReason || 'Marked as automatable'),
        scriptPath: ''
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

async function readSavedUserStoryContent({ projectId = '', storyFolder = '' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const safeStoryFolder = String(storyFolder || '').trim();
  if (!safeProjectId || !safeStoryFolder) {
    return '';
  }

  const projectStoryDir = path.join(projectDataRootDir, safeProjectId, 'stories', safeStoryFolder);
  const storyFileCandidates = ['user-story.txt', 'user_story.txt'];
  for (const fileName of storyFileCandidates) {
    const filePath = path.join(projectStoryDir, fileName);
    if (await pathExists(filePath)) {
      const content = String(await fs.readFile(filePath, 'utf8')).trim();
      if (content) {
        return content;
      }
    }
  }

  return '';
}

async function readProjectStories({ projectId = '' } = {}) {
  const safeProjectId = String(projectId || '').trim();
  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const registry = await readProjectRegistry();
  const project = safeProjectId
    ? registry.projects.find((entry) => entry.id === safeProjectId)
    : null;
  const archiveState = safeProjectId
    ? await readArchiveState(safeProjectId)
    : { archivedStories: [], archivedCases: [] };
  const archivedStoriesSet = new Set(Array.isArray(archiveState?.archivedStories) ? archiveState.archivedStories : []);

  let storyFolders = Array.isArray(project?.storyFolders)
    ? project.storyFolders.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  if (!safeProjectId && storyFolders.length === 0) {
    storyFolders = await listDirectories(generatedTestsDir);
  }
  storyFolders = storyFolders.filter((storyFolder) => !archivedStoriesSet.has(storyFolder));

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

    let storyPoints = 0;
    let storyPointEstimate = null;
    let lastRunAppUrl = '';
    let lastRunUrlEnvironment = '';
    let lastRunAt = '';
    if (safeProjectId) {
      const projectStoryDir = path.join(projectDataRootDir, safeProjectId, 'stories', storyFolder);
      const storyMeta = await readJsonFileIfExists(path.join(projectStoryDir, 'story-meta.json'), {});
      storyPoints = normalizeStoryPoints(storyMeta?.storyPoints);
      storyPointEstimate = storyMeta?.storyPointEstimate || null;
      lastRunAppUrl = isHttpUrl(storyMeta?.lastRunAppUrl) ? String(storyMeta.lastRunAppUrl).trim() : '';
      lastRunUrlEnvironment = normalizeUrlEnvironment(storyMeta?.lastRunUrlEnvironment);
      lastRunAt = String(storyMeta?.lastRunAt || '').trim();
    }

    items.push({
      storyFolder,
      content: storyContent,
      source: storySource,
      storyPoints,
      storyPointEstimate,
      lastRunAppUrl,
      lastRunUrlEnvironment,
      lastRunAt
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
  return null;
}

async function appendPrecheckFailure({ reason, appUrl, userStory, runType = 'FULL', urlEnvironment = '' }) {
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
    urlEnvironment: normalizeUrlEnvironment(urlEnvironment),
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
        urlId: defaultUrlEntry.id,
        urlEnvironment: normalizeUrlEnvironment(defaultUrlEntry.environment) || inferUrlEnvironmentFromLabel(defaultUrlEntry.label)
      };
    }
  }

  return {
    appUrl: await readDefaultUrlFromEnvFile(),
    projectId: String(selectedProject?.id || ''),
    projectName: String(selectedProject?.name || ''),
    urlId: '',
    urlEnvironment: ''
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

async function runPipeline({ appUrl, userStory, existingStoryFolder = '', urlEnvironment = '' }) {
  if (isRunInProgress) {
    return { ok: false, status: 409, error: 'A test run is already in progress. Please wait for completion.' };
  }

  isRunInProgress = true;
  const startedAt = new Date().toISOString();
  const projectInfo = await getSelectedProjectInfo();
  const normalizedRunEnvironment = normalizeUrlEnvironment(urlEnvironment);

  // If an existing storyFolder is provided, parse its projectCode and storyNumber from it
  // so we write results back to the same folder instead of creating a new one.
  let projectCode;
  let storyNumber;
  let storySource;
  let storyFolder;
  const folderMatch = String(existingStoryFolder || '').match(/^(.+)_Story_(\d+)$/i);
  if (folderMatch) {
    projectCode = normalizeProjectCode(folderMatch[1]);
    storyNumber = Number.parseInt(folderMatch[2], 10);
    storyFolder = existingStoryFolder;
    storySource = `${storyFolder} (re-run)`;
  } else {
    projectCode = normalizeProjectCode(projectInfo?.projectName || projectInfo?.projectId || 'PRJ');
    storyNumber = await getNextStorySequenceNumber();
    storyFolder = buildStoryName(projectCode, storyNumber);
    storySource = `Story ${storyNumber} (UI input)`;
  }

  const storyId = toSafeId(storyFolder);
  const runId = `run_${Date.now()}`;
  activeRun = {
    runId,
    startedAt,
    projectInfo,
    projectCode,
    storyNumber,
    storyFolder,
    storySource,
    appUrl,
    userStory,
    stopRequested: false,
    proc: null
  };

  return new Promise((resolve) => {
    let output = '';
    const maxChars = 30_000;

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
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });

    if (activeRun && activeRun.runId === runId) {
      activeRun.proc = proc;
      if (activeRun.stopRequested) {
        sendStopSignal(proc, 'SIGTERM');
      }
    }

    proc.stdout.on('data', (data) => append(String(data)));
    proc.stderr.on('data', (data) => append(String(data)));

    proc.on('error', async (error) => {
      isRunInProgress = false;
      activeRun = null;
      const finishedAt = new Date().toISOString();
      const entry = {
        runId,
        startedAt,
        finishedAt,
        runType: 'FULL',
        appUrl: String(appUrl || '').trim(),
        urlEnvironment: normalizedRunEnvironment,
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
      const wasStopped = Boolean(activeRun?.runId === runId && activeRun?.stopRequested);
      let buildError = null;

      isRunInProgress = false;
      activeRun = null;
      const finishedAt = new Date().toISOString();
      let totals = { executed: 0, passed: 0, failed: 0 };
      let storyPointEstimate = null;

      if (!wasStopped) {
        try {
          await buildReportData();
        } catch (error) {
          buildError = error;
        }
        totals = await readLatestReportTotals(storyFolder);
        storyPointEstimate = await estimateStoryPoints({ userStory, storyFolder });
        await saveStoryPointEstimate({
          projectId: String(projectInfo?.projectId || ''),
          storyFolder,
          estimate: storyPointEstimate
        });
      }

      const entry = {
        runId,
        startedAt,
        finishedAt,
        runType: 'FULL',
        appUrl: String(appUrl || '').trim(),
        urlEnvironment: normalizedRunEnvironment,
        storyFolder,
        storySource,
        projectId: String(projectInfo?.projectId || ''),
        projectName: String(projectInfo?.projectName || ''),
        status: wasStopped ? 'STOPPED' : (code === 0 ? 'PASS' : 'FAIL'),
        exitCode: typeof code === 'number' ? Number(code) : -1,
        outputTail: output.trim(),
        storyPoints: Number(storyPointEstimate?.storyPoints || 0),
        storyPointEstimate,
        totals
      };

      await appendRunHistory(entry);
      if (!wasStopped) {
        await trackProjectStoryFolder(entry.projectId, storyFolder);
        await persistProjectRunArtifacts({ runEntry: entry, includeStoryFolder: storyFolder });
      }

      if (buildError) {
        resolve({ ok: false, status: 500, error: buildError.message, entry });
        return;
      }

      if (wasStopped) {
        resolve({ ok: true, status: 200, entry });
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

async function runRegressionPipeline({ appUrl, selectedScripts = [], suiteName = '', urlEnvironment = '' }) {
  if (isRunInProgress) {
    return { ok: false, status: 409, error: 'A test run is already in progress. Please wait for completion.' };
  }

  isRunInProgress = true;
  const startedAt = new Date().toISOString();
  const projectInfo = await getSelectedProjectInfo();
  const normalizedRunEnvironment = normalizeUrlEnvironment(urlEnvironment);

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

    activeRun = {
      runId,
      startedAt,
      projectInfo,
      appUrl,
      userStory: '',
      stopRequested: false,
      proc,
      runType: 'REGRESSION',
      suiteName: safeSuiteName,
      selectedScripts: safeSelectedScripts
    };

    if (activeRun.stopRequested) {
      sendStopSignal(proc, 'SIGTERM');
    }

    proc.stdout.on('data', (data) => append(String(data)));
    proc.stderr.on('data', (data) => append(String(data)));

    proc.on('error', async (error) => {
      isRunInProgress = false;
      activeRun = null;
      const finishedAt = new Date().toISOString();
      const entry = {
        runId,
        startedAt,
        finishedAt,
        runType: 'REGRESSION',
        appUrl: String(appUrl || '').trim(),
        urlEnvironment: normalizedRunEnvironment,
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
      const wasStopped = Boolean(activeRun?.runId === runId && activeRun?.stopRequested);
      let buildError = null;
      if (!wasStopped) {
        try {
          await buildReportData();
        } catch (error) {
          buildError = error;
        }
      }

      isRunInProgress = false;
      activeRun = null;
      const finishedAt = new Date().toISOString();
      let totals = { executed: 0, passed: 0, failed: 0 };
      if (!wasStopped) {
        const parsedTotals = parseRegressionTotals(output);
        const fallbackTotals = await readLatestReportTotals();
        totals = parsedTotals.executed > 0 ? {
          executed: parsedTotals.executed,
          passed: parsedTotals.passed,
          failed: parsedTotals.failed
        } : fallbackTotals;
      }

      const entry = {
        runId,
        startedAt,
        finishedAt,
        runType: 'REGRESSION',
        appUrl: String(appUrl || '').trim(),
        urlEnvironment: normalizedRunEnvironment,
        suiteName: safeSuiteName,
        selectedScripts: safeSelectedScripts,
        projectId: String(projectInfo?.projectId || ''),
        projectName: String(projectInfo?.projectName || ''),
        status: wasStopped ? 'STOPPED' : (code === 0 ? 'PASS' : 'FAIL'),
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
    if (runId) {
      const history = await readRunHistory();
      const runEntry = history.find((entry) => String(entry?.runId || '').trim() === runId);
      if (String(runEntry?.status || '').trim().toUpperCase() === 'STOPPED') {
        writeJson(req, res, 409, { error: 'Execution Interrupted. No report is available for this interrupted run.' });
        return;
      }
    }

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
        const registry = await readProjectRegistry();
        registry.selectedProjectId = '';
        await writeProjectRegistry(registry);
        writeJson(req, res, 200, { selectedProjectId: '' });
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
      const environment = normalizeUrlEnvironment(body.environment) || inferUrlEnvironmentFromLabel(label);

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
            environment,
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
          environment,
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

  if (req.method === 'POST' && url.pathname === '/api/project-stories/estimate') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      const storyFolder = String(body.storyFolder || '').trim();

      if (!projectId) {
        writeJson(req, res, 400, { error: 'projectId is required.' });
        return;
      }
      if (!storyFolder) {
        writeJson(req, res, 400, { error: 'storyFolder is required.' });
        return;
      }

      const registry = await readProjectRegistry();
      const project = registry.projects.find((entry) => entry.id === projectId);
      if (!project) {
        writeJson(req, res, 404, { error: 'Project not found.' });
        return;
      }

      // Read story content from project-data or generated_tests
      const storyText = await readStoryTextForFolder({ projectId, storyFolder });
      const userStory = String(storyText?.content || '').trim();
      if (!userStory) {
        writeJson(req, res, 400, { error: 'Story content is unavailable. Add story content before estimating story points.' });
        return;
      }

      const estimate = await estimateStoryPoints({ userStory, storyFolder });
      await saveStoryPointEstimate({ projectId, storyFolder, estimate });

      writeJson(req, res, 200, { storyFolder, ...estimate });
      return;
    } catch (error) {
      const message = String(error?.message || 'Unable to estimate story points.');
      const statusCode = message.includes('not found') ? 404 : 500;
      writeJson(req, res, statusCode, { error: message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/project-stories/archive') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      const storyFolder = String(body.storyFolder || '').trim();

      if (!projectId) {
        writeJson(req, res, 400, { error: 'projectId is required.' });
        return;
      }
      if (!storyFolder) {
        writeJson(req, res, 400, { error: 'storyFolder is required.' });
        return;
      }

      const archived = await archiveProjectStory({ projectId, storyFolder });
      writeJson(req, res, 200, { message: 'Story archived.', ...archived });
      return;
    } catch (error) {
      const message = String(error?.message || 'Unable to archive story.');
      const statusCode = message.includes('not found') ? 404 : 400;
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

  if (req.method === 'POST' && url.pathname === '/api/manual-test-cases/archive') {
    try {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      const storyFolder = String(body.storyFolder || '').trim();
      const caseId = String(body.caseId || '').trim();

      if (!projectId) {
        writeJson(req, res, 400, { error: 'projectId is required.' });
        return;
      }
      if (!storyFolder) {
        writeJson(req, res, 400, { error: 'storyFolder is required.' });
        return;
      }
      if (!caseId) {
        writeJson(req, res, 400, { error: 'caseId is required.' });
        return;
      }

      const archived = await archiveManualTestCase({ projectId, storyFolder, caseId });
      writeJson(req, res, 200, { message: 'Manual test case archived.', ...archived });
      return;
    } catch (error) {
      const message = String(error?.message || 'Unable to archive manual test case.');
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
      const urlEnvironment = normalizeUrlEnvironment(body.urlEnvironment);
      if (!appUrl) {
        writeJson(req, res, 400, { error: 'appUrl is required.' });
        return;
      }

      const savedProjectUrl = await saveDefaultUrlForSelectedProject(appUrl, urlEnvironment);
      await saveDefaultUrlToEnvFile(appUrl);
      writeJson(req, res, 200, {
        appUrl,
        urlEnvironment,
        savedToProject: Boolean(savedProjectUrl),
        projectUrlId: String(savedProjectUrl?.id || '')
      });
      return;
    } catch (error) {
      writeJson(req, res, 500, { error: error.message });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/stop-run') {
    try {
      const result = await stopActiveRun();
      writeJson(req, res, result.status, result);
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
      const existingStoryFolder = String(body.storyFolder || '').trim();
      const urlEnvironment = normalizeUrlEnvironment(body.urlEnvironment);

      if (!appUrl) {
        const failureEntry = await appendPrecheckFailure({
          reason: 'appUrl is required.',
          appUrl,
          userStory,
          urlEnvironment
        });
        writeJson(req, res, 400, { error: 'appUrl is required.', run: failureEntry });
        return;
      }

      const urlValidation = await validateUrlReachability(appUrl);
      if (!urlValidation.ok) {
        const failureEntry = await appendPrecheckFailure({
          reason: urlValidation.message,
          appUrl,
          userStory,
          urlEnvironment
        });
        writeJson(req, res, 400, { error: urlValidation.message, run: failureEntry });
        return;
      }

      if (!userStory) {
        writeJson(req, res, 400, { error: 'userStory is required.' });
        return;
      }

      if (existingStoryFolder) {
        const selectedProjectInfo = await getSelectedProjectInfo();
        const selectedProjectId = String(selectedProjectInfo?.projectId || '').trim();
        const savedStoryContent = selectedProjectId
          ? await readSavedUserStoryContent({ projectId: selectedProjectId, storyFolder: existingStoryFolder })
          : '';
        if (!savedStoryContent) {
          writeJson(req, res, 400, {
            error: 'Story content is unavailable for this story. Save a valid user story before running tests.'
          });
          return;
        }
      }

      if (saveDefaultUrl) {
        await saveDefaultUrlForSelectedProject(appUrl, urlEnvironment);
        await saveDefaultUrlToEnvFile(appUrl);
      }

      const runResult = await runPipeline({ appUrl, userStory, existingStoryFolder, urlEnvironment });
      if (!runResult.ok) {
        writeJson(req, res, runResult.status, { error: runResult.error || 'Run failed', run: runResult.entry });
        return;
      }

      const selectedProjectInfo = await getSelectedProjectInfo();
      const selectedProjectId = String(selectedProjectInfo?.projectId || '').trim();
      const completedStoryFolder = String(runResult?.entry?.storyFolder || existingStoryFolder || '').trim();
      if (selectedProjectId && completedStoryFolder) {
        await saveStoryRunUrl({
          projectId: selectedProjectId,
          storyFolder: completedStoryFolder,
          appUrl,
          urlEnvironment
        });
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
      const urlEnvironment = normalizeUrlEnvironment(body.urlEnvironment);
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
          runType: 'REGRESSION',
          urlEnvironment
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
          runType: 'REGRESSION',
          urlEnvironment
        });
        writeJson(req, res, 400, { error: urlValidation.message, run: failureEntry });
        return;
      }

      if (saveDefaultUrl) {
        await saveDefaultUrlForSelectedProject(appUrl, urlEnvironment);
        await saveDefaultUrlToEnvFile(appUrl);
      }

      const selectedProjectInfo = await getSelectedProjectInfo();
      const selectedProjectId = String(selectedProjectInfo?.projectId || '').trim();
      let effectiveSelectedScripts = selectedScripts;

      if (selectedProjectId && selectedScripts.length > 0) {
        const allowedPayload = await readManualTestCases({ projectId: selectedProjectId });
        const allowedScriptSet = new Set(
          (Array.isArray(allowedPayload?.items) ? allowedPayload.items : [])
            .filter((item) => String(item?.source || '').toLowerCase() === 'automated')
            .map((item) => String(item?.scriptPath || '').trim().replace(/\\/g, '/'))
            .filter(Boolean)
        );
        effectiveSelectedScripts = selectedScripts.filter((scriptPath) => allowedScriptSet.has(scriptPath));
      }

      if (selectedScripts.length > 0 && effectiveSelectedScripts.length === 0) {
        writeJson(req, res, 400, { error: 'All selected regression scripts are archived or unavailable.' });
        return;
      }

      const runResult = await runRegressionPipeline({ appUrl, selectedScripts: effectiveSelectedScripts, suiteName, urlEnvironment });
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
