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

function toAssetUrl(value) {
  const cleanPath = String(value || '').trim().replace(/^\.\//, '');
  if (!cleanPath) {
    return '';
  }

  if (cleanPath.startsWith('generated_tests/') || cleanPath.startsWith('playwright-report/')) {
    return `/${cleanPath}`;
  }

  return `./${cleanPath}`;
}

function renderGlobalStats(report) {
  const totals = report.totals;
  return [
    ['Total Automated Tests', totals.automated || 0],
    ['Execution Passed', totals.automatedRunPassed || 0],
    ['Execution Failed', totals.automatedRunFailed || 0],
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
    return '<p>No failed automated tests found.</p>';
  }

  return `<ul class="list-block">${failedCases.map((item) => `<li><button type="button" class="debug-btn" data-failed-key="${escapeHtml(item.failedKey)}">${escapeHtml(item.caseId)} - ${escapeHtml(item.title)} (${escapeHtml(item.storyTitle)})</button></li>`).join('')}</ul>`;
}

function collectFailedCases(report) {
  const failedCases = [];
  for (const story of Array.isArray(report?.stories) ? report.stories : []) {
    for (const item of Array.isArray(story?.cases) ? story.cases : []) {
      if (item.executionStatus === 'FAIL') {
        failedCases.push({
          failedKey: `${story.id}::${item.caseId}`,
          storyId: story.id,
          storyTitle: story.title,
          caseId: item.caseId,
          title: item.title,
          failureCause: item.failureCause,
          validationSummary: item.validationSummary,
          debugCommand: item.debugCommand,
          scriptFiles: item.scriptFiles,
          outputTail: item.outputTail
        });
      }
    }
  }

  return failedCases;
}

function collectPassedCases(report) {
  const passedCases = [];
  for (const story of Array.isArray(report?.stories) ? report.stories : []) {
    for (const item of Array.isArray(story?.cases) ? story.cases : []) {
      if (item.executionStatus === 'PASS') {
        passedCases.push({
          storyTitle: story.title,
          caseId: item.caseId,
          title: item.title,
          screenshotFiles: Array.isArray(item.screenshotFiles)
            ? item.screenshotFiles.map((filePath) => toAssetUrl(filePath)).filter(Boolean)
            : []
        });
      }
    }
  }

  return passedCases;
}

function renderPassedCases(passedCases) {
  if (passedCases.length === 0) {
    return '<p>No passed automated tests found yet.</p>';
  }

  return `
    <div class="passed-case-grid">
      ${passedCases.map((item) => `
        <article class="pass-case-card">
          <p class="eyebrow">${escapeHtml(item.storyTitle)}</p>
          <h4>${escapeHtml(item.caseId)} - ${escapeHtml(item.title)}</h4>
          ${item.screenshotFiles.length > 0 ? `
            <div class="screenshot-grid">
              ${item.screenshotFiles.map((screenshotPath) => `
                <a href="${escapeHtml(screenshotPath)}" target="_blank" rel="noopener">
                  <img class="screenshot-thumb" src="${escapeHtml(screenshotPath)}" alt="${escapeHtml(item.caseId)} screenshot" loading="lazy" />
                </a>
              `).join('')}
            </div>
          ` : '<p>No screenshot captured for this passed test.</p>'}
        </article>
      `).join('')}
    </div>
  `;
}

function renderReportDetail(report) {
  const passedCases = collectPassedCases(report);
  const failedCases = collectFailedCases(report);
  const detailPanel = document.getElementById('detail-panel');
  detailPanel.innerHTML = `
    <article class="section-card">
      <p class="eyebrow">Passed Tests With Screenshots</p>
      ${renderPassedCases(passedCases)}
    </article>
    <article class="section-card">
      <p class="eyebrow">Failed Tests (Click To Debug)</p>
      ${renderFailedCases(failedCases)}
    </article>
    <article class="section-card" id="debug-panel">
      <p class="eyebrow">Debug Panel</p>
      <p>Click a failed test to view failure cause and debug steps.</p>
    </article>
  `;

  const failedCaseMap = new Map(failedCases.map((item) => [item.failedKey, item]));
  const debugButtons = [...document.querySelectorAll('.debug-btn')];
  debugButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const failedKey = button.getAttribute('data-failed-key');
      const failedItem = failedCaseMap.get(String(failedKey || ''));
      renderDebugPanel(failedItem);
    });
  });
}

