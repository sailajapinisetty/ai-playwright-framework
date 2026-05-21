function statusClass(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized.includes('PASS')) return 'pass';
  if (normalized.includes('FAIL')) return 'fail';
  return 'warn';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderGlobalStats(report) {
  const totals = report.totals;
  return [
    ['Number Tests', totals.tests || 0],
    ['Manual Tests', totals.manual || 0],
    ['Automated Tests', totals.automated || 0],
    ['Automated Run Passed', totals.automatedRunPassed || 0],
    ['Automated Run Failed', totals.automatedRunFailed || 0],
    ['Overall Coverage', `${report.coverage?.overallPercent || 0}%`]
  ].map(([label, value]) => `
    <article class="metric-card">
      <p class="eyebrow">${label}</p>
      <h3>${escapeHtml(value)}</h3>
    </article>
  `).join('');
}

function renderStoryCard(story) {
  return `
    <article class="story-card" data-story-id="${escapeHtml(story.id)}">
      <p class="eyebrow">${escapeHtml(story.storySource || story.folderName)}</p>
      <h3>${escapeHtml(story.title)}</h3>
      <p>${escapeHtml(story.summary || 'No summary generated yet.')}</p>
      <div class="badge-row">
        <span class="badge ${statusClass(story.overallStatus)}">${escapeHtml(story.overallStatus)}</span>
        <span class="badge">Coverage ${escapeHtml(story.coverage?.percent || 0)}%</span>
        <span class="badge">Missing ${escapeHtml(story.totals?.missing || 0)}</span>
      </div>
    </article>
  `;
}

function renderFailedCases(failedCases) {
  if (failedCases.length === 0) {
    return '<p>No failed automated tests for this story.</p>';
  }

  return `<ul class="list-block">${failedCases.map((item) => `<li><button type="button" class="debug-btn" data-case-id="${escapeHtml(item.caseId)}">${escapeHtml(item.caseId)} - ${escapeHtml(item.title)}</button></li>`).join('')}</ul>`;
}

function renderStoryDetail(story) {
  const failedCases = (story.cases || []).filter((item) => item.executionStatus === 'FAIL');
  const detailPanel = document.getElementById('detail-panel');
  detailPanel.innerHTML = `
    <div class="detail-panel-grid">
      <article class="metric-card">
        <p class="eyebrow">Story Coverage</p>
        <h3>${escapeHtml(story.coverage?.percent || 0)}%</h3>
        <p>${escapeHtml(story.totals?.covered || 0)} covered / ${escapeHtml(story.totals?.automatable || 0)} automatable</p>
      </article>
      <article class="metric-card">
        <p class="eyebrow">Automated Run Results</p>
        <h3>${escapeHtml((story.totals?.automatedRunPassed || 0) + (story.totals?.automatedRunFailed || 0))}</h3>
        <p>${escapeHtml(story.totals?.automatedRunPassed || 0)} passed / ${escapeHtml(story.totals?.automatedRunFailed || 0)} failed</p>
      </article>
      <article class="metric-card">
        <p class="eyebrow">Overall Coverage</p>
        <h3>${escapeHtml(story.coverage?.percent || 0)}%</h3>
        <p>${escapeHtml(story.totals?.covered || 0)} covered / ${escapeHtml(story.totals?.automatable || 0)} total automatable</p>
      </article>
    </div>
    <article class="section-card">
      <p class="eyebrow">Failed Tests (Click To Debug)</p>
      ${renderFailedCases(failedCases)}
    </article>
    <article class="section-card" id="debug-panel">
      <p class="eyebrow">Debug Panel</p>
      <p>Click a failed test to view failure cause and debug steps.</p>
    </article>
  `;
}

