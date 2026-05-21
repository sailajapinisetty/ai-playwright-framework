function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scenarioTokens(value) {
  return new Set(normalizeText(value).split(' ').filter(Boolean));
}

function overlapScore(aText, bText) {
  const a = scenarioTokens(aText);
  const b = scenarioTokens(bText);

  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(a.size, b.size);
}

function createCaseSignature(testCase) {
  return normalizeText(`${testCase.id} ${testCase.title} ${testCase.expectedResult}`);
}

export function analyzeCoverageAndGaps({
  automatableCases = [],
  existingTestDescriptions = [],
  generatedDescriptions = []
}) {
  const knownScenarios = [...existingTestDescriptions, ...generatedDescriptions]
    .map((item) => normalizeText(item))
    .filter(Boolean);

  const missingCases = [];
  const coveredCases = [];

  for (const testCase of automatableCases) {
    const signature = createCaseSignature(testCase);
    const maxSimilarity = knownScenarios.reduce((best, scenario) => {
      const score = overlapScore(signature, scenario);
      return score > best ? score : best;
    }, 0);

    if (maxSimilarity >= 0.6) {
      coveredCases.push({
        id: testCase.id,
        title: testCase.title,
        similarity: Number(maxSimilarity.toFixed(2))
      });
      continue;
    }

    missingCases.push(testCase);
  }

  const total = automatableCases.length;
  const covered = coveredCases.length;
  const missing = missingCases.length;
  const coveragePercent = total === 0 ? 100 : Math.round((covered / total) * 100);

  return {
    totalAutomatable: total,
    covered,
    missing,
    coveragePercent,
    coveredCases,
    missingCases,
    missingScenarioTitles: missingCases.map((item) => item.title)
  };
}

export function buildContinuousImprovementFeedback(storyCaseResults = []) {
  if (!Array.isArray(storyCaseResults) || storyCaseResults.length === 0) {
    return '';
  }

  const failedExecutions = storyCaseResults.filter((item) => item.executionStatus === 'FAIL').length;
  const failedValidation = storyCaseResults.filter((item) => item.validationStatus !== 'PASS').length;

  const allSuggestions = storyCaseResults
    .flatMap((item) => item.improvements || [])
    .filter(Boolean)
    .slice(0, 5);

  return [
    `Previous failed executions: ${failedExecutions}.`,
    `Previous failed UI validations: ${failedValidation}.`,
    allSuggestions.length > 0 ? `Past improvement hints: ${allSuggestions.join(' | ')}` : ''
  ].filter(Boolean).join(' ');
}
