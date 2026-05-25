# AI-Assisted Playwright Framework (Claude + UI Validation)

## Goal

Give a plain English user story -> AI writes full manual test cases (with AC) -> AI picks automatable cases -> Playwright scripts are generated and executed.

## End-to-End Flow

User Story -> Manual Test Cases + AC -> Automation Selection -> Playwright Scripts -> Run Tests

Agent mode flow:

User Story -> Manual Test Cases + AC -> Automation Selection -> Generate Script -> Run -> Refine (retry loop)

Intelligent selection flow:

Existing tests -> Deduplication -> Gap analysis -> Generate only missing scenarios

## What This Project Does

- Accepts a plain-English user story from CLI input.
- Uses Claude API to generate complete manual test cases with acceptance criteria mapping.
- Marks which manual test cases are practical automation candidates.
- Converts selected automatable cases into Playwright test scripts.
- Evaluates coverage against existing generated tests and only adds missing scenarios.
- Avoids duplicates using similarity-based test intelligence.
- Executes the generated Playwright scripts.

## Architecture

- src/index.js: Orchestration pipeline.
- src/ai/claudeClient.js: Claude API calls (text and vision).
- src/generator/testCaseGenerator.js: User story to manual test catalog + automation candidacy.
- src/generator/stepGenerator.js: User story to test plan generation.
- src/generator/scriptBuilder.js: Test plan to Playwright script.
- src/runner/runGeneratedTest.js: Executes Playwright tests.
- generated_tests/: Story-specific folders containing manual test cases, automation selection, screenshots, and Playwright scripts.
- artifacts/: Legacy/shared artifacts.

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

Optional app and Playwright runtime overrides:

APP_URL=https://sailajapinisetty.github.io/demo_app/
DEFAULT_TIMEOUT_MS=60000
NAVIGATION_TIMEOUT_MS=30000
RETRY_COUNT=0
SCREENSHOT_ON_FAILURE=true
AGENT_MODE=false
AGENT_MAX_ATTEMPTS=3
SELF_HEALING_ENABLED=true

## Run

npm start

`npm start` now launches the UI app at `http://localhost:4173`.

To run the original CLI flow directly:

npm run start:cli

For direct test execution:

npm run test:generated_tests

To build and open the report UI explicitly:

npm run ui

To open the HTML report:

npm run report:generated_tests

## Sync Generated Tests To External Playwright Suite

Use this when your testers run a separate Playwright repository/folder.

1. Generate tests in this repo as usual.
2. Sync generated tests into the external suite folder.
3. Testers run and commit from that external folder (which can have its own CI/CD pipeline).

Basic sync:

SYNC_TARGET_DIR=../playwright-manual-suite npm run sync:tester-suite

Run with the dedicated agent:

SYNC_TARGET_DIR=../playwright-manual-suite npm run agent:sync-suite

Set once in `.env` (recommended):

SYNC_TARGET_DIR=/Users/sailaja.pinisetty/ai-playwright-test-framework
SYNC_TARGET_SUBDIR=generated_tests

Then you can run without passing the path each time:

npm run agent:sync-suite

Optional controls:

- SYNC_TARGET_SUBDIR: destination subfolder inside target repo (default: generated_tests)
- SYNC_CLEAN_TARGET: remove destination folder before copy (true/false)
- SYNC_INCLUDE_SELECTION_FILES: include manual-case and selection metadata files (true/false, default: true)

Examples:

SYNC_TARGET_DIR=../playwright-manual-suite SYNC_TARGET_SUBDIR=tests/generated npm run sync:tester-suite

SYNC_TARGET_DIR=../playwright-manual-suite npm run sync:tester-suite:clean

After sync, in the external Playwright repo, testers can run:

npx playwright test tests/generated

Then commit and push there to trigger that repo's CI/CD.

### Auto-run Sync Agent After Generation

Enable the sync agent in the main flow so every generation run also syncs to the tester suite:

SYNC_AGENT_ENABLED=true SYNC_TARGET_DIR=../playwright-manual-suite npm run start:cli

### Sync Agent Git Automation

Use these environment variables with `npm run agent:sync-suite` (or with `npm run start:cli` when `SYNC_AGENT_ENABLED=true`):

- SYNC_GIT_AUTO_COMMIT=true: stage synced files and create a commit in the external tester repo
- SYNC_GIT_COMMIT_MESSAGE="chore(tests): sync generated suite": optional custom commit message
- SYNC_GIT_AUTO_PUSH=true: push the new commit to origin (requires SYNC_GIT_AUTO_COMMIT=true)
- SYNC_GIT_PUSH_BRANCH=main: optional destination branch for push (defaults to current branch in tester repo)
- SYNC_GIT_CREATE_PR=true: safe mode, pushes to a dedicated PR branch and opens PR when possible
- SYNC_GIT_PR_BASE_BRANCH=main: base branch for PR mode (default: main)
- SYNC_GIT_PR_BRANCH=sync/generated-tests/my-branch: optional explicit PR head branch name
- SYNC_GIT_PR_TITLE="chore(tests): sync generated suite": optional PR title
- SYNC_GIT_PR_BODY="...": optional PR body

Example:

SYNC_TARGET_DIR=../playwright-manual-suite SYNC_GIT_AUTO_COMMIT=true SYNC_GIT_AUTO_PUSH=true SYNC_GIT_PUSH_BRANCH=main npm run agent:sync-suite

Safe PR mode example:

