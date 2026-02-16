# Coding Conventions

**Analysis Date:** 2026-02-16

## Naming Patterns

**Files:**
- Source files use **camelCase**: `sessionManager.ts`, `trackViews.ts`, `contextManager.ts`
- Enforced by ESLint rule `unicorn/filename-case` with `camelCase` option
- Scripts use **kebab-case**: `build-package.ts`, `check-typescript-compatibility.ts`
- Type definition files use suffix `.types.ts`: `error.types.ts`, `browser.types.ts`, `deflate.types.ts`
- Event type definition files use suffix `Event.types.ts`: `rawRumEvent.types.ts`, `rawTelemetryEvent.types.ts`
- Spec files are co-located with implementation: `feature.ts` -> `feature.spec.ts`
- Generic utility file names like `utils.ts` or `specHelper.ts` are **forbidden** (enforced by local ESLint rule `disallow-generic-utils`). Use domain-specific names instead: `timeUtils.ts`, `byteUtils.ts`, `stringUtils.ts`

**Functions:**
- Use **camelCase**: `createContextManager()`, `trackFirstContentfulPaint()`, `startSessionManager()`
- Factory functions use `create` prefix: `createBatch()`, `createValueHistory()`, `createFlushController()`
- Initialization functions use `start` prefix: `startSessionManager()`, `startTelemetry()`, `startErrorCollection()`
- Tracking functions use `track` prefix: `trackViews()`, `trackRuntimeError()`, `trackEventCounts()`
- Boolean-returning functions use `is`/`has`/`can` prefix: `isError()`, `isIntakeUrl()`, `canUseEventBridge()`

**Variables:**
- Use **camelCase**: `sessionStore`, `flushController`, `rawRumEvents`
- Constants use **UPPER_SNAKE_CASE**: `SESSION_TIME_OUT_DELAY`, `FCP_MAXIMUM_DELAY`, `BUFFER_LIMIT`
- Prefix unused parameters with `_`: `(_: any, __: string, descriptor: ...)`

**Types:**
- Interfaces and type aliases use **PascalCase**: `SessionManager`, `RawError`, `InitConfiguration`
- Generic type parameters use single uppercase letters: `T`, `E`, `K`
- Enum-like const objects use **PascalCase**: `ErrorSource`, `RumEventType`, `DefaultPrivacyLevel`

## Enum Pattern (Critical Convention)

**Never use plain TypeScript enums in production code.** Use `const enum` or the const-object-with-type pattern instead.

**Preferred pattern - Const object with derived type (for public API types):**
```typescript
// In source:
export const ErrorSource = {
  AGENT: 'agent',
  CONSOLE: 'console',
  CUSTOM: 'custom',
} as const

export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource]
```
This avoids emitting extra JavaScript for enums and makes values available at runtime.

**Const enum (for internal-only enums):**
```typescript
export const enum LifeCycleEventType {
  VIEW_CREATED,
  VIEW_UPDATED,
  SESSION_EXPIRED,
}
```
Use `const enum` when values are only used internally. Non-const enums are forbidden in production by ESLint rule `no-restricted-syntax`.

**Entry points must not export enums** (enforced by `disallow-enum-exports` local rule for `packages/{rum,logs,flagging,rum-slim}/src/entries/*.ts`).

**`isolatedModules` workaround:** When a `const enum` is used as interface keys, you must declare a companion `const` object with `declare`:
```typescript
// packages/rum-core/src/domain/lifeCycle.ts
export const enum LifeCycleEventType {
  VIEW_CREATED,
  VIEW_UPDATED,
}

// Workaround for isolatedModules: true
declare const LifeCycleEventTypeAsConst: {
  VIEW_CREATED: LifeCycleEventType.VIEW_CREATED
  VIEW_UPDATED: LifeCycleEventType.VIEW_UPDATED
}

export interface LifeCycleEventMap {
  [LifeCycleEventTypeAsConst.VIEW_CREATED]: ViewCreatedEvent
  [LifeCycleEventTypeAsConst.VIEW_UPDATED]: ViewEvent
}
```

## Code Style

**Formatting:**
- Tool: **Prettier** 3.8.1
- Config: `.prettierrc.yml`
- Key settings:
  - `printWidth: 120`
  - `semi: false` (no semicolons)
  - `singleQuote: true`
  - `tabWidth: 2`
  - `trailingComma: 'es5'`
  - `arrowParens: 'always'`
