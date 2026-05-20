import { askClaude } from '../ai/claudeClient.js';
import { extractJsonBlock } from '../utils/json.js';

export async function generateTestPlan(userStory, options = {}) {
  const existingTestDescriptions = options.existingTestDescriptions || [];
  const system = [
    'You are a senior QA automation architect.',
    'Convert plain-English user stories into deterministic UI test steps for Playwright.',
    'Return only JSON.'
  ].join(' ');

  const user = [
    'Create a test plan from this user story:',
    userStory,
    '',
    'Output schema:',
    '{',
    '  "title": "short test title",',
    '  "url": "https://sailajapinisetty.github.io/demo_app/",',
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
    'Rules:',
    '1) Use stable selectors when possible.',
    '2) Keep steps atomic and executable.',
    '3) If URL is unknown, set url to https://sailajapinisetty.github.io/demo_app/ and use generic placeholders.',
    '4) Prefer deterministic selectors (role/text/testid) over broad CSS patterns.',
    '5) Do not use comma-separated fallback selectors like "a, b, c" because they cause strict-mode ambiguity.',
    '6) Avoid duplicating the existing tests listed above.',
    '7) If no additional unique test can be created, return status NO_NEW_TEST.',
    '8) Return strict JSON only.'
  ].join('\n');

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
