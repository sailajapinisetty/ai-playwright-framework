import { askClaude } from '../ai/claudeClient.js';
import { extractJsonBlock } from '../utils/json.js';

function fallbackImprovements(executionResult, validationResult) {
  const suggestions = [];

  if (!executionResult.passed) {
    suggestions.push('Stabilize selectors by preferring role/name or test ids over brittle CSS paths.');
    suggestions.push('Add intermediate waitFor/assertVisible steps before click or fill actions.');
  }

  if (String(validationResult.status || '').toUpperCase() !== 'PASS') {
    suggestions.push('Add explicit assertText/assertVisible steps for each acceptance criterion.');
    suggestions.push('Use deterministic navigation targets and avoid ambiguous entry pages.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Current test behavior looks stable. Keep monitoring flaky selectors across runs.');
  }

  return suggestions;
}

export async function improvementAgentSuggest({
  userStory,
  selectedManualCase,
  executionResult,
  validationResult
}) {
  const system = [
    'You are an automation improvement agent.',
    'Analyze test execution and UI validation outcomes.',
    'Return concrete next-step improvements for Playwright reliability and coverage.',
    'Return strict JSON only.'
  ].join(' ');

  const user = [
    `User story: ${userStory}`,
    `Selected manual case: ${JSON.stringify(selectedManualCase || {}, null, 2)}`,
    `Execution result: ${JSON.stringify(executionResult || {}, null, 2)}`,
    `Validation result: ${JSON.stringify(validationResult || {}, null, 2)}`,
    '',
    'Return JSON schema:',
    '{',
    '  "improvements": ["specific actionable suggestion"],',
    '  "priority": "high|medium|low"',
    '}'
  ].join('\n');

  try {
    const raw = await askClaude({ system, user, maxTokens: 900 });
    const jsonText = extractJsonBlock(raw);
    const parsed = JSON.parse(jsonText);

    return {
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map((item) => String(item)) : fallbackImprovements(executionResult, validationResult),
      priority: String(parsed.priority || 'medium')
    };
  } catch {
    return {
      improvements: fallbackImprovements(executionResult, validationResult),
      priority: 'medium'
    };
  }
}