- Run: `yarn format`

**Linting:**
- Tool: **ESLint** 9 with flat config (`eslint.config.mjs`)
- Plugins: `typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-unicorn`, `eslint-plugin-jsdoc`, `eslint-plugin-jasmine`, and 13 custom local rules in `eslint-local-rules/`
- Run: `yarn lint`
- Key enforced rules:
  - `camelcase` enforced (except `_dd_temp_` property)
  - `curly` enforced (always use braces)
  - `eqeqeq: 'smart'` (use `===` except for null checks)
  - `no-bitwise` enforced
  - `no-eval` enforced
  - `object-shorthand` enforced
  - `prefer-template` enforced (template literals over concatenation)
  - `quotes: 'single'` with `avoidEscape`
  - `no-console` enforced in production source files
  - `arrow-body-style` enforced (use concise arrow bodies)
  - `one-var: 'never'` (one declaration per line)
  - `@typescript-eslint/no-explicit-any: 'off'` (any is allowed)
  - `@typescript-eslint/consistent-type-imports: 'error'` (use `import type`)
  - `@typescript-eslint/consistent-type-exports: 'error'`
  - `@typescript-eslint/consistent-type-definitions: ['error', 'interface']` (prefer `interface` over `type` for object types)
  - `@typescript-eslint/member-ordering` enforced (fields before constructors before methods, public before protected before private)
  - `import/no-default-export: 'error'` (named exports only, except webpack configs)
  - `import/no-cycle: 'error'`
  - `jasmine/no-focused-tests: 'error'` (no `fdescribe`/`fit` committed)

## Import Organization

**Order (enforced by `import/order`):**
1. Built-in modules (e.g., `node:path`)
2. External packages (e.g., `@datadog/browser-core`)
3. Internal (files from within a local package referenced by path alias, e.g., `@datadog/browser-core/test`)
4. Parent directory imports (e.g., `../../tools/display`)
5. Sibling imports (e.g., `./observable`)
6. Index imports

**Type imports must be separate (enforced by `@typescript-eslint/consistent-type-imports`):**
```typescript
// Correct:
import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, relativeNow, ONE_MINUTE } from '@datadog/browser-core'

// In production source files, prefer top-level type specifiers:
import type { Configuration } from '../configuration'
// Not: import { type Configuration } from '../configuration'
```

**Path Aliases (defined in `tsconfig.base.json`):**
- `@datadog/browser-core` -> `packages/core/src`
- `@datadog/browser-rum-core` -> `packages/rum-core/src`
- `@datadog/browser-rum` -> `packages/rum/src/entries/main`
- `@datadog/browser-rum/internal` -> `packages/rum/src/entries/internal`
- `@datadog/browser-rum-slim` -> `packages/rum-slim/src/entries/main`
- `@datadog/browser-logs` -> `packages/logs/src/entries/main`
- `@datadog/browser-rum-react` -> `packages/rum-react/src/entries/main`
- `@datadog/browser-worker` -> `packages/worker/src/entries/main`
- `@datadog/browser-flagging` -> `packages/flagging/src/entries/main`

**Test utilities are imported via package `/test` path:**
```typescript
import { registerCleanupTask, mockClock } from '@datadog/browser-core/test'
import { mockRumConfiguration, createPerformanceEntry } from '../../../../test'
```

## No Side Effects in Production Modules (Critical Convention)

Production source files under `packages/*/src/` must NOT have side effects at module evaluation time. Enforced by the `disallow-side-effects` local ESLint rule in `eslint-local-rules/disallowSideEffects.js`.

**Allowed at module level:**
- Variable/constant declarations with literal values or pure expressions
- Function declarations
- Class declarations (though classes are generally forbidden -- see below)
- Type declarations
- Import/export statements (only from packages known to be side-effect-free: `@datadog/browser-core`, `@datadog/browser-rum-core`, `react`, `react-router-dom`)

**NOT allowed at module level:**
- Function calls (except `Object.keys()`, `.concat()`)
- `new` expressions (except `RegExp`, `WeakMap`, `WeakSet`, `Set`, `Map`)
- Any other expression that could run code

**Exception:** Entry point files are allowlisted and may have side effects:
- `packages/logs/src/entries/main.ts`
- `packages/flagging/src/entries/main.ts`
- `packages/rum/src/entries/main.ts`
- `packages/rum-slim/src/entries/main.ts`

