# Init-Time User and Global Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply `user` and `globalContext` fields from `RumInitConfiguration` at SDK start time, and generate resolution code for these fields in the SSI bundle.

**Architecture:** Add `user?: User` and `globalContext?: Context` to `RumInitConfiguration`. In `preStartRum.ts`, apply them via the pre-start context managers inside `doInit()` so they are replayed onto the real context managers at SDK start. In `bundleGenerator.ts`, emit inline JS resolution helpers that resolve `ContextItem[]` arrays from the remote config into plain objects, then pass them as `user` and `globalContext` through `DD_RUM.init()`.

**Tech Stack:** TypeScript (rum-core), Node.js/TypeScript (endpoint), Jasmine/Karma (rum-core unit tests), node:test (endpoint unit tests), Playwright (E2E tests).

---

### Task 1: Add `user` and `globalContext` to `RumInitConfiguration`

**Files:**
- Modify: `packages/rum-core/src/domain/configuration/configuration.ts`

**Step 1: Write the failing typecheck**

Before adding the fields, verify that assigning them causes a type error. Run:
```bash
yarn typecheck
```
No errors expected yet — this step is just a baseline.

**Step 2: Add `User` and `Context` imports, then add the fields**

In `packages/rum-core/src/domain/configuration/configuration.ts`, add to the imports at line 1:
```typescript
import type { Configuration, InitConfiguration, MatchOption, RawTelemetryConfiguration, User, Context } from '@datadog/browser-core'
```
(`User` and `Context` are not yet imported in this file.)

Then, at the end of the `RumInitConfiguration` interface (after the last field, before the closing `}`), add:

```typescript
  /**
   * Sets the initial user context for the session. Equivalent to calling `datadogRum.setUser()`
   * immediately after `init()`. Can be overridden at any time via `datadogRum.setUser()`.
   *
   * @category Data Collection
   */
  user?: User | undefined

  /**
   * Sets initial global context properties for the session. Equivalent to calling
   * `datadogRum.setGlobalContextProperty()` for each key immediately after `init()`.
   * Can be overridden at any time via `datadogRum.setGlobalContextProperty()`.
   *
   * @category Data Collection
   */
  globalContext?: Context | undefined
```

**Step 3: Verify no typecheck errors**
```bash
yarn typecheck
```
Expected: no errors.

**Step 4: Commit**
```bash
git add packages/rum-core/src/domain/configuration/configuration.ts
git commit -m "✨ Add user and globalContext fields to RumInitConfiguration"
```

---

### Task 2: Apply `user` and `globalContext` in `preStartRum.ts`

**Files:**
- Modify: `packages/rum-core/src/boot/preStartRum.ts`
- Test: `packages/rum-core/src/boot/preStartRum.spec.ts`

**Background:** `buildUserContextManager()` and `buildGlobalContextManager()` create pre-start context managers. `bufferContextCalls()` (line 318 of `preStartRum.ts`) subscribes to each manager's `changeObservable` — when the manager's context changes, it adds a `setContext(snapshot)` call to `bufferApiCalls`. On SDK start, `bufferApiCalls.drain(startRumResult)` replays all buffered calls onto the real managers. So calling `userContext.setContext(user)` inside `doInit()` is enough — the drain mechanism handles the rest.

**Step 1: Write the failing tests**

Add a new `describe('user and globalContext from initConfiguration')` block to `packages/rum-core/src/boot/preStartRum.spec.ts`, just before the closing `})` of the outer `describe('preStartRum')`:

```typescript
describe('user and globalContext from initConfiguration', () => {
  it('applies user from initConfiguration to the user context manager at start', () => {
    const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

    const setContextSpy = jasmine.createSpy()
    doStartRumSpy.and.returnValue({
      [CustomerContextKey.userContext]: { setContext: setContextSpy },
    } as unknown as StartRumResult)

    strategy.init({ ...DEFAULT_INIT_CONFIGURATION, user: { id: 'u1', name: 'Alice' } }, PUBLIC_API)

    expect(setContextSpy).toHaveBeenCalledOnceWith({ id: 'u1', name: 'Alice' })
  })

  it('applies globalContext from initConfiguration to the global context manager at start', () => {
    const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

    const setContextSpy = jasmine.createSpy()
    doStartRumSpy.and.returnValue({
      [CustomerContextKey.globalContext]: { setContext: setContextSpy },
    } as unknown as StartRumResult)

    strategy.init({ ...DEFAULT_INIT_CONFIGURATION, globalContext: { plan: 'pro', region: 'eu' } }, PUBLIC_API)

    expect(setContextSpy).toHaveBeenCalledOnceWith({ plan: 'pro', region: 'eu' })
  })

  it('does not apply user context if not provided in initConfiguration', () => {
    const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

    const setContextSpy = jasmine.createSpy()
    doStartRumSpy.and.returnValue({
      [CustomerContextKey.userContext]: { setContext: setContextSpy },
    } as unknown as StartRumResult)

    strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)

    expect(setContextSpy).not.toHaveBeenCalled()
  })

  it('does not apply globalContext if not provided in initConfiguration', () => {
    const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

    const setContextSpy = jasmine.createSpy()
    doStartRumSpy.and.returnValue({
      [CustomerContextKey.globalContext]: { setContext: setContextSpy },
    } as unknown as StartRumResult)

    strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)

    expect(setContextSpy).not.toHaveBeenCalled()
  })
})
```

You will also need to add `CustomerContextKey` to the imports at the top of the spec file — check if it is already imported; if not, add it from `@datadog/browser-core`.

**Step 2: Run tests to confirm they fail**
```bash
yarn test:unit --spec packages/rum-core/src/boot/preStartRum.spec.ts
```
Expected: 4 new failing tests.

**Step 3: Implement the fix in `preStartRum.ts`**

In `packages/rum-core/src/boot/preStartRum.ts`, inside `doInit()`, after `cachedInitConfiguration = initConfiguration` (line 127) and before `addTelemetryConfiguration(...)` (line 128), add:

```typescript
    if (initConfiguration.user) {
      userContext.setContext(initConfiguration.user)
    }
    if (initConfiguration.globalContext) {
      globalContext.setContext(initConfiguration.globalContext)
    }
```

The `userContext` and `globalContext` variables are in the enclosing `createPreStartStrategy` closure (declared at lines 64 and 67). No new imports needed — `User` and `Context` are already carried via the `RumInitConfiguration` type.

**Step 4: Run tests to confirm they pass**
```bash
yarn test:unit --spec packages/rum-core/src/boot/preStartRum.spec.ts
```
Expected: all tests green, including the 4 new ones.

**Step 5: Commit**
```bash
git add packages/rum-core/src/boot/preStartRum.ts packages/rum-core/src/boot/preStartRum.spec.ts
git commit -m "✨ Apply user and globalContext from initConfiguration at SDK start"
```

---

### Task 3: Create the context resolution helpers module

**Files:**
- Create: `packages/endpoint/src/contextResolutionHelpers.ts`
- Create: `packages/endpoint/src/contextResolutionHelpers.spec.ts` (tested in the same step)

This module exports a single string constant — the vanilla JS code that will be inlined into the generated bundle to resolve `DynamicOption` values at browser runtime.

**Step 1: Create `packages/endpoint/src/contextResolutionHelpers.ts`**

```typescript
/**
 * Vanilla JS helpers emitted into generated bundles to resolve DynamicOption values
 * from the remote configuration's user[] and context[] arrays at browser runtime.
 *
 * These functions mirror the logic in @datadog/browser-remote-config/resolveDynamicValues
 * but are written as a self-contained JS string for inclusion in generated IIFE bundles.
 *
 * IMPORTANT: This string must be valid ES5-compatible JavaScript. Do not use arrow functions,
 * const/let, template literals, or other ES6+ syntax inside the string.
 */
export const CONTEXT_RESOLUTION_HELPERS = `
function __dd_resolveContextValue(value) {
  if (!value || typeof value !== 'object') { return value; }
  var serializedType = value.rcSerializedType;
  if (serializedType === 'string') { return value.value; }
  if (serializedType !== 'dynamic') { return undefined; }
  var strategy = value.strategy;
  var resolved;
  if (strategy === 'cookie') {
    resolved = __dd_getCookie(value.name);
  } else if (strategy === 'js') {
    resolved = __dd_resolveJsPath(value.path);
  } else if (strategy === 'dom') {
    resolved = __dd_resolveDom(value.selector, value.attribute);
  } else if (strategy === 'localStorage') {
    try { resolved = localStorage.getItem(value.key); } catch(e) { resolved = undefined; }
  }
  if (value.extractor && typeof resolved === 'string') {
    return __dd_extract(value.extractor, resolved);
  }
  return resolved;
}

