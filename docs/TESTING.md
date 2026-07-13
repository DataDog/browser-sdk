# Testing

## Test my change on my local environment

1. Run `yarn dev`
2. Open [http://localhost:8080](http://localhost:8080/) in your browser. The [sandbox folder](https://github.com/DataDog/browser-sdk/tree/master/sandbox) is served, with a minimal browser SDK setup.
3. You can use global API via the devtools (see below) or locally modify [index.html](https://github.com/DataDog/browser-sdk/blob/master/sandbox/index.html) to experiment things.

## Test my change using Claude Code agent

We have a `/manual-testing` skill ([source](https://github.com/DataDog/browser-sdk/blob/main/.claude/skills/manual-testing/SKILL.md)) to help you test your changes using the dev-server sandbox and [agent-browser](https://agent-browser.dev/). This skill should be able to generate the test instructions for your PR.

## Test my change on remote environments that use the Browser SDK bundles via CDN

Use this strategy to test the integration on Real applications.

1. Install the [developer extension](https://github.com/DataDog/browser-sdk/tree/master/developer-extension)
2. Run `yarn dev`
3. Open the Chrome DevTools browser SDK panel and check "Use dev bundles".

## Work with unit tests

1. Write a unit test.
2. Run the spec directly with `yarn test:unit --spec packages/path/to/feature.spec.ts`.
3. Use `it.only(...)` or `describe.only(...)` temporarily when you need to focus further. ESLint prevents focused tests from being checked in.
4. Run `yarn test` for Vitest watch mode, or `yarn test:unit` for a single full run.
5. Look at the terminal output; failure screenshots are written next to the failing spec under `__screenshots__`.

## Debug flaky unit tests

Top-level `describe` blocks are run in a random order. Sometimes, an issue can only be reproduced with a given order. To reproduce a test run order:

1. Check the `Running tests with seed "XXXX"` message from the test output.
2. Run `yarn test:unit --seed XXXX`.

## Work with E2E tests

See `test/e2e/AGENTS.md` for the full E2E testing guide (setup, writing tests, createTest builder, IntakeRegistry, best practices).

Quick commands:

- `yarn test:e2e:setup` — first-time setup (builds packages and apps, then installs browsers for the workspace Playwright version)
- `yarn test:e2e:setup:pinned` — optional; installs Chromium, Firefox, and WebKit for Playwright **1.40.1** (required to run the `firefox-pinned` and `webkit-pinned` projects; run after the usual setup when you need those projects locally)
- `yarn test:e2e` — run all E2E tests
- `yarn test:e2e -g "pattern"` — filter by name
- `yarn test:e2e --ui` — Playwright UI mode

## Run tests against pinned browsers

The `firefox-pinned` (FF 119) and `webkit-pinned` (WK 17.4) Playwright projects replicate
the old BrowserStack matrix locally via a pinned Playwright 1.40.1 `run-server` and a
translation proxy. Run them with:

- `yarn test:e2e --project=firefox-pinned`
- `yarn test:e2e --project=webkit-pinned`

If those projects fail because browsers are missing, run `yarn test:e2e:setup:pinned` once so the Playwright 1.40.1 browser binaries are installed alongside the default setup.

## Run unit tests in BrowserStack

- `BS_USERNAME=<username> BS_ACCESS_KEY=<access_key> yarn test:unit:bs`
