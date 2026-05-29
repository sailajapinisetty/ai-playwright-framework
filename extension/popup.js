// popup.js - adapted from frontend/report-ui/app.js
// Key change: packaged asset URLs use chrome.runtime.getURL

window.__API_BASE_URL = window.__API_BASE_URL || '';

function statusClass(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized.includes('PASS')) return 'pass';
  if (normalized.includes('FAIL')) return 'fail';
  return 'warn';
}

function formatRunStatusLabel(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'STOPPED') {
    return 'Execution Interrupted';
  }
  return normalized || 'UNKNOWN';
}

const rawApiBaseUrl = String(
  window.__API_BASE_URL || window.localStorage.getItem('API_BASE_URL') || ''
).trim();
const API_BASE_URL = rawApiBaseUrl ? rawApiBaseUrl.replace(/\/+$, '') : '';

function apiUrl(path) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) {
    return cleanPath;
  }

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function displayCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toAssetUrl(value) {
  const cleanPath = String(value || '').trim().replace(/^\.\//, '');
  if (!cleanPath) {
    return '';
  }

  // If asset points to generated tests or remote report, prefer API URL
  if (cleanPath.startsWith('generated_tests/') || cleanPath.startsWith('playwright-report/')) {
    return apiUrl(`/${cleanPath}`);
  }

  // For packaged static assets, resolve via chrome.runtime.getURL
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL(cleanPath);
  }

  return `./${cleanPath}`;
}

// --- minimal rendering helpers used by the popup ---
function renderHistoryList(items) {
  const host = document.getElementById('history-list');
  if (!host) return;
  const safe = Array.isArray(items) ? items : [];
  if (safe.length === 0) {
    host.innerHTML = '<p>No runs yet.</p>';
    return;
  }
  host.innerHTML = safe.map((it) => `<div class="history-item"><strong>${escapeHtml(it.runId || 'run')}</strong><div class="history-run-id">${escapeHtml(it.when || '')}</div></div>`).join('');
}

// Try load local data/report-data.json if present in extension package
async function loadPackagedReport() {
  try {
    const url = toAssetUrl('data/report-data.json');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('no packaged report');
    const json = await resp.json();
    // Expecting run history under json.runs or similar; fallback to stories
    const runs = Array.isArray(json?.runs) ? json.runs : [];
    renderHistoryList(runs.slice(-5).map((r) => ({ runId: r.runId || r.id || '', when: r.finishedAt || r.startedAt })));
  } catch (err) {
    // no packaged data; leave default empty state
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPackagedReport();
});