function renderDebugPanel(item) {
  const debugPanel = document.getElementById('debug-panel');
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
  const cacheBust = Date.now();
  const response = await fetch(`./data/report-data.json?t=${cacheBust}`, { cache: 'no-store' });
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
  const cacheBust = Date.now();
  if (!runId) {
    return `./report.html?t=${cacheBust}`;
  }
  return `./report.html?runId=${encodeURIComponent(runId)}&t=${cacheBust}`;
}

async function loadHistory() {
  const cacheBust = Date.now();
  const response = await fetch(`/api/history?t=${cacheBust}`, { cache: 'no-store' });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !contentType.includes('application/json')) {
    return [];
  }
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function checkApiHealth() {
  try {
    const cacheBust = Date.now();
    const response = await fetch(`/api/history?t=${cacheBust}`, { cache: 'no-store' });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    return response.ok && contentType.includes('application/json');
  } catch {
    return false;
  }
}

function wireReport(report) {
  document.getElementById('generated-at').textContent = `Generated ${new Date(report.generatedAt).toLocaleString()}`;
  document.getElementById('global-stats').innerHTML = renderGlobalStats(report);
  renderReportDetail(report);
}

async function submitRun(appUrl, userStory, saveDefaultUrl) {
  const response = await fetch('/api/run-tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appUrl, userStory, saveDefaultUrl })
  });

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Run failed');
    }
    return payload;
  }

  const rawText = await response.text();
  const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 120);
  throw new Error(
    `Run failed: server returned non-JSON response (${response.status}). ` +
    `Make sure Report UI server is running with npm start. Response preview: ${preview}`
  );
}

async function loadDefaultUrl() {
  const cacheBust = Date.now();
  const response = await fetch(`/api/default-url?t=${cacheBust}`, { cache: 'no-store' });
  if (!response.ok) {
    return '';
  }

  const payload = await response.json();
  return String(payload.appUrl || '').trim();
}

