---
name: running-tests
description: Use when running tests or checks in browser-sdk, including unit (Karma/Jasmine), E2E (Playwright), script tests, TypeScript/SSR compatibility, performance benchmarks, or BrowserStack. Use when choosing a yarn test command, reproducing a flaky seed, or targeting a spec, a browser, or a pinned old browser.
---

# Running Tests in browser-sdk

## Overview

All test entry points are root `yarn` scripts. Unit tests compile from source. Locally, E2E tests only run the `bundle` setup, which loads SDK bundles compiled from source by the dev server. Tests using `npmSetup` or a built test app (`withApp`, extensions, Next.js, Vue, Nuxt) and the performance scenarios **don't see a source change until you run `yarn build:apps`**. When unsure, run it. In CI, tests without an explicit setup run on `async`, `npm` and `bundle`, using built packages.

## Quick Reference

| Need                                                                                             | Command                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Unit, watch mode (`localhost:9876`, `/debug.html` for devtools)                                  | `yarn test`                                                                                |
| Unit, single run                                                                                 | `yarn test:unit`                                                                           |
| Specific specs (repeatable, quoted globs OK, also works with `yarn test`)                        | `yarn test:unit --spec 'packages/browser-rum-core/src/domain/view/**/*.spec.ts'`           |
| Reproduce a CI order (`Randomized with seed 41027`)                                              | `yarn test:unit --seed 41027`                                                              |
| Unit on BrowserStack (`BS_USERNAME`/`BS_ACCESS_KEY` in env or `.env`)                            | `yarn test:unit:bs`                                                                        |
| Script tests (`scripts/**/*.spec.ts`)                                                            | `yarn test:script`                                                                         |
| One script spec (`yarn test:script <file>` still runs all of them)                               | `node --test --experimental-test-module-mocks scripts/lib/foo.spec.ts`                     |
| E2E (local default: chromium only)                                                               | `yarn test:e2e`                                                                            |
| E2E filtered (`-g` matches file names and test titles)                                           | `yarn test:e2e -g "unhandled rejections"`                                                  |
| E2E on other browsers                                                                            | `yarn test:e2e --project=chromium --project=firefox --project=webkit`                      |
| E2E on pinned old browsers (Chrome 120, Firefox 119, WebKit 17.4)                                | `yarn test:e2e --project=chromium-pinned --project=firefox-pinned --project=webkit-pinned` |
| E2E interactive                                                                                  | `yarn test:e2e --ui`                                                                       |
| TypeScript compatibility (3.8.2, 4.1.6, latest, `isolatedModules`, `exactOptionalPropertyTypes`) | `yarn test:compat:tsc`                                                                     |
| SSR compatibility (imports the SDK in Node, catches top-level `window` access)                   | `yarn test:compat:ssr`                                                                     |
| Performance benchmarks (CI repeats each scenario 15x)                                            | `yarn test:performance` (or `:debug`, `:ui`)                                               |

## Rebuild Before E2E and Performance

```bash
yarn build:apps               # packs every package (prepack runs yarn build), then builds every test app
yarn build:apps --app vanilla # still packs every package, only rebuilds the vanilla app
```

Performance tests serve the `react-heavy-spa` and `react-shopist-like` apps. Both compat checks pack everything themselves, so they need no rebuild (but they're slow).

One-time setup: `yarn test:e2e:setup` for E2E, plus `yarn test:e2e:setup:pinned` for the `*-pinned` projects.

## Common Mistakes

| Mistake                                                                       | Fix                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Running `npmSetup`/app-based E2E or perf tests right after editing SDK source | `yarn build:apps` first, otherwise they use stale packages                                                    |
| E2E passes locally, fails in CI on `<test> > npm`                             | Locally only `bundle` runs. Temporarily add `.withSetup(npmSetup)` to the test, run `yarn build:apps`, re-run |
| Expecting `yarn test:e2e` to cover all browsers                               | Locally only chromium runs unless you pass `--project`                                                        |
| `*-pinned` projects fail on missing browsers                                  | `yarn test:e2e:setup:pinned` once                                                                             |
| Leaving `fit`/`fdescribe` in a spec                                           | `yarn lint` fails (`jasmine/no-focused-tests`). `test.only` fails E2E in CI (`forbidOnly`)                    |
| Passing a path to `yarn test:script`                                          | Run `node --test` on the file directly                                                                        |
