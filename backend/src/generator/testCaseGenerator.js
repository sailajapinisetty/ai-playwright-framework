import { askClaude } from '../ai/claudeClient.js';
import { extractJsonBlock } from '../utils/json.js';
import { config } from '../config.js';

async function parseJsonWithRepair(rawText) {
  const jsonText = extractJsonBlock(rawText);

  try {
    return JSON.parse(jsonText);
  } catch (firstError) {
    const repairSystem = [
      'You repair malformed JSON output from another model.',
      'Return strictly valid JSON only.',
      'Do not add commentary or markdown fences.',
      'Preserve original meaning.'
    ].join(' ');

    const repairUser = [
      'Fix this malformed JSON so it parses correctly:',
      jsonText
    ].join('\n\n');

    const repairedRaw = await askClaude({ system: repairSystem, user: repairUser, maxTokens: 2600 });
    const repairedJsonText = extractJsonBlock(repairedRaw);

    try {
      return JSON.parse(repairedJsonText);
    } catch {
      throw new Error(`Manual test catalog JSON is invalid after repair attempt: ${firstError.message}`);
    }
  }
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeCase(testCase, index) {
  const title = String(testCase?.title || '').trim();
  if (!title) {
    throw new Error(`Manual test case #${index + 1} is missing title.`);
  }

  const expectedResult = String(testCase?.expectedResult || '').trim();
  if (!expectedResult) {
    throw new Error(`Manual test case "${title}" is missing expectedResult.`);
  }

  return {
    id: String(testCase?.id || `TC-${String(index + 1).padStart(3, '0')}`),
    title,
    type: String(testCase?.type || 'functional').trim() || 'functional',
    priority: String(testCase?.priority || 'medium').trim() || 'medium',
    preconditions: normalizeTextList(testCase?.preconditions),
    steps: normalizeTextList(testCase?.steps),
    expectedResult,
    acceptanceCriteria: normalizeTextList(testCase?.acceptanceCriteria),
    automationCandidate: Boolean(testCase?.automationCandidate),
    automationReason: String(testCase?.automationReason || '').trim(),
    tags: normalizeTextList(testCase?.tags)
  };
}

function fallbackManualCatalog(userStory) {
  const summary = String(userStory || '').trim().replace(/\s+/g, ' ');
  const storyTitle = summary ? `Automated scenario for: ${summary.slice(0, 70)}` : 'Automated user story scenario';

  return {
    storyTitle,
    storyAcceptanceCriteria: [
      'User can open the configured application URL.',
      'Primary user journey is executable end-to-end from the provided story text.'
    ],
    testCases: [
      {
        id: 'TC-001',
        title: summary ? `Validate core flow: ${summary.slice(0, 60)}` : 'Validate core flow from provided user story',
        type: 'functional',
        priority: 'high',
        preconditions: ['Application URL is reachable.'],
        steps: [
          'Open the application URL.',
          'Perform the main action described in the user story.',
          'Verify expected behavior is visible in the UI.'
        ],
        expectedResult: 'Main user flow works without UI errors.',
        acceptanceCriteria: ['Core user flow is functional.'],
        automationCandidate: true,
        automationReason: 'Fallback automation path to ensure script generation and execution.',
        tags: ['smoke', 'ui']
      }
    ]
  };
}

export async function generateManualTestCatalog(userStory) {
  const system = [
    'You are a senior QA test architect.',
    'Produce a complete manual test suite from a user story.',
    'Include acceptance criteria mapping and automation suitability.',
    'Return strict JSON only.'
  ].join(' ');

  const user = [
    'Create 1 manual test cases for this user story:',
    userStory,
    '',
    'Output schema:',
    '{',
    '  "storyTitle": "short title",',
    '  "storyAcceptanceCriteria": ["AC extracted from user story"],',
    '  "testCases": [',
    '    {',
    '      "id": "TC-001",',
    '      "title": "clear test case title",',
    '      "type": "functional|negative|edge|accessibility|usability|error-handling",',
    '      "priority": "high|medium|low",',
    '      "preconditions": ["state before test"],',
    '      "steps": ["manual execution step"],',
    '      "expectedResult": "expected outcome",',
    '      "acceptanceCriteria": ["which AC this test verifies"],',
    '      "automationCandidate": true,',
    '      "automationReason": "why automation is practical or not",',
    '      "tags": ["smoke|regression|ui|api|negative"]',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '1) Cover happy path, negative, and edge behaviors where applicable.',
    '2) Keep steps deterministic and executable by a human tester.',
    '3) Mark automationCandidate=true only when UI behavior is stable and verifiable in Playwright.',
    '4) Include at least one acceptanceCriteria entry per test case.',
    '5) Return strict JSON only. No markdown.'
  ].join('\n');

  if (!config.aiEnabled) {
    return fallbackManualCatalog(userStory);
  }

  try {
    const raw = await askClaude({ system, user, maxTokens: 2600 });
    const parsed = await parseJsonWithRepair(raw);

    if (!Array.isArray(parsed?.testCases) || parsed.testCases.length === 0) {
      throw new Error('Generated manual test catalog is invalid: missing testCases.');
    }

    return {
      storyTitle: String(parsed?.storyTitle || 'User Story'),
      storyAcceptanceCriteria: normalizeTextList(parsed?.storyAcceptanceCriteria),
      testCases: parsed.testCases.map((testCase, index) => normalizeCase(testCase, index))
    };
  } catch {
    return fallbackManualCatalog(userStory);
  }
}
