import fs from 'fs/promises';
import path from 'path';

async function readHistory(historyPath) {
  try {
    const raw = await fs.readFile(historyPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildRunTotals(caseResults) {
  const executionPassed = caseResults.filter((item) => item.executionStatus === 'PASS').length;
  const executionFailed = caseResults.filter((item) => item.executionStatus === 'FAIL').length;
  const validationPassed = caseResults.filter((item) => item.validationStatus === 'PASS').length;
  const validationFailed = caseResults.filter((item) => item.validationStatus === 'FAIL').length;

  return {
    total: caseResults.length,
    executionPassed,
    executionFailed,
    validationPassed,
    validationFailed
  };
}

function renderDashboard(report) {
  const lines = [];
  lines.push(`# Multi-Agent Dashboard - ${report.storySource}`);
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push(`Overall status: ${report.overallStatus}`);
  lines.push('');
  lines.push('| Case ID | Attempt | Execution | UI Validation | Priority | Script |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const item of report.caseResults) {
    lines.push(`| ${item.caseId} | ${item.attempt} | ${item.executionStatus} | ${item.validationStatus} | ${item.improvementPriority} | ${item.scriptPath} |`);
  }

  lines.push('');
  lines.push('## Summary');
  lines.push(report.summary);
  lines.push('');
  lines.push('## Improvement Suggestions');

  for (const item of report.caseResults) {
    lines.push('');
    lines.push(`### ${item.caseId}`);
    if (item.improvements.length === 0) {
      lines.push('- No suggestions generated.');
      continue;
    }

    for (const suggestion of item.improvements) {
      lines.push(`- ${suggestion}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function buildSummary(report) {
  const total = report.caseResults.length;
  const passed = report.caseResults.filter((item) => item.executionStatus === 'PASS').length;
  const uiPassed = report.caseResults.filter((item) => item.validationStatus === 'PASS').length;

  return [
    `Total automated cases: ${total}`,
    `Execution passed: ${passed}`,
    `Execution failed: ${total - passed}`
  ].join(' | ');
}

export async function reporterAgentWriteReport({ storySource, storyOutputDir, caseResults }) {
  const generatedAt = new Date().toISOString();
  const overallStatus = caseResults.every((item) => item.executionStatus === 'PASS' && item.validationStatus === 'PASS')
    ? 'PASS'
    : 'PARTIAL_FAIL';

  const report = {
    storySource,
    generatedAt,
    overallStatus,
    caseResults,
    summary: ''
  };

  report.summary = buildSummary(report);

  const summaryPath = path.join(storyOutputDir, 'multi-agent-summary.json');
  const dashboardPath = path.join(storyOutputDir, 'multi-agent-dashboard.md');
  const historyPath = path.join(storyOutputDir, 'multi-agent-history.json');

  await fs.writeFile(summaryPath, JSON.stringify(report, null, 2));
  await fs.writeFile(dashboardPath, renderDashboard(report));

  const runTotals = buildRunTotals(caseResults);
  const runRecord = {
    generatedAt,
    overallStatus,
    summary: report.summary,
    totals: runTotals,
    caseResults
  };
  const history = await readHistory(historyPath);
  history.push(runRecord);
  const recentHistory = history.slice(-30);
  await fs.writeFile(historyPath, JSON.stringify(recentHistory, null, 2));

  return { summaryPath, dashboardPath, historyPath, report };
}
