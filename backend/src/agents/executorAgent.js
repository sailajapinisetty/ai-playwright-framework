import { runGeneratedTest } from '../runner/runGeneratedTest.js';

function extractFailureSummary(outputTail) {
  const lines = String(outputTail || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const interesting = lines.find((line) => /error|timeout|locator|expect|failed/i.test(line));
  return interesting || (lines.length > 0 ? lines[lines.length - 1] : 'No failure details were captured.');
}

export async function executorAgentRun({ scriptPath, storyId, caseId, attempt }) {
  const runResult = await runGeneratedTest([scriptPath]);

  return {
    storyId,
    caseId,
    attempt,
    scriptPath,
    passed: runResult.passed,
    code: runResult.code,
    outputTail: runResult.outputTail || '',
    failureSummary: runResult.passed ? '' : extractFailureSummary(runResult.outputTail),
    executedAt: new Date().toISOString()
  };
}
