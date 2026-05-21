import fs from 'fs/promises';
import path from 'path';

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath, fallbackValue) {
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

async function listDirectories(dirPath) {
  if (!(await pathExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function listFiles(dirPath, extensionFilter = null) {
  if (!(await pathExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !extensionFilter || name.endsWith(extensionFilter))
    .sort();
}

function toCaseMap(manualCatalog) {
  const map = new Map();
  const testCases = Array.isArray(manualCatalog?.testCases) ? manualCatalog.testCases : [];
  for (const testCase of testCases) {
    map.set(String(testCase.id || ''), testCase);
  }
  return map;
}

function latestCaseResults(caseResults) {
  const grouped = new Map();
  for (const result of Array.isArray(caseResults) ? caseResults : []) {
    const caseId = String(result.caseId || 'unknown');
    const current = grouped.get(caseId);
    if (!current || Number(result.attempt || 0) >= Number(current.attempt || 0)) {
      grouped.set(caseId, result);
    }
  }
  return grouped;
}

function sortByGeneratedAtDesc(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.generatedAt || 0).getTime();
    const bTime = new Date(b.generatedAt || 0).getTime();
    return bTime - aTime;
  });
}

function toRunTotals(run) {
  if (run?.totals && typeof run.totals === 'object') {
    return {
      total: Number(run.totals.total || 0),
      executionPassed: Number(run.totals.executionPassed || 0),
      executionFailed: Number(run.totals.executionFailed || 0),
      validationPassed: Number(run.totals.validationPassed || 0),
      validationFailed: Number(run.totals.validationFailed || 0)
    };
  }

  const caseResults = Array.isArray(run?.caseResults) ? run.caseResults : [];
  return {
    total: caseResults.length,
    executionPassed: caseResults.filter((item) => item.executionStatus === 'PASS').length,
    executionFailed: caseResults.filter((item) => item.executionStatus === 'FAIL').length,
    validationPassed: caseResults.filter((item) => item.validationStatus === 'PASS').length,
    validationFailed: caseResults.filter((item) => item.validationStatus === 'FAIL').length
  };
}

function normalizeStoryTitle(storySource, manualCatalog) {
  return String(manualCatalog?.storyTitle || storySource || 'User Story');
}

export async function buildReportData() {
  const rootDir = process.cwd();
  const generatedTestsDir = path.join(rootDir, 'generated_tests');
  const reportUiDir = path.join(rootDir, 'report-ui');
  const dataDir = path.join(reportUiDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const storyFolders = await listDirectories(generatedTestsDir);
  const stories = [];

  for (const storyFolder of storyFolders) {
    const storyDir = path.join(generatedTestsDir, storyFolder);
    const automationSelection = await readJsonIfExists(path.join(storyDir, 'automation-selection.json'), {});
    const manualCatalog = await readJsonIfExists(path.join(storyDir, 'manual-test-cases.json'), {});
    const multiAgentSummary = await readJsonIfExists(path.join(storyDir, 'multi-agent-summary.json'), null);
    const multiAgentHistoryRaw = await readJsonIfExists(path.join(storyDir, 'multi-agent-history.json'), []);
    const runHistory = sortByGeneratedAtDesc(Array.isArray(multiAgentHistoryRaw) ? multiAgentHistoryRaw : []);

    const caseMap = toCaseMap(manualCatalog);
    const latestRun = runHistory[0] || null;
    const latestResults = latestCaseResults(
      (multiAgentSummary && Array.isArray(multiAgentSummary.caseResults))
        ? multiAgentSummary.caseResults
        : (latestRun?.caseResults || [])
    );
    const testCaseDirs = await listDirectories(path.join(storyDir, 'test-cases'));
    const screenshotDirs = await listDirectories(path.join(storyDir, 'screenshots'));
    const caseIds = [...new Set([...caseMap.keys(), ...latestResults.keys(), ...testCaseDirs, ...screenshotDirs])].sort();

    const cases = [];
    for (const caseId of caseIds) {
      const manualCase = caseMap.get(caseId) || {};
      const latestResult = latestResults.get(caseId) || null;
      const scriptFiles = await listFiles(path.join(storyDir, 'test-cases', caseId), '.js');
      const screenshotFiles = await listFiles(path.join(storyDir, 'screenshots', caseId), '.png');
      const caseRunHistory = runHistory
        .map((run) => {
          const results = Array.isArray(run.caseResults) ? run.caseResults : [];
          const caseEntries = results.filter((entry) => String(entry.caseId || '') === caseId);
          if (caseEntries.length === 0) {
            return null;
          }

          const latestEntry = caseEntries.reduce((current, entry) => {
            if (!current) return entry;
            return Number(entry.attempt || 0) >= Number(current.attempt || 0) ? entry : current;
          }, null);

          return {
            generatedAt: String(run.generatedAt || ''),
            overallStatus: String(run.overallStatus || 'UNKNOWN'),
            executionStatus: String(latestEntry?.executionStatus || 'UNKNOWN'),
            validationStatus: String(latestEntry?.validationStatus || 'UNKNOWN'),
            attempt: Number(latestEntry?.attempt || 0),
            executionCode: latestEntry?.executionCode ?? null,
            failureCause: String(latestEntry?.failureCause || ''),
            debugCommand: String(latestEntry?.debugCommand || ''),
            outputTail: String(latestEntry?.outputTail || ''),
            summary: String(latestEntry?.validationSummary || run.summary || '')
          };
        })
        .filter(Boolean)
        .slice(0, 10);

      cases.push({
        caseId,
        title: String(manualCase.title || caseId),
        type: String(manualCase.type || 'automation'),
        priority: String(manualCase.priority || 'medium'),
        expectedResult: String(manualCase.expectedResult || ''),
        acceptanceCriteria: Array.isArray(manualCase.acceptanceCriteria) ? manualCase.acceptanceCriteria : [],
        automationReason: String(manualCase.automationReason || ''),
        executionStatus: latestResult ? String(latestResult.executionStatus || 'UNKNOWN') : 'NOT_RUN',
        validationStatus: latestResult ? String(latestResult.validationStatus || 'UNKNOWN') : 'NOT_RUN',
        lastAttempt: latestResult ? Number(latestResult.attempt || 0) : 0,
        executionCode: latestResult ? Number(latestResult.executionCode || 0) : null,
        failureCause: latestResult ? String(latestResult.failureCause || '') : '',
        debugCommand: latestResult ? String(latestResult.debugCommand || '') : '',
        outputTail: latestResult ? String(latestResult.outputTail || '') : '',
        validationSummary: latestResult ? String(latestResult.validationSummary || '') : '',
        improvementPriority: latestResult ? String(latestResult.improvementPriority || 'n/a') : 'n/a',
        improvements: latestResult && Array.isArray(latestResult.improvements) ? latestResult.improvements : [],
        executedAt: latestResult ? String(latestResult.executedAt || '') : '',
        runHistory: caseRunHistory,
        scriptFiles: scriptFiles.map((fileName) => `generated_tests/${storyFolder}/test-cases/${caseId}/${fileName}`),
        screenshotFiles: screenshotFiles.map((fileName) => `generated_tests/${storyFolder}/screenshots/${caseId}/${fileName}`)
      });
    }

    const executionPassed = cases.filter((item) => item.executionStatus === 'PASS').length;
    const executionFailed = cases.filter((item) => item.executionStatus === 'FAIL').length;
    const notRun = cases.filter((item) => item.executionStatus === 'NOT_RUN').length;

    stories.push({
      id: storyFolder,
      folderName: storyFolder,
      storySource: String(automationSelection.storySource || ''),
      title: normalizeStoryTitle(automationSelection.storySource, manualCatalog),
      overallStatus: String(multiAgentSummary?.overallStatus || (executionFailed > 0 ? 'PARTIAL_FAIL' : 'UNKNOWN')),
      generatedAt: String(multiAgentSummary?.generatedAt || ''),
      totals: {
        tests: Number(automationSelection.totalManualTests || 0),
        manual: Number(automationSelection.totalManualTests || 0),
        automated: Number(automationSelection.coverage?.totalAutomatable || 0),
        automatable: Number(automationSelection.coverage?.totalAutomatable || 0),
        covered: Number(automationSelection.coverage?.covered || 0),
        missing: Number(automationSelection.coverage?.missing || 0),
        automatedRunPassed: executionPassed,
        automatedRunFailed: executionFailed,
        executionPassed,
        executionFailed,
        notRun
      },
      coverage: {
        percent: Number(automationSelection.coverage?.coveragePercent || 0),
        coveredCases: Array.isArray(automationSelection.coverage?.coveredCases) ? automationSelection.coverage.coveredCases : [],
        missingScenarioTitles: Array.isArray(automationSelection.coverage?.missingScenarioTitles) ? automationSelection.coverage.missingScenarioTitles : []
      },
      summary: String(multiAgentSummary?.summary || ''),
      runHistory: runHistory.slice(0, 20).map((run) => ({
        generatedAt: String(run.generatedAt || ''),
        overallStatus: String(run.overallStatus || 'UNKNOWN'),
        summary: String(run.summary || ''),
        totals: toRunTotals(run)
      })),
      cases
    });
  }

  const reportData = {
    generatedAt: new Date().toISOString(),
    storyCount: stories.length,
    totals: {
      stories: stories.length,
      tests: stories.reduce((sum, story) => sum + story.totals.tests, 0),
      manual: stories.reduce((sum, story) => sum + story.totals.manual, 0),
      automated: stories.reduce((sum, story) => sum + story.totals.automated, 0),
      automatable: stories.reduce((sum, story) => sum + story.totals.automatable, 0),
      automatedRunPassed: stories.reduce((sum, story) => sum + story.totals.automatedRunPassed, 0),
      automatedRunFailed: stories.reduce((sum, story) => sum + story.totals.automatedRunFailed, 0),
      executionPassed: stories.reduce((sum, story) => sum + story.totals.executionPassed, 0),
      executionFailed: stories.reduce((sum, story) => sum + story.totals.executionFailed, 0),
      notRun: stories.reduce((sum, story) => sum + story.totals.notRun, 0)
    },
    coverage: {
      covered: stories.reduce((sum, story) => sum + story.totals.covered, 0),
      automatable: stories.reduce((sum, story) => sum + story.totals.automatable, 0),
      overallPercent: 0
    },
    stories
  };

  reportData.coverage.overallPercent = reportData.coverage.automatable === 0
    ? 0
    : Math.round((reportData.coverage.covered / reportData.coverage.automatable) * 100);

  const outputPath = path.join(dataDir, 'report-data.json');
  await fs.writeFile(outputPath, JSON.stringify(reportData, null, 2));
  return outputPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildReportData()
    .then((outputPath) => {
      console.log(`Report data written to ${outputPath}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
