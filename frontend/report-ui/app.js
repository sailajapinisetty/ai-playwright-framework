function statusClass(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized.includes('PASS')) return 'pass';
  if (normalized.includes('FAIL')) return 'fail';
  return 'warn';
}

const rawApiBaseUrl = String(
  window.__API_BASE_URL || window.localStorage.getItem('API_BASE_URL') || ''
).trim();
const API_BASE_URL = rawApiBaseUrl ? rawApiBaseUrl.replace(/\/+$/, '') : '';

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

function toAssetUrl(value) {
  const cleanPath = String(value || '').trim().replace(/^\.\//, '');
  if (!cleanPath) {
    return '';
  }

  if (cleanPath.startsWith('generated_tests/') || cleanPath.startsWith('playwright-report/')) {
    return apiUrl(`/${cleanPath}`);
  }

  return `./${cleanPath}`;
}

function renderGlobalStats(report) {
  const totals = report.totals;
  return [
    ['Total Tests', totals.tests || 0],
    ['Automated Tests', totals.automated || 0],
    ['Automated Passed', totals.automatedRunPassed || 0],
    ['Execution Failed', totals.automatedRunFailed || 0],
    ['Overall Coverage', `${report.coverage?.overallPercent || 0}%`]
  ].map(([label, value]) => `
    <article class="metric-card">
      <p class="eyebrow">${label}</p>
      <h3>${escapeHtml(value)}</h3>
    </article>
  `).join('');
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

function filterReportForRun(report, selectedRun) {
  if (!report || !selectedRun) {
    return report;
  }

  const runType = String(selectedRun?.runType || 'FULL').toUpperCase();
  if (runType === 'REGRESSION') {
    return report;
  }

  const storyFolder = String(selectedRun?.storyFolder || '').trim();
  if (!storyFolder) {
    return report;
  }

  const stories = Array.isArray(report?.stories) ? report.stories : [];
  const matchedStory = stories.find((story) => String(story?.id || '') === storyFolder);
  if (!matchedStory) {
    return report;
  }

  const selectedStories = [matchedStory];
  const totals = summarizeReportTotals(selectedStories);
  const coverageAutomatable = Number(matchedStory?.totals?.automatable || 0);
  const coverageCovered = Number(matchedStory?.totals?.covered || 0);

  return {
    ...report,
    storyCount: 1,
    stories: selectedStories,
    totals,
    coverage: {
      covered: coverageCovered,
      automatable: coverageAutomatable,
      overallPercent: coverageAutomatable === 0 ? 0 : Math.round((coverageCovered / coverageAutomatable) * 100)
    }
  };
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

function normalizeTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function inferSmartFailureReason(item) {
  const raw = String(item?.failureCause || item?.outputTail || item?.validationSummary || '').trim();
  if (!raw) {
    return 'Failure reason not captured. Re-run with trace for richer diagnostics.';
  }

  const text = raw.toLowerCase();
  if (text.includes('unable to resolve locator') || text.includes('locator')) {
    return 'Likely selector drift or unstable locator. Prefer role/testid selectors and keep fallback strategy updated.';
  }
  if (text.includes('timeout')) {
    return 'Likely synchronization issue (timing/wait condition). Add explicit waits for stable UI state and API completion.';
  }
  if (text.includes('tohaveurl') || text.includes('navigation') || text.includes('net::')) {
    return 'Navigation/environment instability detected. Validate base URL, routing readiness, and network dependencies.';
  }
  if (text.includes('expect(') || text.includes('assert')) {
    return 'Assertion mismatch against current behavior. Re-check expected outcome versus latest product flow.';
  }

  return `Unclassified failure pattern: ${raw.slice(0, 180)}${raw.length > 180 ? '...' : ''}`;
}

function collectAllCases(report) {
  const all = [];
  for (const story of Array.isArray(report?.stories) ? report.stories : []) {
    for (const item of Array.isArray(story?.cases) ? story.cases : []) {
      all.push({
        ...item,
        storyId: story.id,
        storyTitle: story.title,
        missingScenarioTitles: Array.isArray(story?.coverage?.missingScenarioTitles) ? story.coverage.missingScenarioTitles : []
      });
    }
  }
  return all;
}

function computeExecutionTrends(historyItems) {
  const safeItems = Array.isArray(historyItems) ? historyItems : [];
  const sorted = [...safeItems]
    .filter((item) => item?.startedAt && item?.finishedAt)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const points = sorted.slice(-8).map((item) => {
    const started = new Date(item.startedAt).getTime();
    const finished = new Date(item.finishedAt).getTime();
    const durationSec = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, Math.round((finished - started) / 1000)) : 0;
    const totals = item?.totals || {};
    const executed = Number(totals.executed || 0);
    const passed = Number(totals.passed || 0);
    const failed = Number(totals.failed || 0);
    const passRate = executed > 0 ? Math.round((passed / executed) * 100) : (failed === 0 ? 100 : 0);
    return {
      runId: String(item.runId || ''),
      runType: String(item.runType || 'FULL').toUpperCase(),
      when: new Date(item.finishedAt || item.startedAt).toLocaleString(),
      durationSec,
      passRate,
      executed,
      passed,
      failed
    };
  });

  const avgDuration = points.length > 0
    ? Math.round(points.reduce((sum, p) => sum + p.durationSec, 0) / points.length)
    : 0;
  const avgPassRate = points.length > 0
    ? Math.round(points.reduce((sum, p) => sum + p.passRate, 0) / points.length)
    : 0;

  return { points, avgDuration, avgPassRate };
}

function computeQualityInsights(report, historyItems) {
  const allCases = collectAllCases(report);
  const failedCases = allCases.filter((item) => String(item.executionStatus || '').toUpperCase() === 'FAIL');
  const passedCases = allCases.filter((item) => String(item.executionStatus || '').toUpperCase() === 'PASS');

  const duplicatesMap = new Map();
  for (const item of allCases) {
    const key = normalizeTextKey(item.title || item.caseId);
    if (!key) {
      continue;
    }
    const existing = duplicatesMap.get(key) || [];
    existing.push(item);
    duplicatesMap.set(key, existing);
  }
  const duplicateGroups = [...duplicatesMap.values()].filter((group) => group.length > 1);

  const flakyCases = allCases.filter((item) => {
    const historyStatuses = (Array.isArray(item.runHistory) ? item.runHistory : [])
      .map((entry) => String(entry?.executionStatus || '').toUpperCase())
      .filter(Boolean);
    const hasPass = historyStatuses.includes('PASS');
    const hasFail = historyStatuses.includes('FAIL');
    return hasPass && hasFail;
  });

  const highRiskIssues = [];
  for (const item of failedCases) {
    const priority = String(item.priority || '').toLowerCase();
    if (priority === 'high' || priority === 'critical') {
      highRiskIssues.push({
        type: 'Failed high-priority test',
        item,
        detail: inferSmartFailureReason(item)
      });
    }
  }
  for (const item of flakyCases) {
    highRiskIssues.push({
      type: 'Flaky behavior',
      item,
      detail: 'Case has both PASS and FAIL outcomes across runs. Stabilize selectors and waits before release gating.'
    });
  }

  const coverageGaps = [];
  for (const story of Array.isArray(report?.stories) ? report.stories : []) {
    const missing = Array.isArray(story?.coverage?.missingScenarioTitles) ? story.coverage.missingScenarioTitles : [];
    for (const scenario of missing) {
      coverageGaps.push({
        storyTitle: story.title,
        scenario: String(scenario || '').trim()
      });
    }
  }

  const suggestedTests = [];
  for (const item of allCases) {
    for (const suggestion of Array.isArray(item.improvements) ? item.improvements : []) {
      if (suggestedTests.length >= 12) {
        break;
      }
      suggestedTests.push({
        storyTitle: item.storyTitle,
        caseId: item.caseId,
        suggestion: String(suggestion || '').trim()
      });
    }
    if (suggestedTests.length >= 12) {
      break;
    }
  }

  const executionTrends = computeExecutionTrends(historyItems);

  const totalCases = allCases.length;
  const passRate = totalCases > 0 ? (passedCases.length / totalCases) : 0;
  const coveragePercent = Number(report?.coverage?.overallPercent || 0) / 100;
  const flakyPenalty = totalCases > 0 ? (flakyCases.length / totalCases) : 0;
  const duplicatePenalty = totalCases > 0 ? (duplicateGroups.reduce((sum, group) => sum + (group.length - 1), 0) / totalCases) : 0;
  const riskPenalty = Math.min(1, highRiskIssues.length / Math.max(1, totalCases));
  const confidence = Math.max(0, Math.min(100, Math.round(
    (passRate * 45) +
    (coveragePercent * 35) +
    ((1 - flakyPenalty) * 10) +
    ((1 - duplicatePenalty) * 5) +
    ((1 - riskPenalty) * 5)
  )));

  return {
    allCases,
    failedCases,
    passedCases,
    duplicateGroups,
    flakyCases,
    highRiskIssues,
    coverageGaps,
    suggestedTests,
    executionTrends,
    confidence
  };
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

function renderQualityInsights(report, historyItems) {
  const insights = computeQualityInsights(report, historyItems);
  const smartFailureCards = insights.failedCases.length === 0
    ? '<p>No failed tests in this selection.</p>'
    : insights.failedCases.map((item) => `
      <article class="insight-card">
        <p class="eyebrow">${escapeHtml(item.storyTitle)} | ${escapeHtml(item.caseId)}</p>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(inferSmartFailureReason(item))}</p>
      </article>
    `).join('');

  const flakyList = insights.flakyCases.length === 0
    ? '<p>No flaky tests detected from available run history.</p>'
    : `<ul class="list-block">${insights.flakyCases.map((item) => `<li>${escapeHtml(item.caseId)} - ${escapeHtml(item.title)} (${escapeHtml(item.storyTitle)})</li>`).join('')}</ul>`;

  const duplicateList = insights.duplicateGroups.length === 0
    ? '<p>No duplicate test titles detected.</p>'
    : `<ul class="list-block">${insights.duplicateGroups.map((group) => {
      const first = group[0] || {};
      const list = group.map((item) => `${item.caseId} (${item.storyTitle})`).join(', ');
      return `<li>${escapeHtml(first.title || first.caseId)} -> ${escapeHtml(list)}</li>`;
    }).join('')}</ul>`;

  const riskList = insights.highRiskIssues.length === 0
    ? '<p>No high-risk issues detected for this report snapshot.</p>'
    : `<ul class="list-block">${insights.highRiskIssues.slice(0, 12).map((entry) => `<li><strong>${escapeHtml(entry.type)}:</strong> ${escapeHtml(entry.item.caseId)} - ${escapeHtml(entry.detail)}</li>`).join('')}</ul>`;

  const coverageGapList = insights.coverageGaps.length === 0
    ? '<p>No coverage gaps reported by story coverage metadata.</p>'
    : `<ul class="list-block">${insights.coverageGaps.map((gap) => `<li>${escapeHtml(gap.storyTitle)}: ${escapeHtml(gap.scenario)}</li>`).join('')}</ul>`;

  const trends = insights.executionTrends;
  const trendRows = trends.points.length === 0
    ? '<p>No execution trend data yet.</p>'
    : `
      <div class="table-wrap">
        <table class="cases-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Type</th>
              <th>Duration (s)</th>
              <th>Pass Rate</th>
              <th>Executed</th>
            </tr>
          </thead>
          <tbody>
            ${trends.points.map((p) => `
              <tr>
                <td>${escapeHtml(p.when)}</td>
                <td>${escapeHtml(p.runType)}</td>
                <td>${escapeHtml(p.durationSec)}</td>
                <td>${escapeHtml(`${p.passRate}%`)}</td>
                <td>${escapeHtml(p.executed)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p>Average duration: <strong>${escapeHtml(trends.avgDuration)}s</strong> | Average pass rate: <strong>${escapeHtml(trends.avgPassRate)}%</strong></p>
    `;

  const suggestedList = insights.suggestedTests.length === 0
    ? '<p>No AI improvement suggestions found yet.</p>'
    : `<ul class="list-block">${insights.suggestedTests.map((item) => `<li>${escapeHtml(item.caseId)} (${escapeHtml(item.storyTitle)}): ${escapeHtml(item.suggestion)}</li>`).join('')}</ul>`;

  const missingScenariosList = insights.coverageGaps.length === 0
    ? '<p>No missing scenarios were detected.</p>'
    : `<ul class="list-block">${insights.coverageGaps.map((gap) => `<li>${escapeHtml(gap.scenario)}</li>`).join('')}</ul>`;

  return `
    <article class="section-card">
      <p class="eyebrow">AI Quality Intelligence</p>
      <div class="quality-score-row">
        <div>
          <h3>Playwright Test Confidence Score</h3>
          <p>Composite signal from pass rate, coverage, flakiness, duplication, and risk.</p>
        </div>
        <div class="confidence-pill ${insights.confidence >= 75 ? 'pass' : (insights.confidence >= 50 ? 'warn' : 'fail')}">${escapeHtml(`${insights.confidence}/100`)}</div>
      </div>
      <div class="insight-grid">
        <article class="insight-card"><p class="eyebrow">Flaky Tests</p><h4>${escapeHtml(insights.flakyCases.length)}</h4></article>
        <article class="insight-card"><p class="eyebrow">Duplicate Tests</p><h4>${escapeHtml(insights.duplicateGroups.length)}</h4></article>
        <article class="insight-card"><p class="eyebrow">High Risk Issues</p><h4>${escapeHtml(insights.highRiskIssues.length)}</h4></article>
        <article class="insight-card"><p class="eyebrow">Coverage Gaps</p><h4>${escapeHtml(insights.coverageGaps.length)}</h4></article>
      </div>
    </article>

    <article class="section-card">
      <p class="eyebrow">Failed Tests With Smart Reasons</p>
      <div class="insight-grid">${smartFailureCards}</div>
    </article>

    <article class="section-card">
      <p class="eyebrow">Flaky Tests</p>
      ${flakyList}
    </article>

    <article class="section-card">
      <p class="eyebrow">Duplicate Tests</p>
      ${duplicateList}
    </article>

    <article class="section-card">
      <p class="eyebrow">High Risk Issues</p>
      ${riskList}
    </article>

    <article class="section-card">
      <p class="eyebrow">Coverage Gaps</p>
      ${coverageGapList}
    </article>

    <article class="section-card">
      <p class="eyebrow">Execution Time Trends</p>
      ${trendRows}
    </article>

    <article class="section-card">
      <p class="eyebrow">Suggested Tests (AI Recommendations)</p>
      ${suggestedList}
    </article>

    <article class="section-card">
      <p class="eyebrow">Missing Scenarios</p>
      ${missingScenariosList}
    </article>
  `;
}

function renderReportDetail(report, historyItems = []) {
  const passedCases = collectPassedCases(report);
  const failedCases = collectFailedCases(report);
  const detailPanel = document.getElementById('detail-panel');
  const totalTests = Number(report?.totals?.tests || 0);
  const totalAutomated = Number(report?.totals?.automated || 0);
  const totalAutomatedPassed = Number(report?.totals?.automatedRunPassed || 0);
  const totalPassed = Number(report?.totals?.executionPassed || 0);
  const totalFailed = Number(report?.totals?.executionFailed || 0);
  detailPanel.innerHTML = `
    <article class="section-card">
      <p class="eyebrow">Execution Snapshot</p>
      <div class="insight-grid">
        <article class="insight-card"><p class="eyebrow">Total Tests</p><h4>${escapeHtml(totalTests)}</h4></article>
        <article class="insight-card"><p class="eyebrow">Automated Tests</p><h4>${escapeHtml(totalAutomated)}</h4></article>
        <article class="insight-card"><p class="eyebrow">Automated Passed</p><h4>${escapeHtml(totalAutomatedPassed)}</h4></article>
        <article class="insight-card"><p class="eyebrow">Passed Tests</p><h4>${escapeHtml(totalPassed)}</h4></article>
        <article class="insight-card"><p class="eyebrow">Failed Tests</p><h4>${escapeHtml(totalFailed)}</h4></article>
      </div>
    </article>
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
    ${renderQualityInsights(report, historyItems)}
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

async function loadReport(runId = '') {
  const cacheBust = Date.now();
  const safeRunId = String(runId || '').trim();
  const apiQuery = safeRunId
    ? `/api/report-data?runId=${encodeURIComponent(safeRunId)}&t=${cacheBust}`
    : `/api/report-data?t=${cacheBust}`;

  try {
    const apiResponse = await fetch(apiUrl(apiQuery), { cache: 'no-store' });
    const apiType = String(apiResponse.headers.get('content-type') || '').toLowerCase();
    if (apiResponse.ok && apiType.includes('application/json')) {
      return await apiResponse.json();
    }
  } catch {
    // Fall through to static fallback.
  }

  const staticResponse = await fetch(`./data/report-data.json?t=${cacheBust}`, { cache: 'no-store' });
  if (!staticResponse.ok) {
    throw new Error('Unable to load report data. Run tests first.');
  }

  return staticResponse.json();
}

function renderHistory(items) {
  if (!items || items.length === 0) {
    return '<p>No runs yet.</p>';
  }

  return items.map((item) => {
    const when = item.finishedAt || item.startedAt;
    const totals = item?.totals || { executed: 0, passed: 0, failed: 0 };
    const failedCount = Number(item?.totals?.failed || 0);
    const effectiveStatus = failedCount > 0 ? 'FAIL' : String(item.status || 'UNKNOWN');
    const statusClassName = statusClass(effectiveStatus);
    const runType = String(item?.runType || 'FULL').toUpperCase();
    const runTypeBadge = runType === 'REGRESSION'
      ? `<span class="badge">${escapeHtml(runType)}</span>`
      : '';
    const suiteName = String(item?.suiteName || '').trim();
    const suiteLine = suiteName ? `<span class="history-run-id">Suite: ${escapeHtml(suiteName)}</span>` : '';
    const runId = String(item?.runId || '').trim();
    const runIdLine = runId ? `<span class="history-run-id">Run ID: ${escapeHtml(runId)}</span>` : '';
    const canRerunSuite = runType === 'REGRESSION' && Array.isArray(item?.selectedScripts) && item.selectedScripts.length > 0;
    const rerunSuiteButton = canRerunSuite
      ? `<span class="secondary-btn history-open-report-btn rerun-suite-btn" data-run-id="${escapeHtml(item.runId)}">Re-run Suite</span>`
      : '';
    return `
      <article class="history-item">
        <button type="button" class="history-link" data-run-id="${escapeHtml(item.runId)}">
          <strong>${escapeHtml(new Date(when).toLocaleString())}</strong>
          ${runIdLine}
          ${suiteLine}
          <span class="history-summary">Executed ${escapeHtml(totals.executed || 0)}, Passed ${escapeHtml(totals.passed || 0)}, Failed ${escapeHtml(totals.failed || 0)}</span>
          <span class="history-status-row">
            ${runTypeBadge}
            <span class="badge ${statusClassName}">${escapeHtml(effectiveStatus)}</span>
            <span class="secondary-btn history-open-report-btn open-report-run-btn" data-run-id="${escapeHtml(item.runId)}">Open Report</span>
            ${rerunSuiteButton}
          </span>
        </button>
      </article>
    `;
  }).join('');
}

function historySearchText(item) {
  const when = item?.finishedAt || item?.startedAt || '';
  const status = String(item?.status || 'UNKNOWN').toUpperCase();
  const runType = String(item?.runType || 'FULL').toUpperCase();
  const storySource = String(item?.storySource || '');
  const storyFolder = String(item?.storyFolder || '');

  return [
    String(item?.runId || ''),
    status,
    runType,
    storySource,
    storyFolder,
    when,
    new Date(when).toLocaleString()
  ].join(' ').toLowerCase();
}

function getVisibleHistoryItems(items, filterText) {
  const allItems = Array.isArray(items) ? items : [];
  const normalizedFilter = String(filterText || '').trim().toLowerCase();
  if (!normalizedFilter) {
    return {
      items: allItems.slice(0, 5),
      filtered: false,
      total: allItems.length,
      filter: ''
    };
  }

  const matched = allItems.filter((item) => historySearchText(item).includes(normalizedFilter));
  return {
    items: matched,
    filtered: true,
    total: allItems.length,
    filter: normalizedFilter
  };
}

function toReportUrl(runId) {
  const cacheBust = Date.now();
  if (!runId) {
    return `./report.html?t=${cacheBust}`;
  }
  return `./report.html?runId=${encodeURIComponent(runId)}&t=${cacheBust}`;
}

async function loadHistory(projectId = '') {
  const cacheBust = Date.now();
  const projectFilter = String(projectId || '').trim();
  const query = projectFilter
    ? `/api/history?projectId=${encodeURIComponent(projectFilter)}&t=${cacheBust}`
    : `/api/history?t=${cacheBust}`;
  const response = await fetch(apiUrl(query), { cache: 'no-store' });
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
    const response = await fetch(apiUrl(`/api/history?t=${cacheBust}`), { cache: 'no-store' });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    return response.ok && contentType.includes('application/json');
  } catch {
    return false;
  }
}

function wireReport(report, options = {}) {
  const generatedAtNode = document.getElementById('generated-at');
  if (generatedAtNode) {
    const overrideText = String(options?.generatedAtText || '').trim();
    generatedAtNode.textContent = overrideText || `Generated ${new Date(report.generatedAt).toLocaleString()}`;
  }
  document.getElementById('global-stats').innerHTML = renderGlobalStats(report);
  renderReportDetail(report, options.historyItems || []);
}

async function submitRun(appUrl, userStory, saveDefaultUrl) {
  const response = await fetch(apiUrl('/api/run-tests'), {
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

async function submitRegressionRun(appUrl, saveDefaultUrl, selectedScripts = [], suiteName = '') {
  const response = await fetch(apiUrl('/api/run-regression'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appUrl, saveDefaultUrl, selectedScripts, suiteName })
  });

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Regression run failed');
    }
    return payload;
  }

  const rawText = await response.text();
  const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 120);
  throw new Error(
    `Regression run failed: server returned non-JSON response (${response.status}). ` +
    `Make sure Report UI server is running with npm start. Response preview: ${preview}`
  );
}

async function loadDefaultUrl() {
  const cacheBust = Date.now();
  const response = await fetch(apiUrl(`/api/default-url?t=${cacheBust}`), { cache: 'no-store' });
  if (!response.ok) {
    return { appUrl: '', projectId: '', projectName: '', urlId: '' };
  }

  const payload = await response.json();
  return {
    appUrl: String(payload.appUrl || '').trim(),
    projectId: String(payload.projectId || '').trim(),
    projectName: String(payload.projectName || '').trim(),
    urlId: String(payload.urlId || '').trim()
  };
}

async function loadProjects() {
  const cacheBust = Date.now();
  const response = await fetch(apiUrl(`/api/projects?t=${cacheBust}`), { cache: 'no-store' });
  if (!response.ok) {
    return { selectedProjectId: '', projects: [] };
  }

  const payload = await response.json();
  return {
    selectedProjectId: String(payload?.selectedProjectId || '').trim(),
    projects: Array.isArray(payload?.projects) ? payload.projects : []
  };
}

async function createProject(name, description = '') {
  const response = await fetch(apiUrl('/api/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to create project.');
  }

  return payload;
}

async function selectProject(projectId) {
  const response = await fetch(apiUrl('/api/projects/select'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to select project.');
  }

  return payload;
}

async function saveProjectUrl(projectId, label, url, isDefault = false) {
  const response = await fetch(apiUrl('/api/projects/urls'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, label, url, isDefault })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to save project URL.');
  }

  return payload;
}

async function mapProjectStories(projectId) {
  const response = await fetch(apiUrl('/api/projects/map-stories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to map stories to project.');
  }

  return payload;
}

async function saveProjectStory(projectId, content, source = 'UI input') {
  const response = await fetch(apiUrl('/api/project-stories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, content, source })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to save story.');
  }

  return payload;
}

async function loadManualTestCases(projectId = '') {
  const cacheBust = Date.now();
  const safeProjectId = String(projectId || '').trim();
  const query = safeProjectId
    ? `/api/manual-test-cases?projectId=${encodeURIComponent(safeProjectId)}&t=${cacheBust}`
    : `/api/manual-test-cases?t=${cacheBust}`;
  const response = await fetch(apiUrl(query), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load manual test cases.');
  }

  return response.json();
}

async function loadProjectStories(projectId = '') {
  const safeProjectId = String(projectId || '').trim();
  const cacheBust = Date.now();
  const query = safeProjectId
    ? `/api/project-stories?projectId=${encodeURIComponent(safeProjectId)}&t=${cacheBust}`
    : `/api/project-stories?t=${cacheBust}`;
  const response = await fetch(apiUrl(query), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load project stories.');
  }

  return response.json();
}

const MANUAL_CASES_REGRESSION_FILTER = '__REGRESSION__';

function buildManualCaseStoryOptions(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const storyFolder = String(item?.storyFolder || '').trim();
    if (!storyFolder) {
      continue;
    }

    const storyTitle = String(item?.storyTitle || storyFolder).trim();
    if (!map.has(storyFolder)) {
      map.set(storyFolder, storyTitle);
    }
  }

  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function filterManualCasesItems(items, selectedStoryFilter) {
  if (selectedStoryFilter === MANUAL_CASES_REGRESSION_FILTER) {
    return Array.isArray(items) ? items : [];
  }

  return (Array.isArray(items) ? items : []).filter((item) => String(item?.storyFolder || '') === selectedStoryFilter);
}

function renderManualCasesTable(items) {
  if (!items || items.length === 0) {
    return '<p>No manual test cases found.</p>';
  }

  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.storyFolder)}</td>
      <td>${escapeHtml(item.storyTitle)}</td>
      <td>${escapeHtml(String(item.source || 'manual').toUpperCase())}</td>
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
            <th>Source</th>
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
  const projectSelect = document.getElementById('project-select');
  const newProjectNameInput = document.getElementById('new-project-name');
  const createProjectBtn = document.getElementById('create-project-btn');
  const projectUrlSelect = document.getElementById('project-url-select');
  const projectUrlLabelInput = document.getElementById('project-url-label');
  const saveProjectUrlBtn = document.getElementById('save-project-url-btn');
  const storyInputGroup = document.getElementById('story-input-group');
  const closeStoryInputsBtn = document.getElementById('close-story-inputs-btn');
  const addStoryBtn = document.getElementById('add-story-btn');
  const fileInput = document.getElementById('user-story-file');
  const storyInput = document.getElementById('user-story-input');
  const saveDefaultUrlInput = document.getElementById('save-default-url');
  const runBtn = document.getElementById('run-tests-btn');
  const runRegressionBtn = document.getElementById('run-regression-btn');
  const showReportBtn = document.getElementById('show-report-btn');
  const testCasesBtn = document.getElementById('test-cases-btn');
  const showStoriesBtn = document.getElementById('show-stories-btn');
  const regressionSelectionPanel = document.getElementById('regression-selection-panel');
  const regressionSuiteNameInput = document.getElementById('regression-suite-name');
  const regressionSelectionMeta = document.getElementById('regression-selection-meta');
  const regressionSelectionView = document.getElementById('regression-selection-view');
  const runSelectedRegressionBtn = document.getElementById('run-selected-regression-btn');
  const cancelRegressionSelectionBtn = document.getElementById('cancel-regression-selection-btn');
  const regressionSelectionCloseBtn = document.getElementById('regression-selection-close-btn');
  const projectStoriesPanel = document.getElementById('project-stories-panel');
  const projectStoriesToggleBtn = document.getElementById('project-stories-toggle-btn');
  const projectStoriesContent = document.getElementById('project-stories-content');
  const projectStoriesMeta = document.getElementById('project-stories-meta');
  const projectStoriesView = document.getElementById('project-stories-view');
  const historyPanelToggleBtn = document.getElementById('history-panel-toggle-btn');
  const historyPanelContent = document.getElementById('history-panel-content');
  const manualCasesPanel = document.getElementById('manual-cases-panel');
  const manualCasesToggleBtn = document.getElementById('manual-cases-toggle-btn');
  const manualCasesContent = document.getElementById('manual-cases-content');
  const manualCasesMeta = document.getElementById('manual-cases-meta');
  const manualCasesView = document.getElementById('manual-cases-view');
  const manualCasesStoryFilter = document.getElementById('manual-cases-story-filter');
  const downloadWordBtn = document.getElementById('download-word-btn');
  const downloadExcelBtn = document.getElementById('download-excel-btn');
  const historyList = document.getElementById('history-list');
  const historyFilterInput = document.getElementById('history-filter-input');
  const historyFilterClearBtn = document.getElementById('history-filter-clear-btn');
  const historyMeta = document.getElementById('history-meta');
  let latestRunIdForReport = '';
  let allHistoryItems = [];
  let projectsState = { selectedProjectId: '', projects: [] };
  let manualCasesLoaded = false;
  let manualCasesAvailable = false;
  let latestManualCasesPayload = null;
  let selectedManualCasesFilter = MANUAL_CASES_REGRESSION_FILTER;
  let runLockedAfterSuccess = false;
  let storyInputsRevealed = false;
  let storySaved = false;
  let latestStoryFolderForCases = '';
  let latestProjectStoriesPayload = null;

  async function runRegressionWithSelection(selectedScripts, suiteName) {
    const appUrl = appUrlInput.value.trim();
    if (!appUrl) {
      runStatus.textContent = 'Please enter application URL.';
      return;
    }

    if (!Array.isArray(selectedScripts) || selectedScripts.length === 0) {
      runStatus.textContent = 'Please select at least one regression test case to run.';
      return;
    }

    const safeSuiteName = String(suiteName || '').trim();
    if (!safeSuiteName) {
      runStatus.textContent = 'Please enter Regression Suite Name.';
      regressionSuiteNameInput?.focus();
      return;
    }

    setRunButtonsBusy(true);
    showReportBtn.disabled = true;
    runStatus.textContent = `Running suite "${safeSuiteName}" with ${selectedScripts.length} selected test case(s). Please wait...`;

    try {
      const runResponse = await submitRegressionRun(appUrl, Boolean(saveDefaultUrlInput?.checked), selectedScripts, safeSuiteName);
      const runOutcome = String(runResponse?.run?.status || '').toUpperCase();
      const runId = String(runResponse?.run?.runId || '').trim();
      latestStoryFolderForCases = '';

      runStatus.textContent = runOutcome === 'PASS'
        ? `Regression suite "${safeSuiteName}" complete. Opening report...`
        : `Regression suite "${safeSuiteName}" completed with failures. Opening report...`;

      runLockedAfterSuccess = false;
      setRunButtonsBusy(false);
      showReportBtn.disabled = false;
      hideRegressionSelectionPanel();
      await refreshHistory();
      await refreshManualCasesAvailability();
      window.location.href = toReportUrl(runId);
    } catch (error) {
      runStatus.textContent = `Regression run failed: ${error.message}`;
      runLockedAfterSuccess = false;
      setRunButtonsBusy(false);
      await refreshHistory();
      await refreshManualCasesAvailability();
    } finally {
      applyApiHealth(await checkApiHealth());
    }
  }

  function hideRegressionSelectionPanel() {
    regressionSelectionPanel?.classList.add('hidden');
  }

  function getSelectedRegressionScripts() {
    const checkboxes = [...document.querySelectorAll('.regression-script-check')];
    return checkboxes
      .filter((input) => input instanceof HTMLInputElement && input.checked)
      .map((input) => String(input.value || '').trim())
      .filter(Boolean);
  }

  function renderRegressionSelection(payload) {
    const items = (Array.isArray(payload?.items) ? payload.items : [])
      .filter((item) => String(item?.source || '').toLowerCase() === 'automated')
      .map((item) => ({
        storyFolder: String(item?.storyFolder || '').trim(),
        caseId: String(item?.caseId || '').trim(),
        title: String(item?.title || '').trim(),
        scriptPath: String(item?.scriptPath || '').trim()
      }))
      .filter((item) => item.scriptPath);

    if (items.length === 0) {
      regressionSelectionMeta.textContent = 'No regression test cases available for this project.';
      regressionSelectionView.innerHTML = '<p>No generated automated test cases found.</p>';
      runSelectedRegressionBtn.disabled = true;
      return;
    }

    regressionSelectionMeta.textContent = `Select test cases to execute (${items.length} available).`;
    regressionSelectionView.innerHTML = `
      <div class="regression-selection-list">
        ${items.map((item, index) => `
          <label class="regression-selection-item">
            <input class="regression-script-check" type="checkbox" value="${escapeHtml(item.scriptPath)}" checked />
            <span>
              <strong>${escapeHtml(item.caseId || `case-${index + 1}`)}</strong> - ${escapeHtml(item.title || item.scriptPath)}
              <small>${escapeHtml(item.storyFolder)} | ${escapeHtml(item.scriptPath)}</small>
            </span>
          </label>
        `).join('')}
      </div>
    `;
    if (regressionSuiteNameInput && !String(regressionSuiteNameInput.value || '').trim()) {
      regressionSuiteNameInput.value = `Regression Suite ${new Date().toLocaleString()}`;
    }
    runSelectedRegressionBtn.disabled = false;
  }

  function updateAddStoryButtonLabel() {
    if (!addStoryBtn) {
      return;
    }

    addStoryBtn.textContent = storyInputsRevealed ? 'Save Story' : 'Add User Story';
  }

  function getStoryContentFromPayload(storyFolder) {
    const safeStoryFolder = String(storyFolder || '').trim();
    const items = Array.isArray(latestProjectStoriesPayload?.items) ? latestProjectStoriesPayload.items : [];
    const matched = items.find((item) => String(item?.storyFolder || '').trim() === safeStoryFolder);
    return String(matched?.content || '').trim();
  }

  function findLatestRunIdForStory(storyFolder) {
    const safeStoryFolder = String(storyFolder || '').trim();
    if (!safeStoryFolder) {
      return '';
    }

    const matchedRun = allHistoryItems.find((entry) => String(entry?.storyFolder || '').trim() === safeStoryFolder);
    return String(matchedRun?.runId || '').trim();
  }

  function showStoryInputs() {
    storyInputsRevealed = true;
    storyInputGroup?.classList.remove('hidden');
    updateAddStoryButtonLabel();
  }

  function hideStoryInputs() {
    storyInputsRevealed = false;
    storyInputGroup?.classList.add('hidden');
    updateAddStoryButtonLabel();
  }

  function toggleSectionContent(sectionContentElement) {
    if (!sectionContentElement) {
      return;
    }

    sectionContentElement.classList.toggle('hidden');
  }

  function resetManualCasesCache() {
    manualCasesLoaded = false;
    latestManualCasesPayload = null;
  }

  function applyManualCasesFilter(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const storyOptions = buildManualCaseStoryOptions(items);
    const storyHasCases = latestStoryFolderForCases
      ? storyOptions.some(([storyFolder]) => storyFolder === latestStoryFolderForCases)
      : false;

    if (storyHasCases) {
      selectedManualCasesFilter = latestStoryFolderForCases;
    }

    if (manualCasesStoryFilter) {
      const optionsHtml = [
        `<option value="${MANUAL_CASES_REGRESSION_FILTER}">Regression (All Stories)</option>`,
        ...storyOptions.map(([storyFolder, storyTitle]) => (
          `<option value="${escapeHtml(storyFolder)}">${escapeHtml(storyTitle)} (${escapeHtml(storyFolder)})</option>`
        ))
      ].join('');

      manualCasesStoryFilter.innerHTML = optionsHtml;

      const validFilterValues = new Set([MANUAL_CASES_REGRESSION_FILTER, ...storyOptions.map(([storyFolder]) => storyFolder)]);
      if (!validFilterValues.has(selectedManualCasesFilter)) {
        selectedManualCasesFilter = MANUAL_CASES_REGRESSION_FILTER;
      }

      manualCasesStoryFilter.value = selectedManualCasesFilter;
      manualCasesStoryFilter.disabled = storyOptions.length === 0;
    }

    const filteredItems = filterManualCasesItems(items, selectedManualCasesFilter);
    const isRegressionView = selectedManualCasesFilter === MANUAL_CASES_REGRESSION_FILTER;
    const viewLabel = isRegressionView ? 'Regression view (all stories)' : `Story view (${selectedManualCasesFilter})`;
    manualCasesMeta.textContent = `${viewLabel} | Stories: ${payload.storyCount || 0} | Test cases: ${filteredItems.length || 0} | Generated: ${new Date(payload.generatedAt).toLocaleString()}`;
    manualCasesView.innerHTML = renderManualCasesTable(filteredItems);
  }

  function getSelectedProject() {
    const selectedId = String(projectsState?.selectedProjectId || '').trim();
    const projects = Array.isArray(projectsState?.projects) ? projectsState.projects : [];
    return projects.find((project) => String(project?.id || '') === selectedId) || null;
  }

  async function renderProjectStories() {
    const selectedProject = getSelectedProject();

    if (!selectedProject) {
      projectStoriesMeta.textContent = 'Loading stories...';
      projectStoriesView.innerHTML = '<p>Loading...</p>';
      try {
        const payload = await loadProjectStories('');
        latestProjectStoriesPayload = payload;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (items.length === 0) {
          projectStoriesMeta.textContent = 'No stories found yet.';
          projectStoriesView.innerHTML = '<p>No stories found.</p>';
          return;
        }

        projectStoriesMeta.textContent = `All stories: ${items.length} stor${items.length === 1 ? 'y' : 'ies'} found.`;
        projectStoriesView.innerHTML = items.map((item) => {
          const text = String(item?.content || '').trim() || 'Story content is not available for this story.';
          const source = String(item?.source || '').trim();
          const storyFolder = String(item?.storyFolder || '').trim();
          const latestStoryRunId = findLatestRunIdForStory(storyFolder);
          return `
            <article class="story-content-card">
              <p class="eyebrow">${escapeHtml(storyFolder || 'story')}</p>
              <p class="story-id-line">Story ID: ${escapeHtml(storyFolder || 'N/A')}</p>
              ${source ? `<p class="story-source">Source: ${escapeHtml(source)}</p>` : ''}
              <pre class="story-content-text">${escapeHtml(text)}</pre>
              <div class="actions story-actions">
                <button type="button" class="secondary-btn story-run-tests-btn" data-story-folder="${escapeHtml(storyFolder)}">Run Story Testing</button>
                <button type="button" class="secondary-btn story-test-cases-btn" data-story-folder="${escapeHtml(storyFolder)}">Test Cases</button>
                <button type="button" class="secondary-btn story-show-report-btn" data-run-id="${escapeHtml(latestStoryRunId)}" ${latestStoryRunId ? '' : 'disabled'}>Show Report</button>
              </div>
            </article>
          `;
        }).join('');
      } catch (error) {
        projectStoriesMeta.textContent = 'Unable to load stories.';
        projectStoriesView.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
      }
      return;
    }

    projectStoriesMeta.textContent = `Loading stories for ${selectedProject.name}...`;
    projectStoriesView.innerHTML = '<p>Loading...</p>';

    try {
      const payload = await loadProjectStories(selectedProject.id);
      latestProjectStoriesPayload = payload;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length === 0) {
        projectStoriesMeta.textContent = `${selectedProject.name}: 0 stories added yet.`;
        projectStoriesView.innerHTML = '<p>No stories found for this project.</p>';
        return;
      }

      projectStoriesMeta.textContent = `${selectedProject.name}: ${items.length} stor${items.length === 1 ? 'y' : 'ies'} added.`;
      projectStoriesView.innerHTML = items.map((item) => {
        const text = String(item?.content || '').trim() || 'Story content is not available for this story.';
        const source = String(item?.source || '').trim();
        const storyFolder = String(item?.storyFolder || '').trim();
        const latestStoryRunId = findLatestRunIdForStory(storyFolder);
        return `
          <article class="story-content-card">
            <p class="eyebrow">${escapeHtml(storyFolder || 'story')}</p>
            <p class="story-id-line">Story ID: ${escapeHtml(storyFolder || 'N/A')}</p>
            ${source ? `<p class="story-source">Source: ${escapeHtml(source)}</p>` : ''}
            <pre class="story-content-text">${escapeHtml(text)}</pre>
            <div class="actions story-actions">
              <button type="button" class="secondary-btn story-run-tests-btn" data-story-folder="${escapeHtml(storyFolder)}">Run Story Testing</button>
              <button type="button" class="secondary-btn story-test-cases-btn" data-story-folder="${escapeHtml(storyFolder)}" ${latestStoryRunId ? '' : 'disabled'}>Test Cases</button>
              <button type="button" class="secondary-btn story-show-report-btn" data-run-id="${escapeHtml(latestStoryRunId)}" ${latestStoryRunId ? '' : 'disabled'}>Show Report</button>
            </div>
          </article>
        `;
      }).join('');
    } catch (error) {
      projectStoriesMeta.textContent = 'Unable to load stories.';
      projectStoriesView.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }

  function renderProjectControls() {
    const projects = Array.isArray(projectsState?.projects) ? projectsState.projects : [];
    const selectedProjectId = String(projectsState?.selectedProjectId || '').trim();

    if (projectSelect) {
      const options = ['<option value="">No project selected</option>', ...projects.map((project) => (
        `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`
      ))];
      projectSelect.innerHTML = options.join('');
      projectSelect.value = selectedProjectId;
    }

    const selectedProject = getSelectedProject();
    const urls = Array.isArray(selectedProject?.urls) ? selectedProject.urls : [];
    if (projectUrlSelect) {
      const urlOptions = ['<option value="">No saved URLs</option>', ...urls.map((entry) => {
        const suffix = entry.isDefault ? ' (default)' : '';
        return `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label || entry.url)}${escapeHtml(suffix)}</option>`;
      })];
      projectUrlSelect.innerHTML = urlOptions.join('');
      projectUrlSelect.disabled = !selectedProject || urls.length === 0;
    }

    if (saveProjectUrlBtn) {
      saveProjectUrlBtn.disabled = !selectedProject;
    }

    if (showStoriesBtn) {
      showStoriesBtn.disabled = false;
    }

    if (projectStoriesPanel && !projectStoriesPanel.classList.contains('hidden')) {
      void renderProjectStories();
    }
  }

  async function refreshProjectsState() {
    projectsState = await loadProjects();
    const selectedProjectId = String(projectsState?.selectedProjectId || '').trim();
    if (selectedProjectId) {
      try {
        await mapProjectStories(selectedProjectId);
        projectsState = await loadProjects();
      } catch {
        // Keep UI usable even if auto-mapping fails; fallback story loading still works.
      }
    }
    renderProjectControls();
  }

  function apiUnavailableMessage() {
    if (API_BASE_URL) {
      return `Backend API unavailable at ${API_BASE_URL}. Check deployed backend health/CORS.`;
    }

    const host = String(window.location.hostname || '').toLowerCase();
    if (host.includes('github.io')) {
      return 'Backend API unavailable on GitHub Pages. Set window.__API_BASE_URL to your deployed HTTPS backend URL.';
    }

    return 'Backend API unavailable. Start server with npm start and open http://localhost:4173.';
  }

  runBtn.disabled = true;
  runRegressionBtn.disabled = true;

  function setRunButtonsBusy(isBusy) {
    runBtn.disabled = isBusy;
    runRegressionBtn.disabled = isBusy;
  }

  function applyApiHealth(isHealthy) {
    if (!isHealthy) {
      setRunButtonsBusy(true);
      if (!runLockedAfterSuccess) {
        runStatus.textContent = apiUnavailableMessage();
      }
      return;
    }

    if (!runLockedAfterSuccess) {
      setRunButtonsBusy(false);
      if (runStatus.textContent.includes('Backend API unavailable')) {
        runStatus.textContent = 'Set URL and user story, then click Run Story Tests.';
      }
    }
  }

  function renderVisibleHistory(items) {
    const filterText = String(historyFilterInput?.value || '');
    const visible = getVisibleHistoryItems(items, filterText);
    historyList.innerHTML = renderHistory(visible.items);

    if (historyMeta) {
      if (!visible.filtered) {
        if (visible.total > 5) {
          historyMeta.textContent = `Showing latest 5 of ${visible.total} runs. Use filter to view older runs.`;
        } else {
          historyMeta.textContent = `Showing ${visible.total} run(s).`;
        }
      } else if (visible.items.length === 0) {
        historyMeta.textContent = `No runs matched "${filterText.trim()}".`;
      } else {
        historyMeta.textContent = `Filter active: showing ${visible.items.length} match(es) from ${visible.total} total runs.`;
      }
    }

    const reportButtons = [...historyList.querySelectorAll('.open-report-run-btn')];
    reportButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const runId = button.getAttribute('data-run-id') || '';
        window.location.href = toReportUrl(runId);
      });
    });

    const rerunButtons = [...historyList.querySelectorAll('.rerun-suite-btn')];
    rerunButtons.forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const runId = button.getAttribute('data-run-id') || '';
        const matchedRun = allHistoryItems.find((entry) => String(entry?.runId || '') === String(runId));
        const selectedScripts = Array.isArray(matchedRun?.selectedScripts) ? matchedRun.selectedScripts : [];
        const suiteName = String(matchedRun?.suiteName || '').trim() || 'Regression Suite';
        await runRegressionWithSelection(selectedScripts, suiteName);
      });
    });
  }

  async function refreshHistory() {
    allHistoryItems = await loadHistory(String(projectsState?.selectedProjectId || ''));
    latestRunIdForReport = String(allHistoryItems?.[0]?.runId || '').trim();
    renderVisibleHistory(allHistoryItems);
    if (projectStoriesPanel && !projectStoriesPanel.classList.contains('hidden')) {
      await renderProjectStories();
    }
  }

  async function runStoryFromContent(storyContent, storyFolderLabel = '') {
    const appUrl = appUrlInput.value.trim();
    const userStory = String(storyContent || '').trim();

    if (!appUrl) {
      runStatus.textContent = 'Please enter application URL.';
      return;
    }

    if (!userStory) {
      runStatus.textContent = 'Story content is unavailable for this story.';
      return;
    }

    setRunButtonsBusy(true);
    showReportBtn.disabled = true;
    latestStoryFolderForCases = '';
    runStatus.textContent = storyFolderLabel
      ? `Running story tests for ${storyFolderLabel}. Please wait...`
      : 'Running story tests. Please wait...';

    try {
      const runResponse = await submitRun(appUrl, userStory, Boolean(saveDefaultUrlInput?.checked));
      const runOutcome = String(runResponse?.run?.status || '').toUpperCase();
      latestStoryFolderForCases = String(runResponse?.run?.storyFolder || '').trim();

      if (runOutcome === 'FAIL' || runOutcome === 'ERROR') {
        runStatus.textContent = 'Story run completed with failed tests. Open report/history for details.';
        runLockedAfterSuccess = false;
        setRunButtonsBusy(false);
      } else {
        runStatus.textContent = 'Story run complete. You can open report now.';
        runLockedAfterSuccess = true;
        setRunButtonsBusy(true);
      }

      showReportBtn.disabled = false;
      await refreshHistory();
      manualCasesLoaded = false;
      latestManualCasesPayload = null;
      await refreshManualCasesAvailability();
      if (!manualCasesPanel.classList.contains('hidden')) {
        await showManualCasesPanel();
      }
    } catch (error) {
      runStatus.textContent = `Story run failed: ${error.message}`;
      runLockedAfterSuccess = false;
      setRunButtonsBusy(false);
      await refreshHistory();
      manualCasesLoaded = false;
      latestManualCasesPayload = null;
      await refreshManualCasesAvailability();
    } finally {
      applyApiHealth(await checkApiHealth());
    }
  }

  historyFilterInput?.addEventListener('input', () => {
    renderVisibleHistory(allHistoryItems);
  });

  historyFilterClearBtn?.addEventListener('click', () => {
    if (historyFilterInput) {
      historyFilterInput.value = '';
      historyFilterInput.focus();
    }
    renderVisibleHistory(allHistoryItems);
  });

  applyApiHealth(await checkApiHealth());

  async function refreshManualCasesAvailability() {
    try {
      const payload = await loadManualTestCases(String(projectsState?.selectedProjectId || ''));
      latestManualCasesPayload = payload;
      manualCasesAvailable = Number(payload?.totalCases || 0) > 0;
      testCasesBtn.disabled = !manualCasesAvailable;
      downloadWordBtn.disabled = !manualCasesAvailable;
      downloadExcelBtn.disabled = !manualCasesAvailable;
      if (manualCasesStoryFilter) {
        manualCasesStoryFilter.disabled = !manualCasesAvailable;
      }

      if (!manualCasesAvailable) {
        manualCasesLoaded = false;
        manualCasesPanel.classList.add('hidden');
        selectedManualCasesFilter = MANUAL_CASES_REGRESSION_FILTER;
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
      selectedManualCasesFilter = MANUAL_CASES_REGRESSION_FILTER;
      manualCasesMeta.textContent = 'Manual test cases are unavailable.';
      manualCasesView.innerHTML = '<p>No manual test cases found.</p>';
      if (manualCasesStoryFilter) {
        manualCasesStoryFilter.disabled = true;
      }
    }
  }

  await refreshProjectsState();
  await refreshHistory();
  resetManualCasesCache();
  await refreshManualCasesAvailability();

  const savedDefaultUrl = await loadDefaultUrl();
  if (savedDefaultUrl?.projectId) {
    projectsState.selectedProjectId = savedDefaultUrl.projectId;
    renderProjectControls();
    await refreshHistory();
    resetManualCasesCache();
    await refreshManualCasesAvailability();
  }
  if (savedDefaultUrl?.appUrl && !appUrlInput.value.trim()) {
    appUrlInput.value = savedDefaultUrl.appUrl;
  }

  projectSelect?.addEventListener('change', async () => {
    const projectId = String(projectSelect.value || '').trim();
    if (!projectId) {
      projectsState.selectedProjectId = '';
      latestStoryFolderForCases = '';
      renderProjectControls();
      await refreshHistory();
      resetManualCasesCache();
      await refreshManualCasesAvailability();
      if (!manualCasesPanel.classList.contains('hidden')) {
        await showManualCasesPanel();
      }
      return;
    }

    try {
      await selectProject(projectId);
      latestStoryFolderForCases = '';
      await refreshProjectsState();
      const defaultInfo = await loadDefaultUrl();
      if (defaultInfo?.appUrl) {
        appUrlInput.value = defaultInfo.appUrl;
      }
      await refreshHistory();
      resetManualCasesCache();
      await refreshManualCasesAvailability();
      if (!manualCasesPanel.classList.contains('hidden')) {
        await showManualCasesPanel();
      }
      runStatus.textContent = 'Project selected.';
    } catch (error) {
      runStatus.textContent = `Unable to select project: ${error.message}`;
    }
  });

  createProjectBtn?.addEventListener('click', async () => {
    const projectName = String(newProjectNameInput?.value || '').trim();
    if (!projectName) {
      runStatus.textContent = 'Enter a project name first.';
      return;
    }

    try {
      await createProject(projectName);
      if (newProjectNameInput) {
        newProjectNameInput.value = '';
      }
      await refreshProjectsState();
      latestStoryFolderForCases = '';
      await refreshHistory();
      resetManualCasesCache();
      await refreshManualCasesAvailability();
      if (!manualCasesPanel.classList.contains('hidden')) {
        await showManualCasesPanel();
      }
      runStatus.textContent = `Project created: ${projectName}`;
    } catch (error) {
      runStatus.textContent = `Unable to create project: ${error.message}`;
    }
  });

  projectUrlSelect?.addEventListener('change', () => {
    const selectedProject = getSelectedProject();
    const urlId = String(projectUrlSelect.value || '').trim();
    if (!selectedProject || !urlId) {
      return;
    }

    const urls = Array.isArray(selectedProject.urls) ? selectedProject.urls : [];
    const selectedUrl = urls.find((entry) => String(entry?.id || '') === urlId);
    if (selectedUrl?.url) {
      appUrlInput.value = String(selectedUrl.url).trim();
      runStatus.textContent = 'Project URL loaded into Application URL field.';
    }
  });

  saveProjectUrlBtn?.addEventListener('click', async () => {
    const selectedProject = getSelectedProject();
    const appUrl = String(appUrlInput.value || '').trim();
    const label = String(projectUrlLabelInput?.value || '').trim() || 'Saved URL';

    if (!selectedProject) {
      runStatus.textContent = 'Select a project first to save project URLs.';
      return;
    }

    if (!appUrl) {
      runStatus.textContent = 'Enter an Application URL before saving it to project.';
      return;
    }

    try {
      await saveProjectUrl(selectedProject.id, label, appUrl, false);
      if (projectUrlLabelInput) {
        projectUrlLabelInput.value = '';
      }
      await refreshProjectsState();
      runStatus.textContent = 'Project URL saved.';
    } catch (error) {
      runStatus.textContent = `Unable to save project URL: ${error.message}`;
    }
  });

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
    storySaved = false;
  });

  storyInput.addEventListener('input', () => {
    storySaved = false;
  });

  closeStoryInputsBtn?.addEventListener('click', () => {
    hideStoryInputs();
    runStatus.textContent = 'Story inputs hidden. Click Add Story to show them again.';
  });

  addStoryBtn?.addEventListener('click', async () => {
    if (!storyInputsRevealed) {
      showStoryInputs();
      runStatus.textContent = 'Story inputs shown. Upload or paste user story text.';
      storyInput?.focus();
      return;
    }

    const userStory = storyInput.value.trim();
    if (!userStory) {
      runStatus.textContent = 'Please upload a .txt file or enter user story text before saving.';
      storyInput?.focus();
      return;
    }

    const selectedProject = getSelectedProject();
    if (!selectedProject) {
      runStatus.textContent = 'Please select a project first, then save your story.';
      return;
    }

    addStoryBtn.disabled = true;
    runStatus.textContent = `Saving story to ${selectedProject.name}...`;
    try {
      const saved = await saveProjectStory(selectedProject.id, userStory, 'UI input');
      storySaved = true;
      hideStoryInputs();
      runStatus.textContent = `Story saved to ${selectedProject.name} (${saved.storyFolder}). Click Run Story Tests to execute.`;
      await refreshProjectsState();
      if (projectStoriesPanel && !projectStoriesPanel.classList.contains('hidden')) {
        await renderProjectStories();
      }
    } catch (error) {
      storySaved = false;
      runStatus.textContent = `Unable to save project story: ${error.message}`;
    } finally {
      addStoryBtn.disabled = false;
    }
  });

  runBtn.addEventListener('click', async () => {
    const appUrl = appUrlInput.value.trim();
    const userStory = storyInput.value.trim();

    if (!appUrl) {
      runStatus.textContent = 'Please enter application URL.';
      return;
    }

    if (!userStory) {
      runStatus.textContent = storyInputsRevealed
        ? 'Please upload a .txt file or enter user story text.'
        : 'Please click Add Story and enter user story text.';
      return;
    }

    if (!storySaved) {
      runStatus.textContent = 'Please click Save Story first, then run tests.';
      if (!storyInputsRevealed) {
        showStoryInputs();
      }
      storyInput?.focus();
      return;
    }

    await runStoryFromContent(userStory);
  });

  showReportBtn.addEventListener('click', () => {
    window.location.href = toReportUrl(latestRunIdForReport);
  });

  showStoriesBtn?.addEventListener('click', async () => {
    if (!projectStoriesPanel) {
      return;
    }

    projectStoriesPanel.classList.remove('hidden');
    projectStoriesContent?.classList.remove('hidden');
    await renderProjectStories();
    projectStoriesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  projectStoriesToggleBtn?.addEventListener('click', () => {
    if (!projectStoriesContent || !projectStoriesPanel) {
      return;
    }

    // Keep the Stories section visible; only collapse/expand its content area.
    projectStoriesPanel.classList.remove('hidden');
    toggleSectionContent(projectStoriesContent);
  });

  historyPanelToggleBtn?.addEventListener('click', () => {
    toggleSectionContent(historyPanelContent);
  });

  manualCasesToggleBtn?.addEventListener('click', () => {
    toggleSectionContent(manualCasesContent);
  });

  cancelRegressionSelectionBtn?.addEventListener('click', () => {
    hideRegressionSelectionPanel();
  });

  regressionSelectionCloseBtn?.addEventListener('click', () => {
    hideRegressionSelectionPanel();
  });

  runSelectedRegressionBtn?.addEventListener('click', async () => {
    const selectedScripts = getSelectedRegressionScripts();
    const suiteName = String(regressionSuiteNameInput?.value || '').trim();
    await runRegressionWithSelection(selectedScripts, suiteName);
  });

  projectStoriesView?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.classList.contains('story-run-tests-btn')) {
      const storyFolder = String(target.getAttribute('data-story-folder') || '').trim();
      const storyContent = getStoryContentFromPayload(storyFolder);
      await runStoryFromContent(storyContent, storyFolder);
      return;
    }

    if (target.classList.contains('story-test-cases-btn')) {
      const storyFolder = String(target.getAttribute('data-story-folder') || '').trim();
      await refreshManualCasesAvailability();
      selectedManualCasesFilter = storyFolder || MANUAL_CASES_REGRESSION_FILTER;
      manualCasesLoaded = false;
      await showManualCasesPanel();
      manualCasesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (target.classList.contains('story-show-report-btn')) {
      const runId = String(target.getAttribute('data-run-id') || '').trim();
      if (!runId) {
        runStatus.textContent = 'No run found yet for this story. Run tests first.';
        return;
      }

      window.location.href = toReportUrl(runId);
    }
  });

  runRegressionBtn.addEventListener('click', async () => {
    const appUrl = appUrlInput.value.trim();
    if (!appUrl) {
      runStatus.textContent = 'Please enter application URL.';
      return;
    }

    try {
      const payload = latestManualCasesPayload || await loadManualTestCases(String(projectsState?.selectedProjectId || ''));
      latestManualCasesPayload = payload;
      const automatedCount = (Array.isArray(payload?.items) ? payload.items : [])
        .filter((item) => String(item?.source || '').toLowerCase() === 'automated').length;
      if (automatedCount === 0) {
        runStatus.textContent = 'Warning: No generated tests found for this project yet. Add a story and run story tests first.';
        return;
      }

      regressionSelectionPanel?.classList.remove('hidden');
      if (regressionSuiteNameInput) {
        regressionSuiteNameInput.value = '';
      }
      renderRegressionSelection(payload);
      regressionSelectionPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      runStatus.textContent = 'Select regression test cases, then click Run Selected Tests.';
    } catch {
      runStatus.textContent = 'Warning: Unable to verify regression tests for this project right now.';
      return;
    }
  });

  async function showManualCasesPanel() {
    if (!manualCasesAvailable) {
      runStatus.textContent = 'Manual test cases are not generated yet. Run tests first.';
      manualCasesPanel.classList.add('hidden');
      return;
    }

    manualCasesPanel.classList.remove('hidden');
    manualCasesContent?.classList.remove('hidden');
    if (manualCasesLoaded) {
      return;
    }

    manualCasesMeta.textContent = 'Loading manual test cases...';
    manualCasesView.innerHTML = '<p>Loading...</p>';

    try {
      const payload = latestManualCasesPayload || await loadManualTestCases(String(projectsState?.selectedProjectId || ''));
      manualCasesLoaded = true;
      latestManualCasesPayload = payload;
      applyManualCasesFilter(payload);
    } catch (error) {
      manualCasesMeta.textContent = 'Manual test cases are unavailable.';
      manualCasesView.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }

  manualCasesStoryFilter?.addEventListener('change', () => {
    selectedManualCasesFilter = String(manualCasesStoryFilter.value || MANUAL_CASES_REGRESSION_FILTER);
    if (latestManualCasesPayload) {
      applyManualCasesFilter(latestManualCasesPayload);
    }
  });

  testCasesBtn.addEventListener('click', async () => {
    await showManualCasesPanel();
    manualCasesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  downloadWordBtn.addEventListener('click', () => {
    const projectId = String(projectsState?.selectedProjectId || '').trim();
    const query = projectId
      ? `/api/manual-test-cases/download?format=word&projectId=${encodeURIComponent(projectId)}`
      : '/api/manual-test-cases/download?format=word';
    window.open(apiUrl(query), '_blank', 'noopener');
  });

  downloadExcelBtn.addEventListener('click', () => {
    const projectId = String(projectsState?.selectedProjectId || '').trim();
    const query = projectId
      ? `/api/manual-test-cases/download?format=excel&projectId=${encodeURIComponent(projectId)}`
      : '/api/manual-test-cases/download?format=excel';
    window.open(apiUrl(query), '_blank', 'noopener');
  });
}

async function initReportPage() {
  const backMainBtn = document.getElementById('back-main-btn');
  const playwrightReportBtn = document.getElementById('open-playwright-report-btn');
  const generatedAtNode = document.getElementById('generated-at');
  const runTypeBadge = document.getElementById('run-type-badge');
  const suiteSelectionMetaNode = document.getElementById('suite-selection-meta');
  const query = new URLSearchParams(window.location.search);
  const selectedRunId = query.get('runId');
  let selectedRun = null;
  let generatedAtText = '';

  if (runTypeBadge) {
    runTypeBadge.classList.add('hidden');
  }
  if (suiteSelectionMetaNode) {
    suiteSelectionMetaNode.textContent = '';
    suiteSelectionMetaNode.classList.add('hidden');
  }

  if (selectedRunId) {
    const items = await loadHistory();
    selectedRun = items.find((item) => item.runId === selectedRunId) || null;
    if (selectedRun && generatedAtNode) {
      const totals = selectedRun.totals || { executed: 0, passed: 0, failed: 0 };
      const runType = String(selectedRun.runType || 'FULL').toUpperCase();
      const suiteName = String(selectedRun.suiteName || '').trim();
      if (runTypeBadge) {
        if (runType === 'REGRESSION') {
          runTypeBadge.textContent = 'Regression Report';
          runTypeBadge.classList.remove('hidden');
        } else if (runType === 'FULL') {
          runTypeBadge.textContent = 'Story Testing Report';
          runTypeBadge.classList.remove('hidden');
        } else {
          runTypeBadge.textContent = `${runType} Report`;
          runTypeBadge.classList.remove('hidden');
        }
      }
      if (runType === 'REGRESSION' && suiteSelectionMetaNode) {
        const selectedScripts = Array.isArray(selectedRun.selectedScripts) ? selectedRun.selectedScripts : [];
        if (selectedScripts.length > 0) {
          const selectedCaseNames = selectedScripts
            .map((scriptPath) => String(scriptPath || '').split('/').pop())
            .filter(Boolean);
          const previewNames = selectedCaseNames.slice(0, 5).join(', ');
          const remainingCount = selectedCaseNames.length - Math.min(selectedCaseNames.length, 5);
          const remainingText = remainingCount > 0 ? ` (+${remainingCount} more)` : '';
          suiteSelectionMetaNode.textContent = `Selected Suite Test Cases (${selectedCaseNames.length}): ${previewNames}${remainingText}`;
          suiteSelectionMetaNode.classList.remove('hidden');
        }
      }
      const label = runType === 'REGRESSION' ? 'Selected REGRESSION run' : 'Selected run';
      const suiteSegment = suiteName ? ` | Suite: ${suiteName}` : '';
      generatedAtText = `${label}: ${new Date(selectedRun.finishedAt || selectedRun.startedAt).toLocaleString()}${suiteSegment} | Executed ${totals.executed || 0}, Passed ${totals.passed || 0}, Failed ${totals.failed || 0}`;
    }
  }

  const report = await loadReport(selectedRunId || '');
  const isRunScopedReport = Boolean(selectedRunId);
  const reportToRender = isRunScopedReport ? report : filterReportForRun(report, selectedRun);
  const historyItems = await loadHistory();
  wireReport(reportToRender, { generatedAtText, historyItems });

  if (backMainBtn) {
    backMainBtn.addEventListener('click', () => {
      window.location.href = './index.html';
    });
  }

  if (playwrightReportBtn) {
    playwrightReportBtn.addEventListener('click', () => {
      window.open(apiUrl('/playwright-report/index.html'), '_blank', 'noopener');
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
