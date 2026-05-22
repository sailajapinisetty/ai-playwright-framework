# Playwright Test Framework Folder

This folder is the single place for framework-level Playwright testing assets.

## Structure

- `framework/pom/basePage.js`: shared locator resolution and fallback strategy.
- `framework/pom/appPage.js`: app-level actions/assertions used by generated tests.
- `framework/fixtures/testFixtures.js`: shared Playwright fixture exports (`test`, `expect`, `app`).

## Why this folder exists

This keeps framework code separate from AI orchestration code in `src/` and makes it easier to explain the project architecture.

## How generated tests use it

Generated specs import fixture helpers from this folder via a relative import produced by the script builder.

Example:

```js
import { test } from '../../playwright-tests/framework/fixtures/testFixtures.js';
```