function __dd_getCookie(name) {
  var escaped = name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  var match = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + escaped + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function __dd_resolveJsPath(path) {
  if (typeof path !== 'string' || path === '') { return undefined; }
  var parts = path.split('.');
  var obj = window;
  for (var i = 0; i < parts.length; i++) {
    if (obj == null || !(parts[i] in Object(obj))) { return undefined; }
    obj = obj[parts[i]];
  }
  return obj;
}

function __dd_resolveDom(selector, attribute) {
  var el;
  try { el = document.querySelector(selector); } catch(e) { return undefined; }
  if (!el) { return undefined; }
  if (el.getAttribute('type') === 'password' && attribute === 'value') { return undefined; }
  if (attribute !== undefined) { return el.getAttribute(attribute); }
  return el.textContent;
}

function __dd_extract(extractor, value) {
  try {
    var match = new RegExp(extractor.value).exec(value);
    return match ? (match[1] !== undefined ? match[1] : match[0]) : undefined;
  } catch(e) { return undefined; }
}
`
```

**Step 2: Create `packages/endpoint/src/contextResolutionHelpers.spec.ts`**

These tests run in Node.js via `node:test`. They evaluate the emitted JS string in a controlled context using `vm.runInNewContext` to simulate the browser environment.

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert'
import vm from 'node:vm'
import { CONTEXT_RESOLUTION_HELPERS } from './contextResolutionHelpers.ts'

/**
 * Evaluate the resolution helpers in an isolated context with a fake browser environment,
 * then call __dd_resolveContextValue with the provided value.
 */
function resolve(value: unknown, browserEnv: Record<string, unknown> = {}): unknown {
  const sandbox = {
    window: { ...browserEnv },
    document: {
      cookie: browserEnv.__cookie ?? '',
      querySelector: (selector: string) => browserEnv.__domElements?.[selector] ?? null,
    },
    localStorage: {
      getItem: (key: string) => (browserEnv.__localStorage as Record<string, string> | undefined)?.[key] ?? null,
    },
    result: undefined as unknown,
    ...browserEnv,
  }
  const script = `
    ${CONTEXT_RESOLUTION_HELPERS}
    result = __dd_resolveContextValue(value);
  `
  vm.runInNewContext(script, { ...sandbox, value })
  return sandbox.result
}

describe('CONTEXT_RESOLUTION_HELPERS', () => {
  describe('rcSerializedType: string', () => {
    it('returns the static value directly', () => {
      assert.strictEqual(resolve({ rcSerializedType: 'string', value: 'hello' }), 'hello')
    })
  })

  describe('strategy: cookie', () => {
    it('reads a cookie by name', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'cookie', name: 'user_id' }, {
          __cookie: 'session=abc; user_id=42; other=x',
        }),
        '42'
      )
    })

    it('returns undefined when cookie is absent', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'cookie', name: 'missing' }, {
          __cookie: 'session=abc',
        }),
        undefined
      )
    })
  })

  describe('strategy: js', () => {
    it('resolves a top-level window property', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'js', path: 'userId' }, {
          userId: 'alice',
        }),
        'alice'
      )
    })

    it('resolves a nested window property', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'js', path: 'user.id' }, {
          user: { id: 'bob' },
        }),
        'bob'
      )
    })

    it('returns undefined for missing path', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'js', path: 'missing.deep' }),
        undefined
      )
    })
  })

  describe('strategy: localStorage', () => {
    it('reads a localStorage item by key', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'plan' }, {
          __localStorage: { plan: 'pro' },
        }),
        'pro'
      )
    })

    it('returns null when key is absent', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'missing' }, {
          __localStorage: {},
        }),
        null
      )
    })
  })

  describe('extractor regex', () => {
    it('applies the extractor regex to the resolved string', () => {
      assert.strictEqual(
        resolve({
          rcSerializedType: 'dynamic',
          strategy: 'cookie',
          name: 'session',
          extractor: { value: 'user-(\\w+)' },
        }, {
          __cookie: 'session=user-alice123',
        }),
        'alice123'
      )
    })
  })

  describe('unknown strategy', () => {
    it('returns undefined for unsupported strategy', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'unknown' as any }),
        undefined
      )
    })
  })
})
```

**Step 3: Run the spec**
```bash
node --test 'packages/endpoint/src/contextResolutionHelpers.spec.ts'
```
Expected: all tests pass.

> If `vm.runInNewContext` is not flexible enough to handle `document.querySelector` interception, refactor the sandbox to pass a proper mock `document` object into the context.

**Step 4: Commit**
```bash
git add packages/endpoint/src/contextResolutionHelpers.ts packages/endpoint/src/contextResolutionHelpers.spec.ts
git commit -m "✨ Add context resolution helpers for dynamic values in generated bundles"
```

---

### Task 4: Update `generateCombinedBundle` to resolve and pass user/globalContext

**Files:**
- Modify: `packages/endpoint/src/bundleGenerator.ts`
- Modify: `packages/endpoint/src/bundleGenerator.spec.ts`

**Step 1: Write the failing tests**

Add to `packages/endpoint/src/bundleGenerator.spec.ts` (inside the existing `describe('generateCombinedBundle')` block):

```typescript
describe('user and context resolution', () => {
  it('emits setUser resolution code when user[] is present in config', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: {
        applicationId: 'test-app-id',
        user: [
          { key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'user_id' } },
        ],
      },
      variant: 'rum',
    })

    assert.ok(bundle.includes('__dd_user'), 'Should include user resolution variable')
    assert.ok(bundle.includes('__dd_resolveContextValue'), 'Should include resolution helper call')
    assert.ok(bundle.includes('"user"'), 'Should pass user to DD_RUM.init')
  })

  it('emits globalContext resolution code when context[] is present in config', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: {
        applicationId: 'test-app-id',
        context: [
          { key: 'plan', value: { rcSerializedType: 'string', value: 'pro' } },
        ],
      },
      variant: 'rum',
    })

    assert.ok(bundle.includes('__dd_globalContext'), 'Should include globalContext resolution variable')
    assert.ok(bundle.includes('"globalContext"'), 'Should pass globalContext to DD_RUM.init')
  })

  it('includes CONTEXT_RESOLUTION_HELPERS in the bundle when user or context is present', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: {
        applicationId: 'test-app-id',
        user: [{ key: 'id', value: { rcSerializedType: 'string', value: 'u1' } }],
      },
      variant: 'rum',
    })

    assert.ok(bundle.includes('__dd_getCookie'), 'Should include cookie resolution helper')
    assert.ok(bundle.includes('__dd_resolveJsPath'), 'Should include JS path resolution helper')
  })

  it('does not include resolution code when user and context are absent', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: { applicationId: 'test-app-id', sessionSampleRate: 100 },
      variant: 'rum',
    })

    assert.ok(!bundle.includes('__dd_user'), 'Should not include user resolution variable')
    assert.ok(!bundle.includes('__dd_globalContext'), 'Should not include globalContext resolution variable')
  })
})
```

**Step 2: Run tests to confirm they fail**
```bash
node --test 'packages/endpoint/src/bundleGenerator.spec.ts'
```
Expected: 4 new failing tests.

**Step 3: Update `generateCombinedBundle` in `bundleGenerator.ts`**

Import the helpers at the top of `packages/endpoint/src/bundleGenerator.ts`:
```typescript
import { CONTEXT_RESOLUTION_HELPERS } from './contextResolutionHelpers.ts'
```

Replace the current `generateCombinedBundle` function body (lines 57–88) with:

```typescript
export function generateCombinedBundle(options: CombineBundleOptions): string {
  const { sdkCode, config, variant, sdkVersion } = options
  const configJson = JSON.stringify(config, null, 2)
  const versionDisplay = sdkVersion ?? 'unknown'

  const hasUser = Array.isArray((config as any).user) && (config as any).user.length > 0
  const hasContext = Array.isArray((config as any).context) && (config as any).context.length > 0
  const needsResolution = hasUser || hasContext

  const contextResolutionCode = needsResolution
    ? `
  // Resolve dynamic values for user and global context
  var __dd_user = {};
  (__DATADOG_REMOTE_CONFIG__.user || []).forEach(function(item) {
    __dd_user[item.key] = __dd_resolveContextValue(item.value);
  });
  var __dd_globalContext = {};
  (__DATADOG_REMOTE_CONFIG__.context || []).forEach(function(item) {
    __dd_globalContext[item.key] = __dd_resolveContextValue(item.value);
  });`
    : ''

  const initCallCode = needsResolution
    ? `window.DD_RUM.init(Object.assign({}, __DATADOG_REMOTE_CONFIG__, {
      user: Object.keys(__dd_user).length ? __dd_user : undefined,
      globalContext: Object.keys(__dd_globalContext).length ? __dd_globalContext : undefined
    }));`
    : `window.DD_RUM.init(__DATADOG_REMOTE_CONFIG__);`

  const helpersCode = needsResolution ? CONTEXT_RESOLUTION_HELPERS : ''

  return `/**
 * Datadog Browser SDK with Embedded Remote Configuration
 * SDK Variant: ${variant}
 * SDK Version: ${versionDisplay}
 *
 * This bundle includes:
 * - Pre-fetched remote configuration
 * - Minified SDK code from CDN
 *
 * No additional network requests needed for SDK initialization.
 */
(function() {
  'use strict';

  // Embedded remote configuration
  var __DATADOG_REMOTE_CONFIG__ = ${configJson};

  // SDK bundle (${variant}) from CDN
  ${sdkCode}

  // Auto-initialize with embedded config
  if (typeof window !== 'undefined' && typeof window.DD_RUM !== 'undefined') {
    ${contextResolutionCode}
    ${initCallCode}
  }
  ${helpersCode}
})();
`
}
```

**Step 4: Run tests to confirm they pass**
```bash
node --test 'packages/endpoint/src/bundleGenerator.spec.ts'
```
Expected: all tests green, including the 4 new ones.

**Step 5: Run the full unit test suite to check for regressions**
```bash
yarn test:unit
```
Expected: all tests pass.

**Step 6: Commit**
```bash
git add packages/endpoint/src/bundleGenerator.ts packages/endpoint/src/bundleGenerator.spec.ts
git commit -m "✨ Resolve user and globalContext from remote config in generated bundles"
```

---

### Task 5: E2E tests for user and globalContext from embedded config

**Files:**
- Modify: `test/e2e/scenario/rum/embeddedConfig.scenario.ts`

**Background:** The existing E2E tests in this file use `withRemoteConfiguration` to serve pre-generated bundles. Look at the existing test structure to understand how to set up the page and assert on RUM events.

**Step 1: Read the existing E2E scenario**

Open `test/e2e/scenario/rum/embeddedConfig.scenario.ts` and `test/e2e/scenario/rum/embeddedConfigDynamic.scenario.ts` to understand the test pattern before writing new tests.

**Step 2: Add static user context test**

Add a test that:
1. Generates a bundle with `user: [{ key: 'id', value: { rcSerializedType: 'string', value: 'test-user-42' } }]`
2. Loads the page with that bundle
3. Asserts that the first RUM view event has `usr.id === 'test-user-42'`

**Step 3: Add static globalContext test**

Add a test that:
1. Generates a bundle with `context: [{ key: 'plan', value: { rcSerializedType: 'string', value: 'enterprise' } }]`
2. Loads the page
3. Asserts that the first RUM view event has `context.plan === 'enterprise'`

**Step 4: Add dynamic cookie user context test** (in `embeddedConfigDynamic.scenario.ts`)

Add a test that:
1. Generates a bundle with `user: [{ key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'uid' } }]`
2. Sets the `uid` cookie to `cookie-user-99` in the browser context before loading the page
3. Asserts that the RUM view event has `usr.id === 'cookie-user-99'`

**Step 5: Run E2E tests**
```bash
yarn test:e2e -g "embedded configuration"
```
Expected: all embedded config tests pass, including the new ones.

**Step 6: Commit**
```bash
git add test/e2e/scenario/rum/embeddedConfig.scenario.ts test/e2e/scenario/rum/embeddedConfigDynamic.scenario.ts
git commit -m "✅ Add E2E tests for user and globalContext from embedded remote config"
```

---

### Task 6: Final verification

**Step 1: Run all unit tests**
```bash
yarn test:unit
```
Expected: all pass.

**Step 2: Run typecheck**
```bash
yarn typecheck
```
Expected: no errors.

**Step 3: Run lint**
```bash
yarn lint
```
Expected: no errors.

**Step 4: Run E2E tests**
```bash
yarn test:e2e -g "embedded configuration"
```
Expected: all pass.