function renderDebugPanel(story, caseId) {
  const debugPanel = document.getElementById('debug-panel');
  const item = (story.cases || []).find((testCase) => testCase.caseId === caseId);
  if (!debugPanel || !item) {
    return;
  }

  debugPanel.innerHTML = `
    <p class="eyebrow">Debug Panel</p>
    <h4>${escapeHtml(item.caseId)} - ${escapeHtml(item.title)}</h4>
    <p><strong>Failure Cause:</strong> ${escapeHtml(item.failureCause || item.validationSummary || 'Failure cause not captured.')}</p>
    <p><strong>Debug Command:</strong> ${escapeHtml(item.debugCommand || `npx playwright test ${item.scriptFiles?.[0] || ''} --headed --project=chromium`)}</p>
    <p><strong>Last Output:</strong> ${escapeHtml(item.outputTail || 'No terminal output captured.')}</p>
  `;
}

async function loadReport() {
  const response = await fetch('./data/report-data.json');
  if (!response.ok) {
    throw new Error('Unable to load report data. Run tests first.');
  }

  return response.json();
}

function renderHistory(items) {
  if (!items || items.length === 0) {
    return '<p>No runs yet.</p>';
  }

  return items.map((item) => {
    const when = item.finishedAt || item.startedAt;
    const failedCount = Number(item?.totals?.failed || 0);
    const effectiveStatus = failedCount > 0 ? 'FAIL' : String(item.status || 'UNKNOWN');
    const statusClassName = statusClass(effectiveStatus);
    return `
      <article class="history-item">
        <button type="button" class="history-link" data-run-id="${escapeHtml(item.runId)}">
          <strong>${escapeHtml(new Date(when).toLocaleString())}</strong>
          <span class="badge ${statusClassName}">${escapeHtml(effectiveStatus)}</span>
        </button>
      </article>
    `;
  }).join('');
}

function renderHistoryDetail(item) {
  const totals = item?.totals || { executed: 0, passed: 0, failed: 0 };
  if (!item) {
    return '<p>Click a run time to view details.</p>';
  }

  return `
    <p><strong>Test Run Summary</strong></p>
    <p>Total Executed: ${escapeHtml(totals.executed || 0)}</p>
    <p>Passed: ${escapeHtml(totals.passed || 0)}</p>
    <p>Failed: ${escapeHtml(totals.failed || 0)}</p>
    <div class="actions">
      <button type="button" class="secondary-btn open-report-run-btn" data-run-id="${escapeHtml(item.runId)}">Open Report For This Run</button>
    </div>
  `;
}

function toReportUrl(runId) {
  if (!runId) {
    return './report.html';
  }
  return `./report.html?runId=${encodeURIComponent(runId)}`;
}

async function loadHistory() {
  const response = await fetch('/api/history');
  if (!response.ok) {
    return [];
  }
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

function wireReport(report) {
  document.getElementById('generated-at').textContent = `Generated ${new Date(report.generatedAt).toLocaleString()}`;
  document.getElementById('global-stats').innerHTML = renderGlobalStats(report);

  const storyGrid = document.getElementById('story-grid');
  storyGrid.innerHTML = report.stories.map(renderStoryCard).join('');

  const cards = [...storyGrid.querySelectorAll('.story-card')];
  const storiesById = new Map(report.stories.map((story) => [story.id, story]));

  function selectStory(storyId) {
    const story = storiesById.get(storyId);
    cards.forEach((card) => {
      card.classList.toggle('active', card.dataset.storyId === storyId);
    });
    renderStoryDetail(story);

    const debugButtons = [...document.querySelectorAll('.debug-btn')];
    debugButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const caseId = button.getAttribute('data-case-id');
        renderDebugPanel(story, caseId);
      });
    });
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => selectStory(card.dataset.storyId));
  });

  if (report.stories.length > 0) {
    selectStory(report.stories[0].id);
  }
}

async function submitRun(appUrl, userStory, saveDefaultUrl) {
  const response = await fetch('/api/run-tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appUrl, userStory, saveDefaultUrl })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Run failed');
  }

  return payload;
}

async function loadDefaultUrl() {
  const response = await fetch('/api/default-url');
  if (!response.ok) {
    return '';
  }

  const payload = await response.json();
  return String(payload.appUrl || '').trim();
}

