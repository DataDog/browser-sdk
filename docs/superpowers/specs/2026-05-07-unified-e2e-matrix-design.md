# Unified E2E Matrix Design

Date: 2026-05-07
Branch: `thomas.lebeau/e2e-matrix` (off `thomas.lebeau/no-bs`)

## Goal

Replace the three current GitLab CI e2e jobs (`e2e`, `e2e-pinned`, `e2e-bs`) with a single matrix-parallelized `e2e` job covering all six browser configurations. Roughly halve the longest-pole wall-clock time (~20m → ~14m) and remove the BrowserStack dependency entirely.

## Current state

- `e2e` runs `playwright.local.config.ts` against four projects (chromium, firefox, webkit, android-via-Pixel-7). Median 12m25s, 41% setup / 59% Playwright run.
- `e2e-pinned` runs `playwright.pinned.config.ts` against firefox-pinned (FF 119 via Playwright 1.40.1) and webkit-pinned (WK 17.4 via Playwright 1.40.1). Median ~20m wall-clock, 22% setup / 78% Playwright run. WebKit dominates the runtime tail.
- `e2e-bs` runs the same FF 119 + WK 17.4 + Edge 100 matrix on BrowserStack via `playwright.bs.config.ts`.
- The pinned setup uses a translation proxy (`test/e2e/scripts/pinnedProxy.ts`) so the current 1.58 client can talk to the older 1.40 server. This stays.

## Design

### Single Playwright config

Replace `playwright.local.config.ts` and `playwright.pinned.config.ts` with one `test/e2e/playwright.config.ts` that defines all six projects:

```ts
projects: [
  { name: 'chromium',       use: devices['Desktop Chrome']  },
  { name: 'firefox',        use: devices['Desktop Firefox'] },
  { name: 'webkit',         use: devices['Desktop Safari']  },
  { name: 'android',        use: devices['Pixel 7']         },
  { name: 'firefox-pinned', use: { ...devices['Desktop Firefox'], connectOptions: { wsEndpoint: PINNED_WS } } },
  { name: 'webkit-pinned',  use: { ...devices['Desktop Safari'],  connectOptions: { wsEndpoint: PINNED_WS } } },
]
```

The pinned `playwright run-server` + `pinnedProxy` web servers are conditionally added to `webServer[]` based on `process.env.PW_BROWSER` ending with `-pinned`. This avoids paying the pinned-server boot cost (~10s) when running non-pinned browsers.

Locally, `yarn test:e2e` (no env var) runs the four current-version projects exactly as today. `PW_BROWSER=firefox-pinned yarn test:e2e --project=firefox-pinned` runs the pinned Firefox.

Delete `playwright.bs.config.ts` and `test/e2e/browsers.conf.js`.

### JUnit filename per matrix cell

`playwright.base.config.ts:12` currently writes a fixed `results.xml`. Change to include `process.env.PW_BROWSER` (e.g. `results-firefox-pinned.xml`) so the 6 matrix cells produce non-colliding filenames inside the same `test-report/e2e/` folder. `scripts/test/export-test-result.ts` already uploads every XML in the folder to Datadog CI Visibility.

### GitLab CI

Two new jobs replace `e2e`, `e2e-pinned`, and `e2e-bs`:

```yaml
e2e-build:
  stage: test
  extends: [.base-configuration, .test-allowed-branches]
  interruptible: true
  script:
    - yarn
    - yarn build && yarn build:apps
  artifacts:
    paths:
      - packages/*/bundle
      - test/apps/*/dist
    expire_in: 1 day

e2e:
  stage: test
  needs: [e2e-build]
  extends: [.base-configuration, .test-allowed-branches, .resource-allocation-4-cpus]
  interruptible: true
  parallel:
    matrix:
      - BROWSER: [chromium, firefox, webkit, android, firefox-pinned, webkit-pinned]
  artifacts:
    when: always
    reports:
      junit: test-report/e2e/*.xml
  script:
    - yarn
    - FORCE_COLOR=1 PW_BROWSER=$BROWSER yarn playwright test --config test/e2e/playwright.config.ts --project=$BROWSER
  after_script:
    - node ./scripts/test/export-test-result.ts e2e
```

