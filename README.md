# AI-Assisted Playwright Framework (Claude + UI Validation)

## Goal

Give a plain English test -> AI generates steps -> Playwright executes -> AI validates UI.

## End-to-End Flow

User Story -> Claude -> Test Steps -> Playwright Script -> Run Test -> Screenshot -> Claude -> Validation Result

## What This Project Does

- Accepts a plain-English user story from CLI input.
- Uses Claude API to generate structured test steps.
- Converts steps into a Playwright test script automatically.
- Executes the generated Playwright script.
- Captures final UI screenshot.
- Sends screenshot + validation criteria back to Claude.
- Produces a final PASS/FAIL style validation output.

## Architecture

- src/index.js: Orchestration pipeline.
- src/ai/claudeClient.js: Claude API calls (text and vision).
- src/generator/stepGenerator.js: User story to test plan generation.
- src/generator/scriptBuilder.js: Test plan to Playwright script.
- src/runner/runGeneratedTest.js: Executes Playwright tests.
- src/validator/uiValidator.js: Screenshot-based UI validation with Claude.
- generated_tests/: AI-generated Playwright test scripts.
- artifacts/: Generated plan, screenshot, validation result.

## Setup

1. Install dependencies:

   npm install

2. Install Playwright browser:

   npm run playwright:install

3. Add environment file:

   cp .env.example .env

4. Put your Claude API key in .env:

   ANTHROPIC_API_KEY=your_key

Optional model override:

CLAUDE_MODEL=claude-3-5-sonnet-latest

## Run

npm start

For direct test execution:

npm run test:generated_tests

To open the HTML report:

npm run report:generated_tests

When prompted:
- Type a user story and press Enter to run that one story.
- Or just press Enter to load all user stories from user-stories/*.txt and generate separate tests for each file.
- If a user story already has matching generated tests, the framework skips duplicates and only adds a new test when it finds an additional unique scenario.

## Output Artifacts

- artifacts/generated-plan.json
- artifacts/generated-plan-<story-file>.json (when multiple stories are loaded)
- generated_tests/*.spec.js
- artifacts/final-ui.png
- artifacts/final-ui-<story-file>.png (when multiple stories are loaded)
- artifacts/validation-result.json
- playwright-report/index.html
- test-results/*.png

## Presentation Script (Short)

1. Start with the goal statement.
2. Enter a plain-English user story.
3. Show generated JSON test plan.
4. Show generated Playwright script.
5. Run test and show screenshot.
6. Show Claude validation JSON (PASS/FAIL + reasons).
7. Close with the pipeline flow.

## Notes

- The generated selectors depend on user story detail and target website consistency.
- For real projects, add guardrails such as selector maps, domain constraints, and retry logic.