## No Classes in Production Code

Classes are **forbidden** in production source files (`packages/*/src/**/*.ts`, excluding spec files). Enforced by `no-restricted-syntax` rule with `ClassDeclaration`.

**Exceptions:** A few core infrastructure classes exist with `// eslint-disable-next-line no-restricted-syntax` comments:
- `Observable` and `BufferedObservable` in `packages/core/src/tools/observable.ts`
- `AbstractLifeCycle` in `packages/core/src/tools/abstractLifeCycle.ts`

Use functions returning object literals instead:
```typescript
// Correct pattern:
export function createContextManager(name: string) {
  let context: Context = {}
  const changeObservable = new Observable<void>()

  return {
    getContext: () => deepClone(context),
    setContext: (newContext: unknown) => { /* ... */ },
    clearContext: () => { context = {} },
    changeObservable,
  }
}

// Type derived from return value:
export type ContextManager = ReturnType<typeof createContextManager>
```

## No Array Spread in Production Code

Array spread (`[...arr]`) is **forbidden** in production source files. Use `.concat()` instead:
```typescript
// Forbidden:
const combined = [...array1, ...array2]

// Correct:
const combined = array1.concat(array2)
```

## No `Date.now()` in Production Code

Direct `Date.now()` calls are **forbidden** in production source files. Use `dateNow()` from the core utilities instead. This enables proper mocking in tests.

## Zone.js Safety

Production code must not directly use Zone.js-patchable DOM APIs. Instead:
- Use `getZoneJsOriginalValue()` to get unpatched values: `getZoneJsOriginalValue(window, 'setTimeout')`
- Use the SDK's own wrappers in `packages/core/src/tools/timer.ts`: `setTimeout()`, `clearTimeout()`, `setInterval()`, `clearInterval()`
- Use `addEventListener()` / `addEventListeners()` from `packages/core/src/browser/addEventListener.ts`
- Enforced by `disallow-zone-js-patched-values` and `disallow-url-constructor-patched-values` local rules

These wrappers also integrate with the `monitor()` error handling system.

## Error Handling

**Three-tier strategy:**

1. **`monitor()` / `callMonitored()`** - Wraps SDK-internal callbacks to catch errors and report them via telemetry. Used for all callbacks that run in response to browser events, timers, etc.
   - Location: `packages/core/src/tools/monitor.ts`
   - Pattern: Wrap callbacks with `monitor(callback)` or use `callMonitored(fn, context, args)`
   - Errors caught here go to SDK telemetry, not the user's error tracking

2. **`catchUserErrors()`** - Wraps user-provided callbacks to catch and display errors without breaking SDK operation.
   - Location: `packages/core/src/tools/catchUserErrors.ts`
   - Pattern: `catchUserErrors(userCallback, 'Error message for display')()`
   - Errors are displayed via `display.error()` (prefixed with "Datadog Browser SDK:")

3. **`display`** - The SDK's logging utility that preserves original console methods to avoid triggering patched behaviors.
   - Location: `packages/core/src/tools/display.ts`
   - Methods: `display.debug()`, `display.log()`, `display.info()`, `display.warn()`, `display.error()`
   - All messages prefixed with `'Datadog Browser SDK:'`
   - Never use `console.*` directly in production code (enforced by `no-console` rule)

## Logging

**Framework:** Custom `display` object (wraps original console methods)

**When to log:**
- Use `display.warn()` for configuration issues the user should fix
- Use `display.error()` for user callback errors
- Use `addTelemetryDebug()` / `addTelemetryError()` for internal monitoring
- Use `addTelemetryMetrics()` for internal metrics
- Telemetry debug and metrics calls **require** a `// monitor-until: YYYY-MM-DD` or `// monitor-until: forever` comment (enforced by lint rule `enforce-monitor-until-comment`)
- Expired `monitor-until` dates are reported as warnings/errors by `monitor-until-comment-expired` rule

```typescript
// monitor-until: 2025-06-01
addTelemetryDebug('short session investigation', { reason: 'session_expired_early' })

// monitor-until: forever
addTelemetryMetrics('batch_flushed', { byteCount: payload.bytesCount })
```

## Mockable Pattern

For values/functions that need to be mocked in tests without dependency injection, use the `mockable()` wrapper:

