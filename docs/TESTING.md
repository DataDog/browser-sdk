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
2. Temporarily set it as a `seed: XXXX` property in the [jasmine configuration](https://github.com/DataDog/browser-sdk/blob/c876a52fd91e4492d8842c135875fb6c197234b4/test/unit/karma.base.conf.js#L19):

```js
module.exports = {
  // ...,
  client: {
    jasmine: {
      // ...,
      seed: 80413,
    },
  },
}
```

1. Run `yarn test`.

## Work with E2E tests

E2E tests are run via [Playwright](https://playwright.dev/docs/test-configuration).

**Most useful commands:**

- `yarn test:e2e --ui` — run Playwright locally in [UI mode](https://playwright.dev/docs/test-ui-mode)
- `yarn test:e2e -g "unhandled rejections"` — run tests whose names match _"unhandled rejections"_
- `yarn test:e2e --debug` — run Playwright in [debug mode](https://playwright.dev/docs/debug#run-in-debug-mode-1)
- `yarn test:e2e --project firefox` — run tests in Firefox. Other options: `chromium` (default), `firefox`, `webkit`, `android`, `*` (all)
- `yarn test:e2e --repeat-each 3` — run each test 3 times, useful for catching flaky tests
- `BS_USERNAME=<username> BS_ACCESS_KEY=<access_key> yarn test:e2e:bs` — run the tests in [Browserstack](https://www.browserstack.com/accounts/profile/details)

> `yarn test:e2e` does not build the SDK automatically. Run `yarn build:bundle` if you have made changes to the SDK source code.

**Tips:**

- `expect([1, 2, 3]).toHaveLength(3)` shows a better error message when failing, including the actual array content.
- `await page.pause()` to use with `--debug`.