async function initRunnerPage() {
  const runStatus = document.getElementById('run-status');
  const appUrlInput = document.getElementById('app-url');
  const fileInput = document.getElementById('user-story-file');
  const storyInput = document.getElementById('user-story-input');
  const saveDefaultUrlInput = document.getElementById('save-default-url');
  const runBtn = document.getElementById('run-tests-btn');
  const showReportBtn = document.getElementById('show-report-btn');
  const historyList = document.getElementById('history-list');
  const historyDetail = document.getElementById('history-detail');

  historyDetail.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.classList.contains('open-report-run-btn')) {
      const runId = target.getAttribute('data-run-id') || '';
      window.location.href = toReportUrl(runId);
    }
  });

  async function refreshHistory() {
    const items = await loadHistory();
    historyList.innerHTML = renderHistory(items);

    const buttons = [...historyList.querySelectorAll('.history-link')];
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const runId = button.getAttribute('data-run-id');
        const selected = items.find((entry) => entry.runId === runId);
        historyDetail.innerHTML = renderHistoryDetail(selected);
      });
    });

    historyDetail.innerHTML = renderHistoryDetail(items[0] || null);
  }

  await refreshHistory();

  const savedDefaultUrl = await loadDefaultUrl();
  if (savedDefaultUrl && !appUrlInput.value.trim()) {
    appUrlInput.value = savedDefaultUrl;
  }

  try {
    await loadReport();
    showReportBtn.disabled = false;
  } catch {
    showReportBtn.disabled = true;
  }

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    storyInput.value = text;
  });

  runBtn.addEventListener('click', async () => {
    const appUrl = appUrlInput.value.trim();
    const userStory = storyInput.value.trim();

    if (!appUrl) {
      runStatus.textContent = 'Please enter application URL.';
      return;
    }

    if (!userStory) {
      runStatus.textContent = 'Please upload a .txt file or enter user story text.';
      return;
    }

    runBtn.disabled = true;
    showReportBtn.disabled = true;
    runStatus.textContent = 'Running tests. Please wait...';

    try {
      await submitRun(appUrl, userStory, Boolean(saveDefaultUrlInput?.checked));
      runStatus.textContent = 'Run complete. You can open report now.';
      showReportBtn.disabled = false;
      await refreshHistory();
    } catch (error) {
      runStatus.textContent = `Run failed: ${error.message}`;
      await refreshHistory();
    } finally {
      runBtn.disabled = false;
    }
  });

  showReportBtn.addEventListener('click', () => {
    window.location.href = toReportUrl('');
  });
}

async function initReportPage() {
  const backMainBtn = document.getElementById('back-main-btn');
  const generatedAtNode = document.getElementById('generated-at');
  const query = new URLSearchParams(window.location.search);
  const selectedRunId = query.get('runId');

  if (selectedRunId) {
    const items = await loadHistory();
    const selectedRun = items.find((item) => item.runId === selectedRunId);
    if (selectedRun && generatedAtNode) {
      const totals = selectedRun.totals || { executed: 0, passed: 0, failed: 0 };
      generatedAtNode.textContent = `Selected run: ${new Date(selectedRun.finishedAt || selectedRun.startedAt).toLocaleString()} | Executed ${totals.executed || 0}, Passed ${totals.passed || 0}, Failed ${totals.failed || 0}`;
    }
  }

  const report = await loadReport();
  wireReport(report);

  if (backMainBtn) {
    backMainBtn.addEventListener('click', () => {
      window.location.href = './index.html';
    });
  }
}

async function main() {
  if (document.getElementById('run-tests-btn')) {
    await initRunnerPage();
    return;
  }

  if (document.getElementById('story-grid')) {
    await initReportPage();
  }
}

main().catch((error) => {
  const runStatus = document.getElementById('run-status');
  if (runStatus) {
    runStatus.textContent = error.message;
    return;
  }

  const detailPanel = document.getElementById('detail-panel');
  if (detailPanel) {
    detailPanel.innerHTML = `<div class="empty-state"><h3>Report unavailable</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
});
