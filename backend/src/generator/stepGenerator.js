import { askClaude } from '../ai/claudeClient.js';
import { extractJsonBlock } from '../utils/json.js';
import { config } from '../config.js';

export async function generateTestPlan(userStory, options = {}) {
  const existingTestDescriptions = options.existingTestDescriptions || [];
  const selectedManualCase = options.selectedManualCase || null;
  const agentFeedback = options.agentFeedback || null;
  const missingScenarioTitles = options.missingScenarioTitles || [];
  const qualityFeedback = options.qualityFeedback || null;
  const attemptNumber = Number(options.attemptNumber || 1);
  const system = [
    'You are a senior QA automation architect.',
    'Convert plain-English user stories into deterministic UI test steps for Playwright.',
    'Return only JSON.'
  ].join(' ');

  const selectedCaseSection = selectedManualCase
    ? [
      'Selected manual test case to automate:',
      JSON.stringify(selectedManualCase, null, 2),
      '',
      'Focus only on automating this selected manual case. Do not add unrelated scenarios.'
    ].join('\n')
    : '';

  const agentFeedbackSection = agentFeedback
    ? [
      'Agent retry context:',
      `Attempt number: ${attemptNumber}`,
      `Previous execution feedback: ${agentFeedback}`,
      '',
      'Refine selectors and step order to avoid repeating the same failure pattern.'
    ].join('\n')
    : '';

  const gapAnalysisSection = missingScenarioTitles.length > 0
    ? [
      'Gap analysis focus:',
      `Missing scenarios to prioritize: ${JSON.stringify(missingScenarioTitles)}`,
      '',
      'Generate steps that close one missing scenario without duplicating existing coverage.'
    ].join('\n')
    : '';

  const qualityFeedbackSection = qualityFeedback
    ? [
      'Continuous quality improvement hints from previous runs:',
      qualityFeedback
    ].join('\n')
    : '';

  const user = [
    'Create a test plan from this user story:',
    userStory,
    '',
    'Output schema:',
    '{',
    '  "title": "short test title",',
    `  "url": "${config.appUrl}",`,
    '  "steps": [',
    '    {',
    '      "action": "goto|click|fill|press|waitFor|assertVisible|assertText",',
    '      "selector": "preferred locator",',
    '      "value": "input text or expected text",',
    '      "description": "human readable step"',
    '    }',
    '  ],',
    '  "validationCriteria": ["list what should be visible/true on final UI"]',
    '}',
    '',
    'OR return this schema when no new test can be added beyond existing tests:',
    '{',
    '  "status": "NO_NEW_TEST",',
    '  "reason": "why there is no additional unique test"',
    '}',
    '',
    `Existing tests for this story: ${JSON.stringify(existingTestDescriptions)}`,
    '',
    selectedCaseSection,
    selectedCaseSection ? '' : null,
    gapAnalysisSection,
    gapAnalysisSection ? '' : null,
    qualityFeedbackSection,
    qualityFeedbackSection ? '' : null,
    agentFeedbackSection,
    agentFeedbackSection ? '' : null,
    'Rules:',
    '1) Use stable selectors when possible.',
    '2) Keep steps atomic and executable.',
    `3) If URL is unknown, set url to ${config.appUrl} and use generic placeholders.`,
    '4) Prefer deterministic selectors (role/text/testid) over broad CSS patterns.',
    '5) Do not use comma-separated fallback selectors like "a, b, c" because they cause strict-mode ambiguity.',
    '6) Avoid duplicating the existing tests listed above.',
    '7) If no additional unique test can be created, return status NO_NEW_TEST.',
    '8) Prioritize missing scenarios and close coverage gaps first.',
    '9) Return strict JSON only.'
  ].filter((line) => line !== null).join('\n');

  const raw = await askClaude({ system, user, maxTokens: 1800 });
  const jsonText = extractJsonBlock(raw);
  const plan = JSON.parse(jsonText);

  if (plan.status === 'NO_NEW_TEST') {
    return plan;
  }

  if (!plan.title || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error('Generated test plan is invalid.');
  }

  return plan;
}
