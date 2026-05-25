import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { generateManualTestCatalog } from './generator/testCaseGenerator.js';
import { buildPlaywrightScript } from './generator/scriptBuilder.js';
import { runGeneratedTest } from './runner/runGeneratedTest.js';
import { plannerAgentCreatePlan } from './agents/plannerAgent.js';
import { executorAgentRun } from './agents/executorAgent.js';
import { validatorAgentValidate } from './agents/validatorAgent.js';
import { reporterAgentWriteReport } from './agents/reporterAgent.js';
import { improvementAgentSuggest } from './agents/improvementAgent.js';
import { analyzeCoverageAndGaps, buildContinuousImprovementFeedback } from './agents/testIntelligenceAgent.js';
import { isSyncAgentEnabled, syncAgentRun } from './agents/syncAgent.js';
import { buildReportData } from './ui/buildReportData.js';
import { config } from './config.js';

function askUserStory() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter plain English test scenario: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function ensureArtifacts() {
  await fs.mkdir(path.resolve(process.cwd(), 'artifacts'), { recursive: true });
  await fs.mkdir(path.resolve(process.cwd(), 'test-results'), { recursive: true });
}

function toSafeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'story';
}

function extractStoryNumber(sourceName, fallbackNumber) {
  const match = String(sourceName || '').match(/(\d+)/);
  return match ? Number(match[1]) : fallbackNumber;
}

function toShortDescription(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('_') || 'scenario';
}

