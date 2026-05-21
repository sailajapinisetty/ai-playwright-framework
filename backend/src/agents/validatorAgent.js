import { extractJsonBlock } from '../utils/json.js';
import { validateFinalUI } from '../validator/uiValidator.js';

function toFailureValidation(summary) {
  return {
    status: 'FAIL',
    confidence: 100,
    summary,
    checks: []
  };
}

export async function validatorAgentValidate({ userStory, plan, screenshotPath }) {
  try {
    const raw = await validateFinalUI({ userStory, plan, screenshotPath });
    const jsonText = extractJsonBlock(raw);
    const parsed = JSON.parse(jsonText);

    return {
      status: String(parsed.status || 'UNKNOWN'),
      confidence: Number(parsed.confidence || 0),
      summary: String(parsed.summary || 'No summary provided.'),
      checks: Array.isArray(parsed.checks) ? parsed.checks : []
    };
  } catch (error) {
    return toFailureValidation(`Validator agent failed: ${error.message}`);
  }
}
