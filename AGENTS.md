# Datadog Browser SDK

Browser SDK for collecting Real User Monitoring (RUM) and logging data from web applications.

## Package Manager

This project uses Yarn workspaces (v4.12.0). Never use `npm` or `npx`.

## Key Commands

```bash
yarn dev                  # Development server
yarn build                # Build all packages
yarn build:apps           # Build test apps (for E2E and performance testing)
yarn typecheck            # Type checking
yarn lint                 # Linting
yarn format               # Format code

# Unit tests (Jasmine + Karma)
yarn test:unit                                                      # Run all unit tests
yarn test:unit --spec packages/core/src/browser/addEventListener.spec.ts  # Run single file
yarn test:unit --spec "packages/**/addEventListener.spec.ts"        # Pattern match
yarn test:unit --seed 123                                           # Reproduce flaky test

# E2E tests (Playwright)
yarn test:e2e:init        # Install Playwright and build test apps
yarn test:e2e             # Run all E2E tests
yarn test:e2e -g "unhandled rejections"  # Filter by name
```

## Monorepo Structure

```
packages/
├── core/           # Shared utilities (Observable, configuration, transport)
├── rum-core/       # Core RUM functionality
├── rum/            # Full RUM package
├── rum-slim/       # Lightweight RUM
├── rum-react/      # React integration
├── logs/           # Browser logging
└── worker/         # Web Worker support

developer-extension/ # Chrome DevTools extension

test/
├── apps/            # Test apps for E2E and performance testing
├── e2e/             # Playwright E2E test scenarios
├── performance/     # Performance benchmarking tests
└── unit/            # Karma/Jasmine unit test configuration

scripts/             # Build, deploy, release automation
```

## Code Style

### Formatting (Prettier)

`singleQuote: true`, `semi: false`, `printWidth: 120`, `trailingComma: 'es5'`, `tabWidth: 2`

### TypeScript

- **No classes** — use plain functions and closures instead (enforced by lint)
- **No default exports** — named exports only
- **`interface` for object shapes** — not `type` aliases (enforced by `@typescript-eslint/consistent-type-definitions`)
- **Separate `import type`** — type-only imports must use `import type { ... }` on their own line
- **Import order**: builtin → external → internal → parent → sibling → index (enforced by `eslint-plugin-import`)
- **Prefer TypeScript type narrowing** over runtime type assertions
- **Use discriminated unions** to make invalid states unrepresentable at compile time
- **`const` object maps** for enums: `export const ErrorSource = { AGENT: 'agent' } as const` + `export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource]`
- **`const enum`** for compile-time-only constants (zero bundle cost): `const enum ErrorHandling { HANDLED = 'handled' }`
- **`camelCase`** for all internal variables and properties — snake_case only at the serialization boundary (event payload fields in `*Event.types.ts`)
- **Filenames**: `camelCase` in `src/`, `kebab-case` in `scripts/`
- **No `Date.now()`** — use `dateNow()` wrapper (mockable in tests)
- **No `console.*`** in package source code
- **No array spread** — use `.concat()` instead

### Imports (Cross-Package vs Within-Package)

```ts
// Cross-package: use package name
import type { TimeStamp } from '@datadog/browser-core'
import { addTelemetryUsage } from '@datadog/browser-core'

// Within-package: relative paths
import { createTaskQueue } from '../../tools/taskQueue'
```

### Error Handling

- **`monitor(fn)`** — wraps a function; catches any throw and routes to telemetry. Use for all public API methods.
- **`callMonitored(fn)`** — one-off call with error capture; use when a return value is needed.
- **`catchUserErrors(fn)`** — wraps user-provided callbacks only (keeps user errors separate from SDK errors).
- **No `try/catch` in domain code** — domain functions propagate errors via `undefined` returns or discriminated unions.
- Errors are represented as plain `RawError` data objects, not `Error` subclasses.

### Lifecycle / Cleanup Pattern

Modules return `{ stop }` and collect teardown work in a local array:

```ts
const cleanupTasks: Array<() => void> = []
const sub = someObservable.subscribe(handler)
cleanupTasks.push(() => sub.unsubscribe())
const { stop: stopChild } = startChildModule(...)
cleanupTasks.push(stopChild)
return { stop: () => cleanupTasks.forEach((task) => task()) }
```

### Observables

Custom `Observable<T>` (not RxJS). Constructor accepts an optional `onFirstSubscribe` callback that can return a teardown function. Use `BufferedObservable<T>` to replay buffered events to late subscribers.

### Mockable Pattern

Wrap values/functions with `mockable()` in source to enable test substitution without DI:

```ts
// source
const result = mockable(startRum)(configuration, ...)
const url = mockable(location).href

// test
replaceMockable(startRum, fakeStartRum)  // auto-cleaned up after each test
```

### Feature Flags

```ts
if (isExperimentalFeatureEnabled(ExperimentalFeature.SOME_FLAG)) { ... }
```

`ExperimentalFeature` is a real (non-const) enum — required for runtime string validation.

### Auto-Generated Files

**Never manually edit** files with a `DO NOT MODIFY IT BY HAND` header (e.g., `telemetryEvent.types.ts`). Changes require a PR in the upstream schema repo first, then regeneration.

## Unit Tests

- **Test framework**: Jasmine + Karma
- **Co-location**: `feature.ts` → `feature.spec.ts` in the same directory
- **Focus/skip**: `fdescribe` / `fit` to focus; `xdescribe` / `xit` to skip
- **Cleanup**: use `registerCleanupTask(() => ...)` — never `afterEach()`
- **DOM helpers**: use `appendElement(html)` — never manually `createElement` + `appendChild`
- **Time**: use `mockClock()` + `clock.tick(ms)` — never real `setTimeout` delays
- **One behavior per test**: keep `it()` blocks focused on a single assertion
- **TDD**: write the spec file before the implementation file (RED → GREEN → REFACTOR)

## Commit Messages

Use gitmoji conventions:

| Emoji | Use case                                  |
| ----- | ----------------------------------------- |
| ✨    | New feature (public API, behavior, event) |
| 🐛    | Bug fix                                   |
| ⚡️    | Performance / bundle size                 |
| 💥    | Breaking change                           |
| ⚗️    | Experimental feature behind a flag        |
| ♻️    | Refactor                                  |
| ✅    | Tests                                     |
| 👷    | Build / CI / dependencies                 |
| 🔥    | Removal                                   |
| 🧹    | Cleanup                                   |
| 🔊    | Telemetry / debug logging                 |
| 📝    | Documentation                             |
| 🎨    | Code structure / formatting               |
| 🔧    | Configuration / project setup             |
| 🚨    | Linting rules                             |
| 👌    | Address code review feedback              |

## Git Workflow

- Branch naming: `<username>/<feature>` (e.g., `john.doe/fix-session-bug`)
- Always branch from `main` unless explicitly decided otherwise
- PR title follows commit message convention (used when squashing to main)
- PR template at `.github/PULL_REQUEST_TEMPLATE.md` — fill it out for all PRs
