import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { generateTestPlan } from './generator/stepGenerator.js';
import { buildPlaywrightScript } from './generator/scriptBuilder.js';
import { runGeneratedTest } from './runner/runGeneratedTest.js';
import { validateFinalUI } from './validator/uiValidator.js';

function askUserStory() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter plain English test scenario: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function ensureArtifacts() {
  await fs.mkdir(path.resolve(process.cwd(), 'artifacts'), { recursive: true });
  await fs.mkdir(path.resolve(process.cwd(), 'test-results'), { recursive: true });
}

function toSafeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'story';
}

function extractStoryNumber(sourceName, fallbackNumber) {
  const match = String(sourceName || '').match(/(\d+)/);
  return match ? Number(match[1]) : fallbackNumber;
}

function toShortDescription(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('_') || 'scenario';
}

async function getExistingStoryTests(storyNumber) {
  const generatedDir = path.resolve(process.cwd(), 'generated_tests');
  const prefix = `user_story_${storyNumber}_`;

  let entries = [];
  try {
    entries = await fs.readdir(generatedDir, { withFileTypes: true });
  } catch {
    return { slugs: new Set(), descriptions: [] };
  }

  const names = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.spec.js'))
    .map((entry) => entry.name);

  const slugs = new Set(names.map((name) => name.slice(prefix.length, -'.spec.js'.length)));
  const descriptions = [...slugs].map((slug) => slug.replace(/_/g, ' '));
  return { slugs, descriptions };
}

async function loadUserStoriesFromDirectory() {
  const storiesDir = path.resolve(process.cwd(), 'user-stories');
  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  const txtFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (txtFiles.length === 0) {
    throw new Error('No .txt user stories found in user-stories directory.');
  }

  const stories = [];
  for (const fileName of txtFiles) {
    const filePath = path.join(storiesDir, fileName);
    const story = (await fs.readFile(filePath, 'utf8')).trim();
    if (!story) {
      console.log(`Skipping empty user story file: ${fileName}`);
      continue;
    }

    stories.push({
      id: toSafeId(path.parse(fileName).name),
      source: fileName,
      userStory: story
    });
  }

  if (stories.length === 0) {
    throw new Error('All .txt files in user-stories are empty.');
  }

  console.log(`No input provided. Loaded ${stories.length} user story file(s) from user-stories.`);
  return stories;
}

async function main() {
  await ensureArtifacts();

  const inputStory = await askUserStory();
  const stories = inputStory
    ? [{ id: 'cli-input', source: 'CLI input', userStory: inputStory }]
    : await loadUserStoriesFromDirectory();

  let generatedCount = 0;

  for (let i = 0; i < stories.length; i += 1) {
    const storyEntry = stories[i];
    const isSingle = stories.length === 1;
    const planFileName = isSingle
      ? 'generated-plan.json'
      : `generated-plan-${storyEntry.id}.json`;
    const storyNumber = extractStoryNumber(storyEntry.source, i + 1);
    const existingTests = await getExistingStoryTests(storyNumber);

    console.log(`\n1.${i + 1}) Sending user story to Claude for test step generation (${storyEntry.source})...`);
    const plan = await generateTestPlan(storyEntry.userStory, {
      existingTestDescriptions: existingTests.descriptions
    });
    if (plan.status === 'NO_NEW_TEST') {
      console.log(`Skipping ${storyEntry.source}: ${plan.reason || 'No additional unique test.'}`);
      continue;
    }

    const shortDescription = toShortDescription(plan.title);
    if (existingTests.slugs.has(shortDescription)) {
      console.log(`Skipping duplicate for ${storyEntry.source}: user_story_${storyNumber}_${shortDescription}.spec.js already exists.`);
      continue;
    }

    await fs.writeFile(path.join('artifacts', planFileName), JSON.stringify(plan, null, 2));
    console.log(`Generated test plan saved to artifacts/${planFileName}`);

    console.log(`\n2.${i + 1}) Building Playwright script from generated steps...`);
    const fileNameHint = `user_story_${storyNumber}_${shortDescription}`;
    const resultNameBase = `user_story_${storyNumber}_${shortDescription}`;
    const screenshotPath = isSingle
      ? 'artifacts/final-ui.png'
      : `artifacts/final-ui-${storyEntry.id}.png`;
    const scriptPath = await buildPlaywrightScript(plan, {
      fileNameHint,
      resultNameBase,
      screenshotPath
    });
    generatedCount += 1;
    console.log(`Generated script: ${scriptPath}`);
  }

  if (generatedCount === 0) {
    console.log('\nNo new unique tests were generated. Existing tests are already covering these stories.');
  }

  console.log('\n3) Running Playwright test...');
  const runResult = await runGeneratedTest();
  console.log(`Playwright result: ${runResult.passed ? 'PASS' : 'FAIL'} (code ${runResult.code})`);

  if (stories.length === 1 && runResult.passed) {
    console.log('\n4) Sending final screenshot to Claude for UI validation...');
    const validationPlan = JSON.parse(await fs.readFile('artifacts/generated-plan.json', 'utf8'));
    const validation = await validateFinalUI({ userStory: stories[0].userStory, plan: validationPlan });
    await fs.writeFile('artifacts/validation-result.json', validation);
    console.log('Validation result saved to artifacts/validation-result.json');
  } else if (stories.length === 1) {
    console.log('\n4) Skipping Claude UI validation because Playwright test failed.');
    const failedValidation = JSON.stringify({
      status: 'FAIL',
      confidence: 100,
      summary: 'UI validation skipped because Playwright execution failed before final screenshot was captured.',
      checks: []
    }, null, 2);
    await fs.writeFile('artifacts/validation-result.json', failedValidation);
    console.log('Failure summary saved to artifacts/validation-result.json');
  } else {
    console.log('\n4) Skipping Claude UI validation for multi-story batch mode.');
    console.log('Each generated test captured its own final screenshot in artifacts/final-ui-<story>.png');
  }

  console.log('\nFlow complete: User Story -> Claude -> Steps -> Playwright -> Screenshot -> Claude -> Validation');
}

main().catch((err) => {
  console.error('\nExecution failed:', err.message);
  process.exit(1);
});
