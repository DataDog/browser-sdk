# `@datadog/browser-native` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a new `packages/browser-native` package that wraps native browser API callsites from `packages/core/src/browser/` as standalone named functions, establishing an isolation layer between SDK code and the browser.

**Architecture:** New zero-dependency package at the base of the dep graph. Each native API callsite becomes a standalone named export (matching browser API names where applicable, getter/setter convention for properties). `@datadog/browser-core` is updated to depend on this package and its `core/src/browser/` files import from it instead of calling native APIs directly.

**Tech Stack:** TypeScript, Yarn workspaces v4, Karma/Jasmine for tests, same build tooling as other packages (`scripts/build/build-package.ts`).

---

### Task 1: Create the package scaffold

**Files:**

- Create: `packages/browser-native/package.json`
- Create: `packages/browser-native/tsconfig.json`
- Create: `packages/browser-native/src/index.ts`

**Step 1: Create `packages/browser-native/package.json`**

Model it on `packages/core/package.json`. No `dependencies` — this package is zero-dep.

```json
{
  "name": "@datadog/browser-native",
  "version": "6.27.1",
  "license": "Apache-2.0",
  "main": "cjs/index.js",
  "module": "esm/index.js",
  "types": "cjs/index.d.ts",
  "sideEffects": false,
  "scripts": {
    "build": "node ../../scripts/build/build-package.ts --modules"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/DataDog/browser-sdk.git",
    "directory": "packages/browser-native"
  },
  "volta": {
    "extends": "../../package.json"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create `packages/browser-native/tsconfig.json`**

Model it on `packages/worker/tsconfig.json`.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "declaration": true,
    "rootDir": "./src/"
  },
  "include": ["./src/**/*.ts"],
  "exclude": ["./src/**/*.spec.ts", "./src/**/*.specHelper.ts"]
}
```

**Step 3: Create `packages/browser-native/src/index.ts`** (empty for now)

```ts
// exports added in later tasks
```

**Step 4: Commit**

```bash
git add packages/browser-native/
git commit -m "✨ scaffold @datadog/browser-native package"
```

---

### Task 2: Register package in the monorepo

**Files:**

- Modify: `tsconfig.base.json`

**Step 1: Add the path alias to `tsconfig.base.json`**

In the `paths` object, add:

```json
"@datadog/browser-native": ["./packages/browser-native/src"]
```