function toSuiteTag(value, fallback = '') {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
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

function buildCaseId(projectCode, storyNumber, caseNumber) {
  return `${buildStoryName(projectCode, storyNumber)}_TestCase_${Number(caseNumber)}`;
}

function renderManualCatalogMarkdown(sourceName, catalog, selectedAutomatableCases) {
  const lines = [];
  lines.push(`# Manual Test Cases - ${sourceName}`);
  lines.push('');
  lines.push(`Story title: ${catalog.storyTitle}`);
  lines.push('');
  lines.push('## Story Acceptance Criteria');
  if (catalog.storyAcceptanceCriteria.length === 0) {
    lines.push('- Not explicitly provided in story.');
  } else {
    for (const ac of catalog.storyAcceptanceCriteria) {
      lines.push(`- ${ac}`);
    }
  }

  lines.push('');
  lines.push('## Manual Test Cases');

  for (const testCase of catalog.testCases) {
    lines.push('');
    lines.push(`### ${testCase.id} - ${testCase.title}`);
    lines.push(`- Type: ${testCase.type}`);
    lines.push(`- Priority: ${testCase.priority}`);
    lines.push(`- Automation candidate: ${testCase.automationCandidate ? 'Yes' : 'No'}`);
    lines.push(`- Automation reason: ${testCase.automationReason || 'Not provided'}`);

    lines.push('- Preconditions:');
    if (testCase.preconditions.length === 0) {
      lines.push('  - None');
    } else {
      for (const precondition of testCase.preconditions) {
        lines.push(`  - ${precondition}`);
      }
    }

    lines.push('- Steps:');
    if (testCase.steps.length === 0) {
      lines.push('  - Not provided');
    } else {
      for (let i = 0; i < testCase.steps.length; i += 1) {
        lines.push(`  ${i + 1}. ${testCase.steps[i]}`);
      }
    }

    lines.push(`- Expected result: ${testCase.expectedResult}`);

    lines.push('- Acceptance criteria covered:');
    if (testCase.acceptanceCriteria.length === 0) {
      lines.push('  - Not provided');
    } else {
      for (const ac of testCase.acceptanceCriteria) {
        lines.push(`  - ${ac}`);
      }
    }
  }

  lines.push('');
  lines.push('## Selected For Automation');
  if (selectedAutomatableCases.length === 0) {
    lines.push('- No automatable test cases were selected.');
  } else {
    for (const testCase of selectedAutomatableCases) {
      lines.push(`- ${testCase.id}: ${testCase.title}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function getExistingStoryTests(projectCode, storyNumber) {
  const generatedDir = path.resolve(process.cwd(), 'generated_tests');
  const storyNamePrefix = `${normalizeProjectCode(projectCode)}_story_${storyNumber}_`;
  const legacyPrefix = `user_story_${storyNumber}_`;

  async function collectSpecFileNames(dirPath) {
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const names = [];
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        names.push(...(await collectSpecFileNames(entryPath)));
      } else if (entry.isFile() && entry.name.endsWith('.spec.js')) {
        names.push(entry.name);
      }
    }

    return names;
  }

  const names = (await collectSpecFileNames(generatedDir))
    .filter((name) => name.startsWith(storyNamePrefix) || name.startsWith(legacyPrefix));

  const slugs = new Set(names.map((name) => {
    const prefix = name.startsWith(storyNamePrefix) ? storyNamePrefix : legacyPrefix;
    return name.slice(prefix.length, -'.spec.js'.length);
  }));
  const descriptions = [...slugs].map((slug) => slug.replace(/_/g, ' '));
  return { slugs, descriptions };
}

async function loadUserStoriesFromDirectory() {
  const storiesDir = path.resolve(process.cwd(), 'user-stories');
  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  const txtFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (txtFiles.length === 0) {
    throw new Error('No .txt user stories found in user-stories directory.');
  }

  const stories = [];
  for (const fileName of txtFiles) {
    const filePath = path.join(storiesDir, fileName);
    const story = (await fs.readFile(filePath, 'utf8')).trim();
    if (!story) {
      console.log(`Skipping empty user story file: ${fileName}`);
      continue;
    }

    stories.push({
      id: toSafeId(path.parse(fileName).name),
      source: fileName,
      userStory: story
    });
  }

  if (stories.length === 0) {
    throw new Error('All .txt files in user-stories are empty.');
  }

  console.log(`No input provided. Loaded ${stories.length} user story file(s) from user-stories.`);
  return stories;
}

async function main() {
  await ensureArtifacts();

  const inputStory = await askUserStory();
  const cliStoryId = toSafeId(process.env.CLI_STORY_ID || 'cli-input');
  const cliStorySource = String(process.env.CLI_STORY_SOURCE || 'CLI input').trim() || 'CLI input';
  const parsedCliStoryNumber = Number.parseInt(String(process.env.CLI_STORY_NUMBER || ''), 10);
  const cliProjectCode = normalizeProjectCode(process.env.CLI_PROJECT_CODE || 'PRJ');
  const cliStoryNumber = Number.isFinite(parsedCliStoryNumber) && parsedCliStoryNumber > 0
    ? parsedCliStoryNumber
    : null;
  const stories = inputStory
    ? [{ id: cliStoryId, source: cliStorySource, userStory: inputStory, storyNumberOverride: cliStoryNumber, projectCode: cliProjectCode }]
    : await loadUserStoriesFromDirectory();

  let generatedCount = 0;
  const generatedScriptPaths = [];
  let anyCasePassed = false;
  let hadFinalFailures = false;

  async function runOptionalSyncAgent() {
    if (!isSyncAgentEnabled()) {
      return;
    }

    const syncResult = await syncAgentRun();
    console.log('\nSync agent result: SUCCESS');
    console.log(`Synced generated tests from ${syncResult.sourceDisplay} to ${syncResult.targetDisplay}.`);
  }

  for (let i = 0; i < stories.length; i += 1) {
    const storyEntry = stories[i];
    const isSingle = stories.length === 1;
    const storyNumber = Number.isFinite(storyEntry.storyNumberOverride)
      ? Number(storyEntry.storyNumberOverride)
      : extractStoryNumber(storyEntry.source, i + 1);
    const projectCode = normalizeProjectCode(storyEntry.projectCode || cliProjectCode);
    const storyName = buildStoryName(projectCode, storyNumber);
    const storyFolderName = storyName;
    const storyOutputDir = path.join('generated_tests', storyFolderName);
    const storyTestCasesDir = path.join(storyOutputDir, 'test-cases');
    const storyScreenshotsDir = path.join(storyOutputDir, 'screenshots');
    await fs.mkdir(storyOutputDir, { recursive: true });
    await fs.mkdir(storyTestCasesDir, { recursive: true });
    await fs.mkdir(storyScreenshotsDir, { recursive: true });
    const existingTests = await getExistingStoryTests(projectCode, storyNumber);
    const generatedDescriptions = [];
    const storyCaseResults = [];

    console.log(`\n1.${i + 1}) Generating complete manual test cases with acceptance criteria (${storyEntry.source})...`);
    const manualCatalog = await generateManualTestCatalog(storyEntry.userStory);
    const normalizedCatalogCases = Array.isArray(manualCatalog.testCases)
      ? manualCatalog.testCases.map((testCase, caseIndex) => ({
        ...testCase,
        id: buildCaseId(projectCode, storyNumber, caseIndex + 1)
      }))
      : [];
    manualCatalog.testCases = normalizedCatalogCases;

    const automatableCases = manualCatalog.testCases
      .filter((testCase) => testCase.automationCandidate)
      .slice(0, config.maxAutomatedCases);
    const intelligence = analyzeCoverageAndGaps({
      automatableCases,
      existingTestDescriptions: existingTests.descriptions,
      generatedDescriptions
    });
    const casesToAutomate = intelligence.missingCases;

    const manualJsonFileName = isSingle
      ? 'manual-test-cases.json'
      : `manual-test-cases-${storyEntry.id}.json`;
    const manualMdFileName = isSingle
      ? 'manual-test-cases.md'
      : `manual-test-cases-${storyEntry.id}.md`;
    const automationSelectionFileName = isSingle
      ? 'automation-selection.json'
      : `automation-selection-${storyEntry.id}.json`;

    await fs.writeFile(path.join(storyOutputDir, manualJsonFileName), JSON.stringify(manualCatalog, null, 2));
    await fs.writeFile(
      path.join(storyOutputDir, manualMdFileName),
      renderManualCatalogMarkdown(storyEntry.source, manualCatalog, automatableCases)
    );
    await fs.writeFile(path.join(storyOutputDir, automationSelectionFileName), JSON.stringify({
      storySource: storyEntry.source,
      totalManualTests: manualCatalog.testCases.length,
      coverage: {
        totalAutomatable: intelligence.totalAutomatable,
        covered: intelligence.covered,
        missing: intelligence.missing,
        coveragePercent: intelligence.coveragePercent,
        coveredCases: intelligence.coveredCases,
        missingScenarioTitles: intelligence.missingScenarioTitles
      },
      selectedAutomatableTests: automatableCases.map((testCase) => ({
        id: testCase.id,
        title: testCase.title,
        reason: testCase.automationReason
      })),
      selectedMissingTestsForGeneration: casesToAutomate.map((testCase) => ({
        id: testCase.id,
        title: testCase.title,
        reason: testCase.automationReason
      })),
      skippedManualOnlyTests: manualCatalog.testCases
        .filter((testCase) => !testCase.automationCandidate)
        .map((testCase) => ({
          id: testCase.id,
          title: testCase.title,
          reason: testCase.automationReason
        }))
    }, null, 2));

    console.log(`Saved manual tests: ${storyOutputDir}/${manualJsonFileName}`);
    console.log(`Saved manual tests markdown: ${storyOutputDir}/${manualMdFileName}`);
    console.log(`Saved automation selection: ${storyOutputDir}/${automationSelectionFileName}`);
    console.log(`Coverage for ${storyEntry.source}: ${intelligence.coveragePercent}% (${intelligence.covered}/${intelligence.totalAutomatable}).`);

    if (automatableCases.length === 0) {
      console.log(`No automatable test cases selected for ${storyEntry.source}.`);
      continue;
    }

    if (casesToAutomate.length === 0) {
      console.log(`All automatable scenarios are already covered for ${storyEntry.source}. No gap to generate.`);
      continue;
    }

    console.log(`\n2.${i + 1}) Generating Playwright scripts for ${casesToAutomate.length} missing test gap(s)...`);
    for (let caseIndex = 0; caseIndex < casesToAutomate.length; caseIndex += 1) {
      const selectedCase = casesToAutomate[caseIndex];
      const caseId = buildCaseId(projectCode, storyNumber, caseIndex + 1);
      const caseOutputDir = path.join(storyTestCasesDir, caseId);
      const caseScreenshotsDir = path.join(storyScreenshotsDir, caseId);
      await fs.mkdir(caseOutputDir, { recursive: true });
      await fs.mkdir(caseScreenshotsDir, { recursive: true });
      const maxAttempts = config.agentMode ? Math.max(1, config.agentMaxAttempts) : 1;
      let previousFailureFeedback = null;
      let casePassed = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (config.agentMode) {
          console.log(`\nAgent attempt ${attempt}/${maxAttempts} for ${selectedCase.id}...`);
        }

        const plan = await plannerAgentCreatePlan({
          existingTestDescriptions: [...existingTests.descriptions, ...generatedDescriptions],
          selectedManualCase: selectedCase,
          attemptNumber: attempt,
          agentFeedback: previousFailureFeedback,
          qualityFeedback: buildContinuousImprovementFeedback(storyCaseResults),
          missingScenarioTitles: intelligence.missingScenarioTitles,
          userStory: storyEntry.userStory
        });

        if (plan.status === 'NO_NEW_TEST') {
          console.log(`Skipping ${selectedCase.id}: ${plan.reason || 'No additional unique automated test.'}`);
          break;
        }

        const shortDescription = toShortDescription(plan.title || selectedCase.title);
        if (!config.agentMode && existingTests.slugs.has(shortDescription)) {
          console.log(`Skipping duplicate for ${selectedCase.id}: ${projectCode.toLowerCase()}_story_${storyNumber}_${shortDescription}.spec.js already exists.`);
          break;
        }

        const useSelfHealing = config.agentMode && config.selfHealingEnabled;
        const attemptSuffix = config.agentMode
          ? (useSelfHealing ? '' : `_attempt_${attempt}`)
          : '';
        const fileNameHint = `${projectCode.toLowerCase()}_story_${storyNumber}_${shortDescription}${attemptSuffix}`;
        const resultNameBase = `${projectCode.toLowerCase()}_story_${storyNumber}_${shortDescription}${attemptSuffix}`;
        const screenshotFileName = isSingle
          ? `final-ui-${caseId}${attemptSuffix}.png`
          : `final-ui-${storyEntry.id}-${caseId}${attemptSuffix}.png`;
        const screenshotPath = path.join(caseScreenshotsDir, screenshotFileName);
        const scriptPath = await buildPlaywrightScript(plan, {
          fileNameHint,
          resultNameBase,
          screenshotPath,
          suiteTags: [
            'ai',
            'regression',
            `story-${storyNumber}`,
            `case-${caseIndex + 1}`,
            `type-${toSuiteTag(selectedCase.type, 'functional')}`,
            `priority-${toSuiteTag(selectedCase.priority, 'medium')}`
          ],
          outputDir: caseOutputDir
        });

        generatedCount += 1;
        console.log(`Generated script: ${scriptPath}`);

        if (!config.agentMode) {
          generatedScriptPaths.push(path.relative(process.cwd(), scriptPath));
          generatedDescriptions.push(plan.title || selectedCase.title);
          existingTests.slugs.add(shortDescription);
          casePassed = true;
          break;
        }

        const relativeScriptPath = path.relative(process.cwd(), scriptPath);
        const executionResult = await executorAgentRun({
          scriptPath: relativeScriptPath,
          storyId: storyEntry.id,
          caseId,
          attempt
        });
        const validationResult = await validatorAgentValidate({
          userStory: storyEntry.userStory,
          plan,
          screenshotPath
        });
        const improvementResult = await improvementAgentSuggest({
          userStory: storyEntry.userStory,
          selectedManualCase: selectedCase,
          executionResult,
          validationResult
        });

        storyCaseResults.push({
          caseId,
          attempt,
          scriptPath: relativeScriptPath,
          executionStatus: executionResult.passed ? 'PASS' : 'FAIL',
          executionCode: executionResult.code,
          failureCause: executionResult.passed ? '' : executionResult.failureSummary,
          debugCommand: `npx playwright test ${relativeScriptPath} --headed --project=chromium`,
          outputTail: executionResult.outputTail || '',
          validationStatus: String(validationResult.status || 'UNKNOWN').toUpperCase(),
          validationSummary: validationResult.summary,
          improvementPriority: improvementResult.priority,
          improvements: improvementResult.improvements,
          executedAt: executionResult.executedAt
        });

        if (executionResult.passed) {
          console.log(`Agent execution PASS for ${selectedCase.id} on attempt ${attempt}.`);
          generatedScriptPaths.push(relativeScriptPath);
          generatedDescriptions.push(plan.title || selectedCase.title);
          existingTests.slugs.add(shortDescription);
          anyCasePassed = true;
          casePassed = true;
          break;
        }

        previousFailureFeedback = [
          `Playwright execution failed with exit code ${executionResult.code} for generated script ${relativeScriptPath}.`,
          `Failure summary: ${executionResult.failureSummary}`,
          executionResult.outputTail ? `Recent output: ${executionResult.outputTail}` : '',
          `UI validation status: ${validationResult.status}.`,
          `UI validation summary: ${validationResult.summary}`
        ].filter(Boolean).join(' ');

        if (config.selfHealingEnabled) {
          console.log(`Self-healing active: updating script and retrying ${selectedCase.id}.`);
        }
        console.log(`Agent execution FAIL for ${selectedCase.id} on attempt ${attempt}.`);
      }

      if (!casePassed && config.agentMode) {
        hadFinalFailures = true;
        console.log(`Agent could not produce a passing script for ${selectedCase.id} within ${maxAttempts} attempt(s).`);
      }
    }

    if (config.agentMode && storyCaseResults.length > 0) {
      const reportPaths = await reporterAgentWriteReport({
        storySource: storyEntry.source,
        storyOutputDir,
        caseResults: storyCaseResults
      });
      console.log(`Saved multi-agent summary: ${reportPaths.summaryPath}`);
      console.log(`Saved multi-agent dashboard: ${reportPaths.dashboardPath}`);
    }
  }

  if (generatedCount === 0) {
    console.log('\nNo new unique tests were generated. Existing tests are already covering these stories.');
    await runOptionalSyncAgent();
  }

  if (generatedScriptPaths.length === 0) {
    await buildReportData();
    await runOptionalSyncAgent();
    console.log('\nNo automatable tests were generated to execute.');
    console.log('\nFlow complete: User Story -> Manual Test Cases -> Automation Selection -> Script Generation');
    return;
  }

  if (config.agentMode) {
    await buildReportData();
    await runOptionalSyncAgent();
    const outcome = hadFinalFailures
      ? 'PARTIAL_FAIL'
      : (anyCasePassed ? 'PASS' : 'FAIL');
    console.log(`\nAgent mode execution summary: ${outcome}`);
    console.log('\nFlow complete: User Story -> Manual Test Cases -> Automation Selection -> Agent Loop (Generate -> Run -> Refine)');
    return;
  }

  console.log(`\n3) Running Playwright tests for ${generatedScriptPaths.length} generated script(s)...`);
  const runResult = await runGeneratedTest(generatedScriptPaths);
  console.log(`Playwright result: ${runResult.passed ? 'PASS' : 'FAIL'} (code ${runResult.code})`);
  await buildReportData();
  await runOptionalSyncAgent();

  console.log('\nFlow complete: User Story -> Manual Test Cases -> Automation Selection -> Playwright Scripts -> Test Execution');
}

main().catch((err) => {
  console.error('\nExecution failed:', err.message);
  process.exit(1);
});
