import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './generated_tests',
  timeout: 60_000,
  retries: 0,
  outputDir: '.playwright-output',
  preserveOutput: 'never',
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    headless: false,
    viewport: null,
    screenshot: 'off',
    trace: 'off',
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
  ]
});