**In source code (`packages/core/src/tools/mockable.ts`):**
```typescript
import { mockable } from '../tools/mockable'

export function formatNavigationEntry(): string {
  const navigationEntry = mockable(getNavigationEntry)()
  // ...
}
```

**In tests:**
```typescript
import { replaceMockable, replaceMockableWithSpy } from '@datadog/browser-core/test'

it('should format navigation entry', () => {
  replaceMockable(getNavigationEntry, () => FAKE_NAVIGATION_ENTRY)
  // or for spy-based testing:
  const spy = replaceMockableWithSpy(getNavigationEntry)
  // ...
})
```

Mocks are automatically cleaned up after each test via `registerCleanupTask()`. In production builds, `mockable()` is a no-op that returns the value as-is. In test builds (when `__BUILD_ENV__SDK_VERSION__ === 'test'`), it checks for registered mock replacements.

## Comments and JSDoc

**JSDoc rules (enforced by `eslint-plugin-jsdoc`):**
- `check-alignment`: Alignment must be consistent
- `check-indentation`: Indentation must be consistent
- `no-blank-blocks`: No empty JSDoc blocks
- `require-description`: JSDoc blocks must have a description
- `require-param-description`: `@param` tags must include descriptions
- `require-hyphen-before-param-description`: `@param name - description` (hyphen required)
- `no-types`: No JSDoc type annotations in `.ts` files (use TypeScript types instead)
- `sort-tags`: Tags must follow order: `@category`, `@packageDocumentation`, `@internal`, `@deprecated`, `@experimental`, `@defaultValue`, `@param`, `@return`/`@returns`, `@see`, `@example`
- `tag-lines`: One blank line after opening `/**`

**When to comment:**
- Public API types and functions should have JSDoc with `@see` links to Datadog docs where applicable
- Internal mechanisms that are non-obvious should have block comments explaining "why"
- Use `@deprecated` with replacement guidance: `@deprecated Use {@link NewThing} instead`
- Use `@internal` for exports that are not part of the public API
- Use `@inline` for types that should be inlined in generated documentation
- Use `@packageDocumentation` at the top of entry point files

**Inline comments:**
- Spaced comments enforced: `// comment` not `//comment`
- Use comments to explain workarounds, browser compatibility issues, and non-obvious design decisions
- Reference GitHub issues and external documentation where relevant

**Example of well-documented entry point (`packages/rum/src/entries/main.ts`):**
```typescript
/**
 * Datadog Browser RUM SDK - Full version with Session Replay capabilities.
 *
 * @packageDocumentation
 * @see [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser/)
 */
```

**Example of documented configuration property:**
```typescript
interface InitConfiguration {
  /**
   * The client token for Datadog. Required for authenticating your application with Datadog.
   *
   * @category Authentication
   */
  clientToken: string

  /**
   * The percentage of sessions tracked. A value between 0 and 100.
   *
   * @category Data Collection
   * @defaultValue 100
   */
  sessionSampleRate?: number | undefined
}
```

## Function Design

**Return `{ stop }` or `{ unsubscribe }` for cleanup:**
```typescript
export function trackFirstContentfulPaint(configuration: RumConfiguration, ...) {
  const subscription = createPerformanceObservable(configuration, { ... }).subscribe(...)
  return {
    stop: subscription.unsubscribe,
  }
}
```

**Prefer functions returning object literals over classes.** Derive types from return values:
```typescript
export type Clock = ReturnType<typeof mockClock>
export type ContextManager = ReturnType<typeof createContextManager>
export type MockFetchManager = ReturnType<typeof mockFetch>
```

**Use destructured parameters for options objects:**
```typescript
export function createValueHistory<Value>({
  expireDelay,
  maxEntries,
}: {
  expireDelay: number
  maxEntries?: number
}): ValueHistory<Value> {
  // ...
}
```

**Use function overloads for better API ergonomics:**
```typescript
export function callMonitored<T extends (...args: any[]) => unknown>(
  fn: T, context: ThisParameterType<T>, args: Parameters<T>
): ReturnType<T> | undefined
export function callMonitored<T extends (this: void) => unknown>(
  fn: T
): ReturnType<T> | undefined
export function callMonitored<T extends (...args: any[]) => unknown>(
  fn: T, context?: any, args?: any
): ReturnType<T> | undefined { /* impl */ }
```

## Module Design

**Exports:**
- Named exports only. Default exports are **forbidden** except for webpack config files and ESLint rules.
- Use separate `export type` for type-only exports.
- Entry points (`packages/*/src/entries/main.ts`) re-export public API from internal modules.

