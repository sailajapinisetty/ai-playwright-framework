import fs from 'fs/promises';
import path from 'path';
import { askClaudeWithImage } from '../ai/claudeClient.js';

export async function validateFinalUI({ userStory, plan }) {
  const screenshotPath = path.resolve(process.cwd(), 'artifacts/final-ui.png');
  let screenshotFile;
  try {
    screenshotFile = await fs.readFile(screenshotPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return JSON.stringify({
        status: 'FAIL',
        confidence: 100,
        summary: 'Final UI screenshot was not found. Playwright likely failed before capture.',
        checks: []
      }, null, 2);
    }
    throw error;
  }
  const screenshotBase64 = screenshotFile.toString('base64');

  const system = [
    'You are a strict UI validation assistant.',
    'You receive a user story, generated validation criteria, and the final UI screenshot.',
    'Decide pass/fail and explain concise reasons.'
  ].join(' ');

  const user = [
    `User story: ${userStory}`,
    `Validation criteria: ${JSON.stringify(plan.validationCriteria || [], null, 2)}`,
    '',
    'Return strict JSON only with schema:',
    '{',
    '  "status": "PASS|FAIL",',
    '  "confidence": 0-100,',
    '  "summary": "short explanation",',
    '  "checks": [',
    '    { "criterion": "text", "result": "PASS|FAIL|UNKNOWN", "reason": "why" }',
    '  ]',
    '}'
  ].join('\n');

  const result = await askClaudeWithImage({
    system,
    user,
    screenshotBase64,
    maxTokens: 1200
  });

  return result;
}
