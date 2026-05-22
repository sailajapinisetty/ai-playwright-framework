import { defineConfig } from '@playwright/test';
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

const appUrl = parseHttpUrl('APP_URL', DEFAULT_APP_URL);
const defaultTimeoutMs = parsePositiveInt('DEFAULT_TIMEOUT_MS', 60_000);
const navigationTimeoutMs = parsePositiveInt('NAVIGATION_TIMEOUT_MS', 30_000);
const retryCount = parsePositiveInt('RETRY_COUNT', 0);
const screenshotOnFailure = parseBoolean('SCREENSHOT_ON_FAILURE', true);

export default defineConfig({
  testDir: './generated_tests',
  timeout: defaultTimeoutMs,
  retries: retryCount,
  outputDir: '.playwright-output',
  preserveOutput: 'always',
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    baseURL: appUrl,
    headless: false,
    viewport: null,
    navigationTimeout: navigationTimeoutMs,
    screenshot: screenshotOnFailure ? 'only-on-failure' : 'off',
    trace: 'on',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--start-maximized']
        }
      }
    },
    {
      name: 'webkit',
      use: {
        browserName: 'webkit',
      }
    }
  ]
});

