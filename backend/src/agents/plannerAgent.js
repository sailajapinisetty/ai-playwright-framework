import { generateTestPlan } from '../generator/stepGenerator.js';

export async function plannerAgentCreatePlan({
  userStory,
  existingTestDescriptions = [],
  selectedManualCase = null,
  attemptNumber = 1,
  agentFeedback = null,
  missingScenarioTitles = [],
  qualityFeedback = null
}) {
  return generateTestPlan(userStory, {
    existingTestDescriptions,
    selectedManualCase,
    attemptNumber,
    agentFeedback,
    missingScenarioTitles,
    qualityFeedback
  });
}