**Index files (`index.ts`):**
- Use `index.ts` to expose a minimal API in directories where modules work together
- Do NOT use `index.ts` when a directory contains independent modules
- An `index.ts` should NOT contain exports only used by spec files

**Example from `packages/core/src/domain/configuration/index.ts`:**
```typescript
export type { Configuration, InitConfiguration, ProxyFn } from './configuration'
export {
  DefaultPrivacyLevel,
  TraceContextInjection,
  isSampleRate,
  validateAndBuildConfiguration,
  serializeConfiguration,
} from './configuration'
export type { EndpointBuilder, TrackType } from './endpointBuilder'
export { createEndpointBuilder, buildEndpointHost } from './endpointBuilder'
export { computeTransportConfiguration, isIntakeUrl } from './transportConfiguration'
```

**Test utilities directory (`packages/*/test/`):**
- Each package has a `test/` directory with test utilities
- Test helpers are exported via `test/index.ts`
- Mock/emulation helpers live in `test/emulate/` subdirectory
- Test utilities import from source via relative paths (`../src/...`) or package aliases
- Test utilities use `export type *` for type-only re-exports: `export type * from './typeUtils'`

**Protected directory imports:**
- The `disallow-protected-directory-import` local rule prevents cross-directory imports that break encapsulation
- Exception: Package index files can be imported from test directories

**Tools directory isolation:**
- `packages/core/src/tools/**` cannot import from `boot/`, `browser/`, `domain/`, or `transport/`
- Keeps utilities independent and reusable

## TypeScript Usage Patterns

**Strict mode:** Enabled in `tsconfig.base.json` (`"strict": true`)

**Target:** ES2018 for production, ES2020 for module system

**Lib:** `["ES2020", "DOM", "WebWorker"]`

**Type-only imports enforced:**
```typescript
import type { Configuration } from '../configuration'  // types
import { validateAndBuildConfiguration } from '../configuration'  // values
```

**Branded types for domain values (in `packages/core/src/tools/utils/timeUtils.ts`):**
```typescript
export type Duration = number & { d: 'Duration' }
export type RelativeTime = number & { d: 'RelativeTime' }
export type TimeStamp = number & { d: 'TimeStamp' }
export type ServerDuration = number & { d: 'ServerDuration' }

// Usage - cast at boundaries:
const relative = 1234 as RelativeTime
```

**`satisfies` operator used for type checking without widening:**
```typescript
const transport = {
  observable: new Observable<HttpRequestEvent>(),
  send: jasmine.createSpy(),
  sendOnExit: jasmine.createSpy(),
} satisfies HttpRequest
```

**Type guards:**
```typescript
export function isError(value: unknown): value is ErrorWithCause {
  // ...
}

export function isIndexableObject(value: unknown): value is Record<any, unknown> {
  return getType(value) === 'object'
}
```

**Generic patterns:**
```typescript
// Constrained generics for method instrumentation:
export function instrumentMethod<
  TARGET extends { [key: string]: any },
  METHOD extends keyof TARGET
>(targetPrototype: TARGET, method: METHOD, onPreCall: ...) { ... }

// Mapped types for event systems:
type EventTypesWithoutData<EventMap> = {
  [K in keyof EventMap]: EventMap[K] extends void ? K : never
}[keyof EventMap]

// Recursive partial type:
export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<RecursivePartial<U>>
    : T[P] extends object | undefined
      ? RecursivePartial<T[P]>
      : T[P]
}
```

**`undefined | undefined` pattern for optional properties:**
```typescript
// Use `| undefined` explicitly in public API types for better documentation:
sessionSampleRate?: number | undefined
```

**Never declare global types in production code:**
```typescript
// Forbidden (leaks to user app global scope):
declare global { ... }
// Use: TSModuleDeclaration[kind=global] is restricted by no-restricted-syntax
```

## Build Conventions

**Build system:** Webpack 5 with ts-loader for bundles, TypeScript compiler for CJS/ESM modules

**Build environment variables:** Defined as `__BUILD_ENV__<KEY>__` and replaced at build time via `webpack.DefinePlugin`:
```typescript
declare const __BUILD_ENV__SDK_VERSION__: string
```

**Package outputs:**
- `cjs/` - CommonJS modules
- `esm/` - ES modules
- `bundle/` - Webpack bundles (for CDN distribution)