SYNC_TARGET_DIR=../playwright-manual-suite SYNC_GIT_AUTO_COMMIT=true SYNC_GIT_AUTO_PUSH=true SYNC_GIT_CREATE_PR=true SYNC_GIT_PR_BASE_BRANCH=main npm run agent:sync-suite

Notes for PR mode:

- The agent creates/switches to a sync branch in the tester repo, commits, pushes, and then returns to the previous branch.
- If GitHub CLI (`gh`) is installed and authenticated, it creates the PR automatically.
- If `gh` is unavailable, the agent prints a compare URL you can open to create the PR manually.

### Branch-Based Destination Mapping

You can route generated tests into different target subfolders based on source branch:

- SYNC_TARGET_SUBDIR_MAP as JSON object
- Exact match key: "main"
- Prefix wildcard key: "feature/*"
- Optional fallback key: "default"

Example:

SYNC_TARGET_DIR=../playwright-manual-suite SYNC_TARGET_SUBDIR_MAP='{"main":"tests/release","feature/*":"tests/dev","default":"tests/generated"}' npm run agent:sync-suite

If `SYNC_TARGET_SUBDIR` is explicitly set, it takes precedence over `SYNC_TARGET_SUBDIR_MAP`.

When prompted:
- Type a user story and press Enter to run that one story.
- Or just press Enter to load all user stories from user-stories/*.txt and generate separate tests for each file.
- If a user story already has matching generated tests, the framework skips duplicates and only adds a new test when it finds an additional unique scenario.
- Set AGENT_MODE=true to enable autonomous retries per selected manual test case.
- Keep SELF_HEALING_ENABLED=true to let the agent update the same generated script and rerun after failures.

## Output Artifacts

- generated_tests/user_story_<n>-<story-id>/manual-test-cases*.json
- generated_tests/user_story_<n>-<story-id>/manual-test-cases*.md
- generated_tests/user_story_<n>-<story-id>/automation-selection*.json
- generated_tests/user_story_<n>-<story-id>/multi-agent-summary.json
- generated_tests/user_story_<n>-<story-id>/multi-agent-history.json
- generated_tests/user_story_<n>-<story-id>/multi-agent-dashboard.md
- generated_tests/user_story_<n>-<story-id>/test-cases/<case-id>/*.spec.js
- generated_tests/user_story_<n>-<story-id>/screenshots/<case-id>/final-ui-*.png
- report-ui/index.html
- report-ui/data/report-data.json
- artifacts/validation-result.json
- playwright-report/index.html
- test-results/*.png

## Presentation Script (Short)

1. Start with the goal statement.
2. Enter a plain-English user story.
3. Show generated Playwright script.
4. Run test and show screenshot.
5. Show Claude validation JSON (PASS/FAIL + reasons).
6. Close with the pipeline flow.

## Notes

- The generated selectors depend on user story detail and target website consistency.
- For real projects, add guardrails such as selector maps, domain constraints, and retry logic.

## Configuration

Environment variables are loaded from .env.

- ANTHROPIC_API_KEY: Required. Claude API key used for text and vision requests.
- CLAUDE_MODEL: Optional. Claude model name. Default is claude-3-5-sonnet-latest.
- APP_URL: Optional. Default site URL used when a plan does not provide one. Must be a valid http/https URL.
- DEFAULT_TIMEOUT_MS: Optional. Global Playwright test timeout in milliseconds. Must be a non-negative integer.
- NAVIGATION_TIMEOUT_MS: Optional. Playwright navigation timeout in milliseconds. Must be a non-negative integer.
- RETRY_COUNT: Optional. Number of Playwright retries for failed tests. Must be a non-negative integer.
- SCREENSHOT_ON_FAILURE: Optional. Controls Playwright failure screenshots. Accepted values: true/false, 1/0, yes/no, on/off.
- MAX_AUTOMATED_CASES: Optional. Maximum number of automatable test cases to convert into Playwright scripts per story.
- AGENT_MODE: Optional. Enables minimal agent loop per selected test case (generate -> run -> refine until pass or attempts exhausted).
- AGENT_MAX_ATTEMPTS: Optional. Maximum number of agent retries per selected manual test case.
- SELF_HEALING_ENABLED: Optional. When enabled, failed agent attempts update the script in place using failure feedback and rerun it.

## Test Intelligence

- Checks existing generated tests before creating new scripts.
- Performs deduplication based on scenario similarity.
- Evaluates coverage of automatable scenarios and identifies gaps.
- Generates only missing scenarios.
- Uses prior failures and improvement hints to continuously improve test quality.

## Report UI

- Open a local dashboard for test cases, automation run results, coverage, screenshots, and improvement suggestions with `npm run ui`.
- The UI reads normalized data from `report-ui/data/report-data.json`.
- The data file is rebuilt automatically at the end of framework runs.
- Dashboard includes: total tests, manual tests, automated tests, automated run passed/failed, per-story coverage, and overall coverage across all user stories.
- Failed tests are clickable in the dashboard to view failure cause and debug command guidance.

### Run Tests From UI

- Enter application URL in the main page.
- Optionally enable `Save as default URL` to persist the URL to `.env` as `APP_URL`.
- Upload a `.txt` user story file or paste story text.
- Click `Run Tests` to execute the full flow.
- After completion, click `Show Report`.
- Use `Back To Main` to return and run again.
- Run history is stored in `report-ui/data/ui-run-history.json` and shown in the main page history panel.