Add it as the first entry (it's the new base layer).

**Step 2: Verify TypeScript resolves the new package**

```bash
yarn typecheck
```

Expected: no new errors (the package is empty so nothing to break yet).

**Step 3: Commit**

```bash
git add tsconfig.base.json
git commit -m "🔧 register @datadog/browser-native in tsconfig paths"
```

---

### Task 3: Add internal utilities (ZoneJS bypass + global object)

`browser-native` needs to bypass Zone.js (an Angular library that patches browser APIs). It cannot import this from `@datadog/browser-core` (that would create a circular dependency). Instead, it owns a minimal internal copy of these two utilities.

**Files:**

- Create: `packages/browser-native/src/globalObject.ts`
- Create: `packages/browser-native/src/getZoneJsOriginalValue.ts`

**Step 1: Create `packages/browser-native/src/globalObject.ts`**

Copy the content of `packages/core/src/tools/globalObject.ts` verbatim. This file has no dependencies and is safe to replicate.

```ts
// Copy from packages/core/src/tools/globalObject.ts
```

**Step 2: Create `packages/browser-native/src/getZoneJsOriginalValue.ts`**

Copy the content of `packages/core/src/tools/getZoneJsOriginalValue.ts` verbatim, but update the import to point to the local `globalObject`:

```ts
import { getGlobalObject } from './globalObject'

// ... rest of the file identical to packages/core/src/tools/getZoneJsOriginalValue.ts
```

Do NOT export these files from `src/index.ts` — they are internal utilities only.

**Step 3: Typecheck**

```bash
yarn typecheck
```

Expected: passes.

**Step 4: Commit**

```bash
git add packages/browser-native/src/globalObject.ts packages/browser-native/src/getZoneJsOriginalValue.ts
git commit -m "✨ add internal ZoneJS bypass utilities to browser-native"
```

---

### Task 4: Implement network APIs

**Files:**

- Create: `packages/browser-native/src/network.ts`
- Create: `packages/browser-native/src/network.spec.ts`

**Step 1: Write the failing tests**

```ts
// packages/browser-native/src/network.spec.ts
import { fetch, sendBeacon } from './network'

describe('fetch', () => {
  it('calls window.fetch with the given arguments', async () => {
    const mockFetch = jasmine.createSpy().and.returnValue(Promise.resolve(new Response()))
    spyOnProperty(window, 'fetch').and.returnValue(mockFetch)

    await fetch('https://example.com', { method: 'POST' })

    expect(mockFetch).toHaveBeenCalledWith('https://example.com', { method: 'POST' })
  })
})

describe('sendBeacon', () => {
  it('calls navigator.sendBeacon with the given arguments', () => {
    spyOn(navigator, 'sendBeacon').and.returnValue(true)

    const result = sendBeacon('https://example.com', 'data')

    expect(navigator.sendBeacon).toHaveBeenCalledWith('https://example.com', 'data')
    expect(result).toBeTrue()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test:unit --spec packages/browser-native/src/network.spec.ts
```

Expected: FAIL — `fetch` and `sendBeacon` not found.

**Step 3: Implement `packages/browser-native/src/network.ts`**

```ts
import { getGlobalObject } from './globalObject'
import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'

/**
 * Calls window.fetch, bypassing Zone.js patching if present.
 * Zone.js (used by Angular) patches window.fetch which can cause issues
 * like unnecessary change detection cycles. We use the original value.
 */
export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return getZoneJsOriginalValue(getGlobalObject(), 'fetch')(input, init)
}

/**
 * Calls navigator.sendBeacon.
 */
export function sendBeacon(url: string, data?: BodyInit | null): boolean {
  return navigator.sendBeacon(url, data)
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test:unit --spec packages/browser-native/src/network.spec.ts
```

Expected: PASS.

**Step 5: Export from index.ts**

```ts
// packages/browser-native/src/index.ts
export { fetch, sendBeacon } from './network'
```

**Step 6: Commit**

```bash
git add packages/browser-native/src/network.ts packages/browser-native/src/network.spec.ts packages/browser-native/src/index.ts
git commit -m "✨ add fetch and sendBeacon to browser-native"
```

---

### Task 5: Implement event listener APIs

**Files:**

- Create: `packages/browser-native/src/events.ts`
- Create: `packages/browser-native/src/events.spec.ts`

**Step 1: Write the failing tests**

```ts
// packages/browser-native/src/events.spec.ts
import { addEventListener, removeEventListener } from './events'

describe('addEventListener', () => {
  it('adds an event listener to the target', () => {
    const target = document.createElement('div')
    const listener = jasmine.createSpy('listener')

    addEventListener(target, 'click', listener)
    target.dispatchEvent(new Event('click'))

    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('removeEventListener', () => {
  it('removes a previously added listener', () => {
    const target = document.createElement('div')
    const listener = jasmine.createSpy('listener')

    addEventListener(target, 'click', listener)
    removeEventListener(target, 'click', listener)
    target.dispatchEvent(new Event('click'))

    expect(listener).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test:unit --spec packages/browser-native/src/events.spec.ts
```

Expected: FAIL.

**Step 3: Implement `packages/browser-native/src/events.ts`**

This replicates the core logic from `packages/core/src/browser/addEventListener.ts` lines 131–140 — using `EventTarget.prototype` when available (to avoid issues with frameworks like Salesforce LWC), and bypassing Zone.js.

```ts
import { getGlobalObject } from './globalObject'
import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'

type WindowWithEventTarget = Window & { EventTarget?: typeof EventTarget }

function getListenerTarget(eventTarget: EventTarget): EventTarget {
  const win = getGlobalObject<WindowWithEventTarget>()
  return win.EventTarget && eventTarget instanceof EventTarget ? EventTarget.prototype : eventTarget
}

/**
 * Adds an event listener to a target, bypassing Zone.js patching if present.
 * Uses EventTarget.prototype when possible to avoid overrides in some frameworks.
 */
export function addEventListener(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): void {
  const listenerTarget = getListenerTarget(target)
  getZoneJsOriginalValue(listenerTarget, 'addEventListener').call(target, type, listener, options)
}

/**
 * Removes an event listener from a target, bypassing Zone.js patching if present.
 */
export function removeEventListener(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
): void {
  const listenerTarget = getListenerTarget(target)
  getZoneJsOriginalValue(listenerTarget, 'removeEventListener').call(target, type, listener, options)
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test:unit --spec packages/browser-native/src/events.spec.ts
```

Expected: PASS.

**Step 5: Export from index.ts**

```ts
export { fetch, sendBeacon } from './network'
export { addEventListener, removeEventListener } from './events'
```

**Step 6: Commit**

```bash
git add packages/browser-native/src/events.ts packages/browser-native/src/events.spec.ts packages/browser-native/src/index.ts
git commit -m "✨ add addEventListener and removeEventListener to browser-native"
```

---

### Task 6: Implement document property wrappers

**Files:**

- Create: `packages/browser-native/src/document.ts`
- Create: `packages/browser-native/src/document.spec.ts`

**Step 1: Write the failing tests**

```ts
// packages/browser-native/src/document.spec.ts
import { getCookie, setCookie, getReadyState, getVisibilityState } from './document'

describe('getCookie', () => {
  it('returns document.cookie', () => {
    spyOnProperty(document, 'cookie', 'get').and.returnValue('foo=bar')
    expect(getCookie()).toBe('foo=bar')
  })
})

describe('setCookie', () => {
  it('sets document.cookie', () => {
    const spy = spyOnProperty(document, 'cookie', 'set')
    setCookie('foo=bar; path=/')
    expect(spy).toHaveBeenCalledWith('foo=bar; path=/')
  })
})

describe('getReadyState', () => {
  it('returns document.readyState', () => {
    spyOnProperty(document, 'readyState', 'get').and.returnValue('complete')
    expect(getReadyState()).toBe('complete')
  })
})

describe('getVisibilityState', () => {
  it('returns document.visibilityState', () => {
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden')
    expect(getVisibilityState()).toBe('hidden')
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test:unit --spec packages/browser-native/src/document.spec.ts
```

Expected: FAIL.

**Step 3: Implement `packages/browser-native/src/document.ts`**

```ts
/** Returns the current value of document.cookie (all cookies as a single string). */
export function getCookie(): string {
  return document.cookie
}

/** Sets a cookie by assigning to document.cookie. */
export function setCookie(value: string): void {
  document.cookie = value
}

/** Returns document.readyState. */
export function getReadyState(): DocumentReadyState {
  return document.readyState
}

/** Returns document.visibilityState. */
export function getVisibilityState(): DocumentVisibilityState {
  return document.visibilityState
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test:unit --spec packages/browser-native/src/document.spec.ts
```

Expected: PASS.

**Step 5: Export from index.ts**

```ts
export { fetch, sendBeacon } from './network'
export { addEventListener, removeEventListener } from './events'
export { getCookie, setCookie, getReadyState, getVisibilityState } from './document'
```

**Step 6: Commit**

```bash
git add packages/browser-native/src/document.ts packages/browser-native/src/document.spec.ts packages/browser-native/src/index.ts
git commit -m "✨ add document property wrappers to browser-native"
```

---

### Task 7: Implement performance APIs

**Files:**

- Create: `packages/browser-native/src/performance.ts`
- Create: `packages/browser-native/src/performance.spec.ts`

**Step 1: Write the failing tests**

```ts
// packages/browser-native/src/performance.spec.ts
import { now } from './performance'

describe('now', () => {
  it('returns performance.now()', () => {
    spyOn(performance, 'now').and.returnValue(1234.5)
    expect(now()).toBe(1234.5)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test:unit --spec packages/browser-native/src/performance.spec.ts
```

Expected: FAIL.

**Step 3: Implement `packages/browser-native/src/performance.ts`**

```ts
/** Returns performance.now() — milliseconds elapsed since the navigation start, with sub-millisecond precision. */
export function now(): number {
  return performance.now()
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test:unit --spec packages/browser-native/src/performance.spec.ts
```

Expected: PASS.

**Step 5: Export from index.ts**

```ts
export { fetch, sendBeacon } from './network'
export { addEventListener, removeEventListener } from './events'
export { getCookie, setCookie, getReadyState, getVisibilityState } from './document'
export { now } from './performance'
```

**Step 6: Commit**

```bash
git add packages/browser-native/src/performance.ts packages/browser-native/src/performance.spec.ts packages/browser-native/src/index.ts
git commit -m "✨ add performance.now wrapper to browser-native"
```

---

### Task 8: Wire up `@datadog/browser-core` dependency

`@datadog/browser-core` needs to declare `@datadog/browser-native` as a dependency so it can import from it.

**Files:**

- Modify: `packages/core/package.json`

**Step 1: Add the dependency**

In `packages/core/package.json`, add a `dependencies` field (it currently has none):

```json
"dependencies": {
  "@datadog/browser-native": "6.27.1"
}
```

**Step 2: Install**

```bash
yarn install
```

**Step 3: Verify typecheck still passes**

```bash
yarn typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/core/package.json yarn.lock
git commit -m "🔧 add @datadog/browser-native dependency to browser-core"
```

---

### Task 9: Migrate `core/src/browser/fetch.ts`

`packages/core/src/browser/fetch.ts` is a thin wrapper around the Zone.js-safe native fetch. After this task it simply re-exports from `browser-native`.

**Files:**

- Modify: `packages/core/src/browser/fetch.ts`

**Step 1: Replace the implementation**

The current file uses `getZoneJsOriginalValue(getGlobalObject(), 'fetch')`. Replace the entire file body with a re-export:

```ts
export { fetch } from '@datadog/browser-native'
```

**Step 2: Run the existing fetch tests**

```bash
yarn test:unit --spec packages/core/src/browser/fetch.spec.ts
```

Expected: PASS (same behavior, different source).

**Step 3: Typecheck**

```bash
yarn typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/core/src/browser/fetch.ts
git commit -m "♻️ migrate core/browser/fetch.ts to use @datadog/browser-native"
```

---

### Task 10: Migrate `core/src/browser/cookie.ts`

Replace direct `document.cookie` reads and writes with `getCookie()` and `setCookie()` from `browser-native`.

**Files:**

- Modify: `packages/core/src/browser/cookie.ts`

**Step 1: Add the import**

At the top of `cookie.ts`, add:

```ts
import { getCookie as getDocumentCookie, setCookie as setDocumentCookie } from '@datadog/browser-native'
```

(Aliased to avoid name collision with the existing `getCookie`/`setCookie` functions in this file.)

**Step 2: Replace all `document.cookie` accesses**

There are several in the file. Replace each one:

- `document.cookie = ...` → `setDocumentCookie(...)`
- `document.cookie` (reads) → `getDocumentCookie()`

Use the file at `packages/core/src/browser/cookie.ts` as reference. The key occurrences are:

- `setCookie()` function (line 26): `document.cookie = \`...\``→`setDocumentCookie(\`...\`)`
- `getCookie()` function (line 34): `findCommaSeparatedValue(document.cookie, name)` → `findCommaSeparatedValue(getDocumentCookie(), name)`
- `getCookies()` function (line 41): `findAllCommaSeparatedValues(document.cookie)` → `findAllCommaSeparatedValues(getDocumentCookie())`
- `getInitCookie()` function (line 54): `findCommaSeparatedValues(document.cookie)` → `findCommaSeparatedValues(getDocumentCookie())`
- `areCookiesAuthorized()` function (line 68): `document.cookie === undefined || document.cookie === null` → `getDocumentCookie() === undefined || getDocumentCookie() === null`

**Step 3: Run the existing cookie tests**

```bash
yarn test:unit --spec packages/core/src/browser/cookie.spec.ts
```

Expected: PASS.

**Step 4: Typecheck**

```bash
yarn typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/core/src/browser/cookie.ts
git commit -m "♻️ migrate core/browser/cookie.ts to use @datadog/browser-native"
```

---

### Task 11: Migrate `core/src/browser/addEventListener.ts`

The `addEventListeners` function in this file calls the native `add`/`remove` methods via `getZoneJsOriginalValue`. Replace those two callsites with `addEventListener`/`removeEventListener` from `browser-native`.

**Files:**

- Modify: `packages/core/src/browser/addEventListener.ts`

**Step 1: Add the import**

```ts
import {
  addEventListener as nativeAddEventListener,
  removeEventListener as nativeRemoveEventListener,
} from '@datadog/browser-native'
```

**Step 2: Remove the lines that compute `listenerTarget`**

Find and remove these lines (around line 128–135 in the current file):

```ts
const options = passive ? { capture, passive } : capture

// Use the window.EventTarget.prototype when possible to avoid wrong overrides (e.g: https://github.com/salesforce/lwc/issues/1824)
const listenerTarget =
  window.EventTarget && eventTarget instanceof EventTarget ? window.EventTarget.prototype : eventTarget

const add = getZoneJsOriginalValue(listenerTarget, 'addEventListener')
eventNames.forEach((eventName) => add.call(eventTarget, eventName, listenerWithMonitor, options))
```

Replace with:

```ts
const options = passive ? { capture, passive } : capture

eventNames.forEach((eventName) => nativeAddEventListener(eventTarget, eventName, listenerWithMonitor, options))
```

**Step 3: Update the `stop` function**

Find (around line 137–140):

```ts
function stop() {
  const remove = getZoneJsOriginalValue(listenerTarget, 'removeEventListener')
  eventNames.forEach((eventName) => remove.call(eventTarget, eventName, listenerWithMonitor, options))
}
```

Replace with:

```ts
function stop() {
  eventNames.forEach((eventName) => nativeRemoveEventListener(eventTarget, eventName, listenerWithMonitor, options))
}
```

**Step 4: Remove the now-unused import of `getZoneJsOriginalValue`** if it's no longer referenced in this file.

**Step 5: Run the existing addEventListener tests**

```bash
yarn test:unit --spec packages/core/src/browser/addEventListener.spec.ts
```

Expected: PASS.

**Step 6: Typecheck**

```bash
yarn typecheck
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/core/src/browser/addEventListener.ts
git commit -m "♻️ migrate core/browser/addEventListener.ts to use @datadog/browser-native"
```

---

### Task 12: Migrate remaining callsites in `core/src/browser/`

**Files:**

- Modify: `packages/core/src/browser/runOnReadyState.ts`
- Modify: `packages/core/src/browser/pageMayExitObservable.ts`

**Step 1: Migrate `runOnReadyState.ts`**

Add import:

```ts
import { getReadyState } from '@datadog/browser-native'
```

Replace `document.readyState` (line 10):

```ts
// Before:
if (document.readyState === expectedReadyState || document.readyState === 'complete') {
// After:
if (getReadyState() === expectedReadyState || getReadyState() === 'complete') {
```

**Step 2: Migrate `pageMayExitObservable.ts`**

Add import:

```ts
import { getVisibilityState } from '@datadog/browser-native'
```

Replace `document.visibilityState` (line 31):

```ts
// Before:
if (event.type === DOM_EVENT.VISIBILITY_CHANGE && document.visibilityState === 'hidden') {
// After:
if (event.type === DOM_EVENT.VISIBILITY_CHANGE && getVisibilityState() === 'hidden') {
```

**Step 3: Run all core browser tests**

```bash
yarn test:unit --spec packages/core/src/browser/
```

Expected: PASS.

**Step 4: Typecheck**

```bash
yarn typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/core/src/browser/runOnReadyState.ts packages/core/src/browser/pageMayExitObservable.ts
git commit -m "♻️ migrate remaining core/browser/ callsites to @datadog/browser-native"
```

---

### Task 13: Full test suite and lint

Run the full test suite and lint to make sure nothing is broken.

**Step 1: Run all unit tests**

```bash
yarn test:unit
```

Expected: PASS.

**Step 2: Run typecheck**

```bash
yarn typecheck
```

Expected: PASS.

**Step 3: Run lint**

```bash
yarn lint
```

Fix any lint issues.

**Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "🚨 fix lint issues after browser-native migration"
```

---

## Out of scope

- Adding `mockable()` wrapping to the exported functions (follow-up)
- Expanding scope to `packages/rum-core/src/browser/` callsites (follow-up)
- Rerouting BrowserStack test scope (follow-up)
- Moving/unifying `getZoneJsOriginalValue` and `globalObject` from core to browser-native (follow-up)
