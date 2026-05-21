import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_APP_URL = 'https://sailajapinisetty.github.io/demo_app/';

function parseHttpUrl(envName, fallbackValue) {
  const value = process.env[envName] || fallbackValue;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envName} must be a valid URL. Received: ${value}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${envName} must start with http:// or https://. Received: ${value}`);
  }

  return parsed.toString();
}

function parsePositiveInt(envName, fallbackValue) {
  const rawValue = process.env[envName];
  if (rawValue === undefined || rawValue === '') {
    return fallbackValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${envName} must be a non-negative integer. Received: ${rawValue}`);
  }

  return parsed;
}

function parseBoolean(envName, fallbackValue) {
  const rawValue = process.env[envName];
  if (rawValue === undefined || rawValue === '') {
    return fallbackValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`${envName} must be a boolean value (true/false). Received: ${rawValue}`);
}

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  claudeModel: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
  appUrl: parseHttpUrl('APP_URL', DEFAULT_APP_URL),
  defaultTimeoutMs: parsePositiveInt('DEFAULT_TIMEOUT_MS', 60_000),
  navigationTimeoutMs: parsePositiveInt('NAVIGATION_TIMEOUT_MS', 30_000),
  retryCount: parsePositiveInt('RETRY_COUNT', 0),
  screenshotOnFailure: parseBoolean('SCREENSHOT_ON_FAILURE', true),
  maxAutomatedCases: parsePositiveInt('MAX_AUTOMATED_CASES', 10),
  agentMode: parseBoolean('AGENT_MODE', false),
  agentMaxAttempts: parsePositiveInt('AGENT_MAX_ATTEMPTS', 3),
  selfHealingEnabled: parseBoolean('SELF_HEALING_ENABLED', true)
};

if (!config.anthropicApiKey) {
  throw new Error('ANTHROPIC_API_KEY is missing. Add it to your .env file.');
}