Notes:
- `yarn` in the `e2e` job hits the existing `.yarn/cache` so install is fast (~13s).
- `e2e-build` produces the SDK bundles and built test apps as artifacts; the matrix cells download those and skip the build step.
- All six matrix cells use the same `.resource-allocation-4-cpus`. Can right-size later.
- The Edge 100 coverage from `e2e-bs` is dropped (Edge is Chromium-based; covered by `chromium`).

### Yarn scripts

- `test:e2e` keeps its current behavior (runs the 4 current-version projects locally).
- `test:e2e:ci` is removed; CI runs `playwright test ... --project=$BROWSER` directly.
- `test:e2e:pinned` is removed. `test:e2e:pinned:init` is folded into `test:e2e:init` so a single `yarn test:e2e:init` installs both current and pinned (1.40.1) browser binaries.
- `test:e2e:bs` is deleted along with the bs-wrapper script reference.

### Files changed

- New: `test/e2e/playwright.config.ts` (consolidated)
- New: `docs/superpowers/specs/2026-05-07-unified-e2e-matrix-design.md` (this file)
- Modified: `test/e2e/playwright.base.config.ts` (dynamic junit filename)
- Modified: `.gitlab-ci.yml` (new e2e-build + e2e matrix jobs, drop e2e-pinned + e2e-bs)
- Modified: `package.json` (script cleanup)
- Modified: `Dockerfile` (no change — pinned binaries already pre-installed)
- Deleted: `test/e2e/playwright.local.config.ts`
- Deleted: `test/e2e/playwright.pinned.config.ts`
- Deleted: `test/e2e/playwright.bs.config.ts`
- Deleted: `test/e2e/browsers.conf.js`
- Deleted: `scripts/test/bs-wrapper.ts` (and any `ci-bs.ts` wiring)

### Estimated impact

| | Today | After |
|---|---|---|
| `e2e` wall-clock | 12m | folded into matrix |
| `e2e-pinned` wall-clock | 20m | folded into matrix |
| `e2e-bs` wall-clock | varies (BS) | removed |
| **Combined wall-clock (longest pole)** | ~20m | **~14m** |
| Cumulative compute | baseline | similar (build shared, tests split) |

## Out of scope

- Within-browser sharding (`SHARD` axis). Could be added if `webkit-pinned` remains the long pole after this change.
- Replacing `pinnedProxy.ts` translation layer.
- Eliminating BrowserStack from any other job (only `e2e-bs` is being removed).
- Restoring Edge coverage.

## Risks

1. **`webServer` env-gating** is fragile if any test invocation forgets to set `PW_BROWSER`. Mitigation: the config derives `PW_BROWSER` from the `--project` argv when the env var is absent, so `playwright test --project=firefox-pinned` alone is sufficient to boot the pinned servers.
2. **Build artifact size** — `packages/*/bundle` + `test/apps/*/dist` may be large enough to slow artifact upload/download. Verify in first pipeline run; if problematic, switch to GitLab cache or DAG-only artifacts.
3. **Resource pressure** — 6 parallel cells × 4 CPUs each is more concurrent runner usage than today's two jobs. If runners are constrained, reduce per-cell CPU or stagger via `parallel: 3` per browser group.
4. **Pinned binaries in CI image** — Dockerfile currently pre-installs Playwright 1.40.1 binaries. No change, but worth verifying the matrix cells find them.

## Verification plan

1. Local: `yarn test:e2e` runs all four current-version projects with no env var.
2. Local: `PW_BROWSER=firefox-pinned yarn playwright test --config test/e2e/playwright.config.ts --project=firefox-pinned` boots the pinned proxy and runs FF 119.
3. CI: push branch, trigger pipeline via GitLab MCP, confirm `e2e-build` runs first, then 6 `e2e` matrix cells start in parallel and produce per-browser junit artifacts.
4. CI Visibility: confirm `@ci.job.name:e2e` events show all 6 browsers and tests are correctly attributed.