async function loadManualTestCases() {
  const cacheBust = Date.now();
  const response = await fetch(`/api/manual-test-cases?t=${cacheBust}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load manual test cases.');
  }

  return response.json();
}

function renderManualCasesTable(items) {
  if (!items || items.length === 0) {
    return '<p>No manual test cases found.</p>';
  }

  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.storyFolder)}</td>
      <td>${escapeHtml(item.storyTitle)}</td>
      <td>${escapeHtml(item.caseId)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.priority)}</td>
      <td>${escapeHtml(item.expectedResult)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-wrap">
      <table class="cases-table">
        <thead>
          <tr>
            <th>Story Folder</th>
            <th>Story Title</th>
            <th>Case ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Expected Result</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function initRunnerPage() {
  const runStatus = document.getElementById('run-status');
  const appUrlInput = document.getElementById('app-url');
  const fileInput = document.getElementById('user-story-file');
  const storyInput = document.getElementById('user-story-input');
  const saveDefaultUrlInput = document.getElementById('save-default-url');
  const runBtn = document.getElementById('run-tests-btn');
  const showReportBtn = document.getElementById('show-report-btn');
  const testCasesBtn = document.getElementById('test-cases-btn');
  const manualCasesPanel = document.getElementById('manual-cases-panel');
  const manualCasesMeta = document.getElementById('manual-cases-meta');
  const manualCasesView = document.getElementById('manual-cases-view');
  const downloadWordBtn = document.getElementById('download-word-btn');
  const downloadExcelBtn = document.getElementById('download-excel-btn');
  const historyList = document.getElementById('history-list');
  const historyDetail = document.getElementById('history-detail');
  let manualCasesLoaded = false;
  let manualCasesAvailable = false;
  let latestManualCasesPayload = null;
  let runLockedAfterSuccess = false;

  runBtn.disabled = true;

  function applyApiHealth(isHealthy) {
    if (!isHealthy) {
      runBtn.disabled = true;
      if (!runLockedAfterSuccess) {
        runStatus.textContent = 'Backend API unavailable. Start server with npm start and refresh.';
      }
      return;
    }

    if (!runLockedAfterSuccess) {
      runBtn.disabled = false;
      if (runStatus.textContent.includes('Backend API unavailable')) {
        runStatus.textContent = 'Set URL and user story, then click Run Tests.';
      }
    }
  }

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

  applyApiHealth(await checkApiHealth());

  async function refreshManualCasesAvailability() {
    try {
      const payload = await loadManualTestCases();
      latestManualCasesPayload = payload;
      manualCasesAvailable = Number(payload?.totalCases || 0) > 0;
      testCasesBtn.disabled = !manualCasesAvailable;
      downloadWordBtn.disabled = !manualCasesAvailable;
      downloadExcelBtn.disabled = !manualCasesAvailable;

      if (!manualCasesAvailable) {
        manualCasesLoaded = false;
        manualCasesPanel.classList.add('hidden');
        manualCasesMeta.textContent = 'Manual test cases will appear after generation.';
        manualCasesView.innerHTML = '<p>No manual test cases found.</p>';
      }
    } catch {
      manualCasesAvailable = false;
      latestManualCasesPayload = null;
      testCasesBtn.disabled = true;
      downloadWordBtn.disabled = true;
      downloadExcelBtn.disabled = true;
      manualCasesLoaded = false;
      manualCasesPanel.classList.add('hidden');
      manualCasesMeta.textContent = 'Manual test cases are unavailable.';
      manualCasesView.innerHTML = '<p>No manual test cases found.</p>';
    }
  }

  await refreshHistory();
  await refreshManualCasesAvailability();

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
      runLockedAfterSuccess = true;
      runBtn.disabled = true;
      await refreshHistory();
      manualCasesLoaded = false;
      latestManualCasesPayload = null;
      await refreshManualCasesAvailability();
      if (!manualCasesPanel.classList.contains('hidden')) {
        await showManualCasesPanel();
      }
    } catch (error) {
      runStatus.textContent = `Run failed: ${error.message}`;
      runLockedAfterSuccess = false;
      await refreshHistory();
      manualCasesLoaded = false;
      latestManualCasesPayload = null;
      await refreshManualCasesAvailability();
    } finally {
      applyApiHealth(await checkApiHealth());
    }
  });

  showReportBtn.addEventListener('click', () => {
    window.location.href = toReportUrl('');
  });

  async function showManualCasesPanel() {
    if (!manualCasesAvailable) {
      runStatus.textContent = 'Manual test cases are not generated yet. Run tests first.';
      manualCasesPanel.classList.add('hidden');
      return;
    }

    manualCasesPanel.classList.remove('hidden');
    if (manualCasesLoaded) {
      return;
    }

    manualCasesMeta.textContent = 'Loading manual test cases...';
    manualCasesView.innerHTML = '<p>Loading...</p>';

    try {
      const payload = latestManualCasesPayload || await loadManualTestCases();
      manualCasesLoaded = true;
      latestManualCasesPayload = payload;
      manualCasesMeta.textContent = `Stories: ${payload.storyCount || 0} | Manual test cases: ${payload.totalCases || 0} | Generated: ${new Date(payload.generatedAt).toLocaleString()}`;
      manualCasesView.innerHTML = renderManualCasesTable(payload.items || []);
    } catch (error) {
      manualCasesMeta.textContent = 'Manual test cases are unavailable.';
      manualCasesView.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }

  testCasesBtn.addEventListener('click', async () => {
    await showManualCasesPanel();
    manualCasesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  downloadWordBtn.addEventListener('click', () => {
    window.open('/api/manual-test-cases/download?format=word', '_blank', 'noopener');
  });

  downloadExcelBtn.addEventListener('click', () => {
    window.open('/api/manual-test-cases/download?format=excel', '_blank', 'noopener');
  });
}

async function initReportPage() {
  const backMainBtn = document.getElementById('back-main-btn');
  const playwrightReportBtn = document.getElementById('open-playwright-report-btn');
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

  if (playwrightReportBtn) {
    playwrightReportBtn.addEventListener('click', () => {
      window.open('/playwright-report/index.html', '_blank', 'noopener');
    });
  }
}

async function main() {
  if (document.getElementById('run-tests-btn')) {
    await initRunnerPage();
    return;
  }

  if (document.getElementById('detail-panel')) {
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