**All packages mark `"sideEffects": false`** in `package.json` to enable tree shaking.

**Webpack target:** `['web', 'es2018']`

## Commit Messages and PR Conventions

**Commit messages use gitmoji convention:**

User-facing changes:
- `✨` New feature - New public API, behavior, event, property
- `🐛` Bug fix - Fix bugs, regressions, crashes
- `⚡️` Performance - Improve performance, reduce bundle size
- `💥` Breaking change - Breaking API changes
- `📝` Documentation - User-facing documentation
- `⚗️` Experimental - New public feature behind a feature flag

Internal changes:
- `👷` Build/CI - Dependencies, tooling, deployment, CI config
- `♻️` Refactor - Code restructuring, architectural changes
- `🎨` Code structure - Improve code structure, formatting
- `✅` Tests - Add/fix/improve tests
- `🔧` Configuration - Config files, project setup
- `🔥` Removal - Remove code, features, deprecated items
- `👌` Code review - Address code review feedback
- `🚨` Linting - Add/fix linter rules
- `🧹` Cleanup - Minor cleanup, housekeeping
- `🔊` Logging - Add/modify debug logs, telemetry

**PR conventions:**
- Branch naming: `<username>/<feature>` (e.g., `john.doe/fix-session-bug`)
- Always branch from `main`
- PR title follows commit message convention (used when squashing)
- PR template at `.github/PULL_REQUEST_TEMPLATE.md` includes:
  - **Motivation** - Why the change, links to tickets
  - **Changes** - What changed, who is affected, highlight uncertain changes
  - **Test instructions** - How to test, steps to reproduce
  - **Checklist** - Tested locally, tested on staging, unit tests added, e2e tests added, docs updated

## Package Manager

- **Yarn 4.12.0** (Yarn Berry with workspaces). Never use `npm` or `npx`.
- Node version managed by **Volta**: `25.6.0`
- Commands: `yarn test:unit`, `yarn lint`, `yarn format`, `yarn build`, `yarn typecheck`

## Key Architectural Patterns to Follow

**Observable pattern:** Use `Observable<T>` for event streams. Subscribe returns `{ unsubscribe }`:
```typescript
const observable = new Observable<ViewEvent>()
const subscription = observable.subscribe((event) => { ... })
// Later:
subscription.unsubscribe()
```

**BufferedObservable pattern:** For events that need to buffer data before subscribers are ready:
```typescript
const observable = new BufferedObservable<string>(100)
observable.notify('data')  // buffered until subscriber arrives
observable.subscribe((data) => { ... })  // receives buffered data asynchronously
observable.unbuffer()  // stop buffering when no longer needed
```

**LifeCycle pattern:** Use typed `AbstractLifeCycle<EventMap>` for domain event buses:
```typescript
// Define (packages/rum-core/src/domain/lifeCycle.ts):
export const LifeCycle = AbstractLifeCycle<LifeCycleEventMap>
export type LifeCycle = AbstractLifeCycle<LifeCycleEventMap>

// Use:
lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (event) => { ... })
lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, viewEvent)
```

**Hooks pattern:** Use `abstractHooks()` for assembly/transformation pipelines:
```typescript
hooks.register(HookNames.Assemble, (param) => { ... })
const result = hooks.triggerHook(HookNames.Assemble, eventData)
// Returns DISCARDED, SKIPPED, or combined results
```

**ValueHistory pattern:** Track time-bounded values:
```typescript
const viewHistory = createValueHistory<ViewContext>({ expireDelay: SESSION_TIME_OUT_DELAY })
const entry = viewHistory.add(viewContext, startTime)
entry.close(endTime)
const current = viewHistory.find()
```

**instrumentMethod pattern:** Safely patch browser APIs:
```typescript
const { stop } = instrumentMethod(window, 'fetch', ({ target, parameters, onPostCall }) => {
  // Before fetch is called
  onPostCall((result) => {
    // After fetch returns
  })
})
// Later: stop() to restore original
```

## Event Type Properties Convention

Event type files (`*Event.types.ts`) enforce snake_case for properties and UPPER_CASE for object literal properties:
```typescript
// In *Event.types.ts files:
interface RawRumResourceEvent {
  resource: {
    status_code?: number        // snake_case properties
    encoded_body_size?: number
    transfer_size?: number
  }
}
```

---

*Convention analysis: 2026-02-16*
