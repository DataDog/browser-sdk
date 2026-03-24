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
2. Run only your tests by temporarily replacing `describe(...)` with `fdescribe(...)` or `it(...)` with `fit(...)`.
3. Run `yarn test` in the project root. It will launch the tests in watch mode, and also expose [a local URL](http://localhost:9876/) that you can open in any browser.
4. Look at your terminal to see your test results.
5. For deeper investigation, open [the "debug" page](http://localhost:9876/debug.html#) to inspect test execution via the devtools.

## Debug flaky unit tests

Top-level `describe` blocks are run in a random order. Sometimes, an issue can only be reproduced with a given order. To reproduce a test run order:

1. Check the `Randomized with seed XXXX` message from the test output.
2. Run `yarn test:unit --seed XXXX`.

## Work with E2E tests

See `test/e2e/AGENTS.md` for the full E2E testing guide (setup, writing tests, createTest builder, IntakeRegistry, best practices).

Quick commands:

- `yarn test:e2e:init` — first-time setup
- `yarn test:e2e` — run all E2E tests
- `yarn test:e2e -g "pattern"` — filter by name
- `yarn test:e2e --ui` — Playwright UI mode

## Run tests in browserstack

- `BS_USERNAME=<username> BS_ACCESS_KEY=<access_key> yarn test:unit:bs` - unit tests
- `BS_USERNAME=<username> BS_ACCESS_KEY=<access_key> yarn test:e2e:bs` - e2e tests
