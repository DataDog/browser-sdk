# browser-views-next Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `@datadog/browser-views-next` — the view tracking module for v8, covering automatic SPA navigation detection and a manual `startView()` public API.

**Architecture:** Three entrypoints following the v8 module pattern. `/collectors` publishes `resource:navigation` (initial load, History API, BFCache). `/processor` registers a `navigationEnricher` that adds `viewId` then a processor that publishes `observation:view` + `signal:view_changed`. Default export exposes `ViewsPublicApi` with `startView(name?)` which publishes `action:start_view`.

**Tech Stack:** TypeScript, Karma/Jasmine unit tests, `@datadog/core-next` Pipeline, `crypto.randomUUID()` for view IDs.

---

## Task 1: Package scaffold

**Files:**

- Create: `packages/browser-views-next/package.json`
- Create: `packages/browser-views-next/tsdown.config.ts`
- Modify: `tsconfig.base.json`
- Modify: `packages/browser-sdk/package.json`

**Step 1: Create `packages/browser-views-next/package.json`**

```json
{
  "name": "@datadog/browser-views-next",
  "version": "0.0.0",
  "license": "Apache-2.0",
  "main": "dist/index.cjs",
  "module": "dist/index.mjs",
  "types": "dist/index.d.cts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./collectors": {
      "import": { "types": "./dist/collectors/index.d.mts", "default": "./dist/collectors/index.mjs" },
      "require": { "types": "./dist/collectors/index.d.cts", "default": "./dist/collectors/index.cjs" }
    },
    "./processor": {
      "import": { "types": "./dist/processor/index.d.mts", "default": "./dist/processor/index.mjs" },
      "require": { "types": "./dist/processor/index.d.cts", "default": "./dist/processor/index.cjs" }
    }
  },
  "sideEffects": false,
  "scripts": {
    "build": "tsdown"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/DataDog/browser-sdk.git",
    "directory": "packages/browser-views-next"
  },
  "volta": {
    "extends": "../../package.json"
  },
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "@datadog/core-next": "workspace:*"
  }
}
```

**Step 2: Create `packages/browser-views-next/tsdown.config.ts`**

```typescript
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/collectors/index.ts', 'src/processor/index.ts'],
  format: ['esm', 'cjs'],
  dts: { build: true },
  clean: true,
})
```

**Step 3: Add path mappings to `tsconfig.base.json`**

In the `paths` block, after `@datadog/browser-logs-next/processor`, add:

```json
"@datadog/browser-views-next": ["./packages/browser-views-next/src"],
"@datadog/browser-views-next/collectors": ["./packages/browser-views-next/src/collectors"],
"@datadog/browser-views-next/processor": ["./packages/browser-views-next/src/processor"],
```

**Step 4: Add `@datadog/browser-views-next` as dependency of `browser-sdk`**

In `packages/browser-sdk/package.json`, add to `dependencies`:

```json
"@datadog/browser-views-next": "workspace:*"
```

**Step 5: Verify the package is recognized**

Run: `yarn typecheck 2>&1 | grep "browser-views" | head -5`
Expected: no output (no errors referencing the new package)

---

## Task 2: Event types

**Files:**

- Create: `packages/browser-views-next/src/types.ts`

**Step 1: Create `packages/browser-views-next/src/types.ts`**

```typescript
export type ViewLoadingType = 'initial_load' | 'route_change' | 'bf_cache'

export interface NavigationResource {
  url: string
  startTime: number
  startDate: number
  referrer: string
  loadingType: ViewLoadingType
  name?: string
}

export interface StartViewAction {
  url: string
  startTime: number
  startDate: number
  referrer: string
  loadingType: 'route_change'
  name?: string
}

export interface ViewObservation {
  id: string
  url: string
  referrer: string
  loadingType: ViewLoadingType
  startTime: number
  startDate: number
  name?: string
}

export interface ViewChangedSignal {
  viewId: string
}

// Extend the shared pipeline event map
declare module '@datadog/core-next' {
  interface SdkEventMap {
    'resource:navigation': NavigationResource
    'action:start_view': StartViewAction
    'observation:view': ViewObservation
    'signal:view_changed': ViewChangedSignal
  }
}
```

**Step 2: Commit**

```bash
git add packages/browser-views-next/ tsconfig.base.json packages/browser-sdk/package.json
git commit -m "📦 scaffold browser-views-next package"
```

---

## Task 3: initialViewCollector

**Files:**

- Create: `packages/browser-views-next/src/initialViewCollector.ts`
- Create: `packages/browser-views-next/src/initialViewCollector.spec.ts`

**Step 1: Write the failing test**

```typescript
// packages/browser-views-next/src/initialViewCollector.spec.ts
import { Pipeline } from '@datadog/core-next'
import { startInitialViewCollection } from './initialViewCollector'
import type { NavigationResource } from './types'

describe('startInitialViewCollection', () => {
  it('publishes resource:navigation once with initial_load on start', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const collected: NavigationResource[] = []
    pipeline.subscribe('resource:navigation', (e) => collected.push(e as NavigationResource))
    pipeline.seal()

    startInitialViewCollection(pipeline)
    await new Promise((r) => setTimeout(r, 0))

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('initial_load')
    expect(collected[0].url).toBe(window.location.href)
    expect(collected[0].referrer).toBe(document.referrer)
    expect(collected[0].startTime).toBe(0)
    expect(collected[0].startDate).toBe(Math.round(performance.timeOrigin))
  })

  it('does not publish more than once', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const collected: NavigationResource[] = []
    pipeline.subscribe('resource:navigation', (e) => collected.push(e as NavigationResource))
    pipeline.seal()

    startInitialViewCollection(pipeline)
    startInitialViewCollection(pipeline)
    await new Promise((r) => setTimeout(r, 0))

    expect(collected.length).toBe(1)
  })
})
```

**Step 2: Run test — expect it to fail**

```bash
yarn test:unit --spec packages/browser-views-next/src/initialViewCollector.spec.ts
```

Expected: fail with "Cannot find module './initialViewCollector'"

**Step 3: Implement `initialViewCollector.ts`**

```typescript
// packages/browser-views-next/src/initialViewCollector.ts
import type { Pipeline } from '@datadog/core-next'
import type { NavigationResource } from './types'

function startInitialViewCollection(pipeline: Pipeline<Record<string, unknown>>): void {
  const resource: NavigationResource = {
    url: window.location.href,
    startTime: 0,
    startDate: Math.round(performance.timeOrigin),
    referrer: document.referrer,
    loadingType: 'initial_load',
  }
  pipeline.publish('resource:navigation', resource)
}

export { startInitialViewCollection }
```

**Step 4: Run test — expect it to pass**

```bash
yarn test:unit --spec packages/browser-views-next/src/initialViewCollector.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/browser-views-next/src/initialViewCollector.ts packages/browser-views-next/src/initialViewCollector.spec.ts
git commit -m "✅ add initialViewCollector"
```

---

## Task 4: navigationCollector

**Files:**

- Create: `packages/browser-views-next/src/navigationCollector.ts`
- Create: `packages/browser-views-next/src/navigationCollector.spec.ts`

**Step 1: Write the failing tests**

```typescript
// packages/browser-views-next/src/navigationCollector.spec.ts
import { Pipeline } from '@datadog/core-next'
import { startNavigationCollection } from './navigationCollector'
import type { NavigationResource } from './types'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startNavigationCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let collected: NavigationResource[]
  let stop: () => void

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    collected = []
    pipeline.subscribe('resource:navigation', (e) => collected.push(e as NavigationResource))
    pipeline.seal()
  })

  afterEach(() => {
    stop?.()
  })

  it('publishes route_change when pathname changes via pushState', async () => {
    stop = startNavigationCollection(pipeline)
    const originalHref = window.location.href

    history.pushState({}, '', '/new-path')
    await tick()

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('route_change')
    expect(collected[0].url).toContain('/new-path')
    expect(collected[0].referrer).toBe(originalHref)

    history.pushState({}, '', '/')
  })

  it('does not publish when only query string changes via pushState', async () => {
    stop = startNavigationCollection(pipeline)

    history.pushState({}, '', '?foo=bar')
    await tick()

    expect(collected.length).toBe(0)

    history.pushState({}, '', '/')
  })

  it('publishes route_change on popstate when pathname changes', async () => {
    history.pushState({}, '', '/page-a')
    history.pushState({}, '', '/page-b')
    stop = startNavigationCollection(pipeline)

    history.back()
    await tick()

    // popstate fires asynchronously — wait a bit
    await new Promise((r) => setTimeout(r, 100))

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('route_change')

    history.pushState({}, '', '/')
  })

  it('publishes bf_cache on pageshow with persisted=true', async () => {
    stop = startNavigationCollection(pipeline)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await tick()

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('bf_cache')
  })

  it('does not publish on pageshow with persisted=false', async () => {
    stop = startNavigationCollection(pipeline)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    await tick()

    expect(collected.length).toBe(0)
  })

  it('restores original pushState and replaceState on stop', () => {
    const originalPushState = history.pushState
    stop = startNavigationCollection(pipeline)
    expect(history.pushState).not.toBe(originalPushState)

    stop()
    expect(history.pushState).toBe(originalPushState)
  })
})
```

**Step 2: Run test — expect it to fail**

```bash
yarn test:unit --spec packages/browser-views-next/src/navigationCollector.spec.ts
```

Expected: fail with "Cannot find module './navigationCollector'"

**Step 3: Implement `navigationCollector.ts`**

```typescript
// packages/browser-views-next/src/navigationCollector.ts
import type { Pipeline } from '@datadog/core-next'
import type { NavigationResource, ViewLoadingType } from './types'

function hasViewChanged(currentHref: string, newHref: string): boolean {
  try {
    const current = new URL(currentHref)
    const next = new URL(newHref)
    if (current.pathname !== next.pathname) return true
    // Treat hash-based routing (#/path) as a view change
    const currentHashPath = current.hash.startsWith('#/') ? current.hash : ''
    const nextHashPath = next.hash.startsWith('#/') ? next.hash : ''
    return currentHashPath !== nextHashPath
  } catch {
    return currentHref !== newHref
  }
}

function startNavigationCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  let currentUrl = window.location.href

  function publishNavigation(loadingType: ViewLoadingType, startTime: number): void {
    const newUrl = window.location.href
    const resource: NavigationResource = {
      url: newUrl,
      startTime,
      startDate: Date.now(),
      referrer: currentUrl,
      loadingType,
    }
    currentUrl = newUrl
    pipeline.publish('resource:navigation', resource)
  }

  // Patch pushState
  const originalPushState = history.pushState.bind(history)
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const startTime = performance.now()
    originalPushState(...args)
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', startTime)
    }
  }

  // Patch replaceState
  const originalReplaceState = history.replaceState.bind(history)
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const startTime = performance.now()
    originalReplaceState(...args)
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', startTime)
    }
  }

  // Listen to popstate (back/forward navigation)
  const handlePopstate = () => {
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', performance.now())
    }
  }

  // Listen to hashchange (hash-only routing)
  const handleHashchange = () => {
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', performance.now())
    }
  }

  // Listen to pageshow for BFCache restore
  const handlePageshow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      publishNavigation('bf_cache', performance.now())
    }
  }

  window.addEventListener('popstate', handlePopstate)
  window.addEventListener('hashchange', handleHashchange)
  window.addEventListener('pageshow', handlePageshow)

  return () => {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
    window.removeEventListener('popstate', handlePopstate)
    window.removeEventListener('hashchange', handleHashchange)
    window.removeEventListener('pageshow', handlePageshow)
  }
}

export { startNavigationCollection, hasViewChanged }
```

**Step 4: Run tests — expect them to pass**

```bash
yarn test:unit --spec packages/browser-views-next/src/navigationCollector.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/browser-views-next/src/navigationCollector.ts packages/browser-views-next/src/navigationCollector.spec.ts
git commit -m "✅ add navigationCollector"
```

---

## Task 5: collectors entrypoint

**Files:**

- Create: `packages/browser-views-next/src/collectors/index.ts`

**Step 1: Create `packages/browser-views-next/src/collectors/index.ts`**

```typescript
import type { Pipeline } from '@datadog/core-next'
import { startInitialViewCollection } from '../initialViewCollector'
import { startNavigationCollection } from '../navigationCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  startInitialViewCollection(pipeline)
  const stopNavigation = startNavigationCollection(pipeline)
  return stopNavigation
}

export { startCollectors }
```

**Step 2: Commit**

```bash
git add packages/browser-views-next/src/collectors/index.ts
git commit -m "📦 add views /collectors entrypoint"
```

---

## Task 6: navigationEnricher

**Files:**

- Create: `packages/browser-views-next/src/navigationEnricher.ts`
- Create: `packages/browser-views-next/src/navigationEnricher.spec.ts`

**Step 1: Write the failing tests**

```typescript
// packages/browser-views-next/src/navigationEnricher.spec.ts
import { Pipeline } from '@datadog/core-next'
import { navigationEnricher } from './navigationEnricher'

describe('navigationEnricher', () => {
  it('adds a viewId string to resource:navigation events', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const enriched: Record<string, unknown>[] = []

    pipeline.enrich('resource:navigation', navigationEnricher())
    pipeline.subscribe('resource:navigation', (e) => enriched.push(e as Record<string, unknown>))
    pipeline.seal()

    pipeline.publish('resource:navigation', {
      url: 'http://example.com/',
      startTime: 0,
      startDate: Date.now(),
      referrer: '',
      loadingType: 'initial_load',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(enriched.length).toBe(1)
    expect(typeof enriched[0].id).toBe('string')
    expect((enriched[0].id as string).length).toBeGreaterThan(0)
  })

  it('adds a different viewId for each event', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const enriched: Record<string, unknown>[] = []

    pipeline.enrich('resource:navigation', navigationEnricher())
    pipeline.subscribe('resource:navigation', (e) => enriched.push(e as Record<string, unknown>))
    pipeline.seal()

    const nav = {
      url: 'http://example.com/',
      startTime: 0,
      startDate: Date.now(),
      referrer: '',
      loadingType: 'route_change' as const,
    }
    pipeline.publish('resource:navigation', nav)
    pipeline.publish('resource:navigation', nav)
    await new Promise((r) => setTimeout(r, 0))

    expect(enriched[0].id).not.toBe(enriched[1].id)
  })

  it('adds viewId to action:start_view events too', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const enriched: Record<string, unknown>[] = []

    pipeline.enrich('action:start_view', navigationEnricher())
    pipeline.subscribe('action:start_view', (e) => enriched.push(e as Record<string, unknown>))
    pipeline.seal()

    pipeline.publish('action:start_view', {
      url: 'http://example.com/',
      startTime: performance.now(),
      startDate: Date.now(),
      referrer: '',
      loadingType: 'route_change' as const,
      name: 'checkout',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(typeof enriched[0].id).toBe('string')
  })
})
```

**Step 2: Run test — expect it to fail**

```bash
yarn test:unit --spec packages/browser-views-next/src/navigationEnricher.spec.ts
```

Expected: fail with "Cannot find module './navigationEnricher'"

**Step 3: Implement `navigationEnricher.ts`**

```typescript
// packages/browser-views-next/src/navigationEnricher.ts
import type { Enricher } from '@datadog/core-next'

function navigationEnricher(): Enricher<Record<string, unknown>, Record<string, unknown>, never> {
  return {
    name: 'navigationEnricher',
    transform(data) {
      return { ...data, id: crypto.randomUUID() }
    },
  }
}

export { navigationEnricher }
```

**Step 4: Run tests — expect them to pass**

```bash
yarn test:unit --spec packages/browser-views-next/src/navigationEnricher.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/browser-views-next/src/navigationEnricher.ts packages/browser-views-next/src/navigationEnricher.spec.ts
git commit -m "✅ add navigationEnricher"
```

---

## Task 7: processor (domain)

**Files:**

- Create: `packages/browser-views-next/src/domain/processor.ts`
- Create: `packages/browser-views-next/src/domain/processor.spec.ts`

**Step 1: Write the failing tests**

```typescript
// packages/browser-views-next/src/domain/processor.spec.ts
import { Pipeline } from '@datadog/core-next'
import { startProcessor } from './processor'
import type { ViewObservation, ViewChangedSignal } from '../types'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let observations: ViewObservation[]
  let signals: ViewChangedSignal[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    observations = []
    signals = []
    pipeline.subscribe('observation:view', (e) => observations.push(e as ViewObservation))
    pipeline.subscribe('signal:view_changed', (e) => signals.push(e as ViewChangedSignal))
    startProcessor(pipeline)
    pipeline.seal()
  })

  it('publishes observation:view from resource:navigation', async () => {
    pipeline.publish('resource:navigation', {
      id: 'view-1',
      url: 'http://example.com/home',
      startTime: 0,
      startDate: 1000,
      referrer: '',
      loadingType: 'initial_load',
    })
    await tick()

    expect(observations.length).toBe(1)
    expect(observations[0].id).toBe('view-1')
    expect(observations[0].url).toBe('http://example.com/home')
    expect(observations[0].loadingType).toBe('initial_load')
    expect(observations[0].startTime).toBe(0)
    expect(observations[0].startDate).toBe(1000)
  })

  it('publishes signal:view_changed from resource:navigation', async () => {
    pipeline.publish('resource:navigation', {
      id: 'view-abc',
      url: 'http://example.com/',
      startTime: 0,
      startDate: 1000,
      referrer: '',
      loadingType: 'initial_load',
    })
    await tick()

    expect(signals.length).toBe(1)
    expect(signals[0].viewId).toBe('view-abc')
  })

  it('publishes observation:view from action:start_view', async () => {
    pipeline.publish('action:start_view', {
      id: 'view-2',
      url: 'http://example.com/checkout',
      startTime: 500,
      startDate: 2000,
      referrer: 'http://example.com/home',
      loadingType: 'route_change',
      name: 'checkout',
    })
    await tick()

    expect(observations.length).toBe(1)
    expect(observations[0].id).toBe('view-2')
    expect(observations[0].name).toBe('checkout')
    expect(observations[0].loadingType).toBe('route_change')
  })

  it('publishes signal:view_changed from action:start_view', async () => {
    pipeline.publish('action:start_view', {
      id: 'view-xyz',
      url: 'http://example.com/',
      startTime: 0,
      startDate: 1000,
      referrer: '',
      loadingType: 'route_change',
    })
    await tick()

    expect(signals.length).toBe(1)
    expect(signals[0].viewId).toBe('view-xyz')
  })
})
```

**Step 2: Run test — expect it to fail**

```bash
yarn test:unit --spec packages/browser-views-next/src/domain/processor.spec.ts
```

Expected: fail with "Cannot find module './processor'"

**Step 3: Implement `domain/processor.ts`**

```typescript
// packages/browser-views-next/src/domain/processor.ts
import type { Pipeline } from '@datadog/core-next'
import type { NavigationResource, StartViewAction, ViewObservation, ViewChangedSignal } from '../types'

function toObservation(data: NavigationResource | (StartViewAction & { id: string })): ViewObservation {
  return {
    id: (data as any).id,
    url: data.url,
    referrer: data.referrer,
    loadingType: data.loadingType,
    startTime: data.startTime,
    startDate: data.startDate,
    name: data.name,
  }
}

function publishView(pipeline: Pipeline<Record<string, unknown>>, data: Record<string, unknown>): void {
  const viewId = data.id as string
  const observation = toObservation(data as any)
  const signal: ViewChangedSignal = { viewId }

  pipeline.publish('observation:view', observation)
  pipeline.publish('signal:view_changed', signal)
}

function startProcessor(pipeline: Pipeline<Record<string, unknown>>): void {
  pipeline.subscribe('resource:navigation', (data) => {
    publishView(pipeline, data as Record<string, unknown>)
  })

  pipeline.subscribe('action:start_view', (data) => {
    publishView(pipeline, data as Record<string, unknown>)
  })
}

export { startProcessor }
```

**Step 4: Run tests — expect them to pass**

```bash
yarn test:unit --spec packages/browser-views-next/src/domain/processor.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/browser-views-next/src/domain/processor.ts packages/browser-views-next/src/domain/processor.spec.ts
git commit -m "✅ add views processor"
```

---

## Task 8: processor entrypoint (Module + public API)

**Files:**

- Create: `packages/browser-views-next/src/processor/index.ts`
- Create: `packages/browser-views-next/src/processor/index.spec.ts`

**Step 1: Write the failing test**

```typescript
// packages/browser-views-next/src/processor/index.spec.ts
import { Pipeline } from '@datadog/core-next'
import { viewsProcessor } from './index'

describe('viewsProcessor', () => {
  it('has name "views"', () => {
    expect(viewsProcessor.name).toBe('views')
  })

  it('returns a public API with startView', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
    const api = viewsProcessor.init({ pipeline, config: {}, session: {} as any })
    expect(typeof (api as any).startView).toBe('function')
  })

  it('startView publishes action:start_view to the pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const actions: Record<string, unknown>[] = []
    pipeline.subscribe('action:start_view', (e) => actions.push(e as Record<string, unknown>))
    pipeline.seal()

    const api = viewsProcessor.init({ pipeline, config: {}, session: {} as any })
    ;(api as any).startView('my-view')

    await new Promise((r) => setTimeout(r, 0))

    expect(actions.length).toBe(1)
    expect(actions[0].name).toBe('my-view')
    expect(actions[0].loadingType).toBe('route_change')
    expect(actions[0].url).toBe(window.location.href)
    expect(typeof actions[0].startTime).toBe('number')
    expect(typeof actions[0].startDate).toBe('number')
  })
})
```

**Step 2: Run test — expect it to fail**

```bash
yarn test:unit --spec packages/browser-views-next/src/processor/index.spec.ts
```

Expected: fail with "Cannot find module './index'"

**Step 3: Implement `processor/index.ts`**

```typescript
// packages/browser-views-next/src/processor/index.ts
import type { Module, ModuleContext } from '@datadog/core-next'
import { navigationEnricher } from '../navigationEnricher'
import { startProcessor } from '../domain/processor'
import type { StartViewAction } from '../types'

interface ViewsPublicApi extends Record<string, unknown> {
  startView(name?: string): void
}

const viewsProcessor: Module = {
  name: 'views',
  extension: {
    key: 'views',
    validate: () => ({}),
  },
  init(context: ModuleContext): ViewsPublicApi {
    // Register enricher on both resource:navigation and action:start_view
    context.pipeline.enrich('resource:navigation', navigationEnricher())
    context.pipeline.enrich('action:start_view', navigationEnricher())

    // Start processor (resource:navigation + action:start_view → observation:view + signal:view_changed)
    startProcessor(context.pipeline)

    function handleStartView(name?: string): void {
      const action: StartViewAction = {
        url: window.location.href,
        startTime: performance.now(),
        startDate: Date.now(),
        referrer: '', // referrer for manual views is empty (no prior SPA navigation tracked here)
        loadingType: 'route_change',
        name,
      }
      context.pipeline.publish('action:start_view', action)
    }

    return {
      startView(name?: string) {
        handleStartView(name)
      },
    }
  },
}

export { viewsProcessor }
export type { ViewsPublicApi }
```

**Step 4: Run tests — expect them to pass**

```bash
yarn test:unit --spec packages/browser-views-next/src/processor/index.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/browser-views-next/src/processor/index.ts packages/browser-views-next/src/processor/index.spec.ts
git commit -m "✅ add views /processor entrypoint"
```

---

## Task 9: Default (public API types) entrypoint

**Files:**

- Create: `packages/browser-views-next/src/index.ts`

**Step 1: Create `packages/browser-views-next/src/index.ts`**

```typescript
export type { ViewsPublicApi } from './processor/index'
export type { ViewLoadingType, NavigationResource, ViewObservation, ViewChangedSignal } from './types'
```

**Step 2: Verify no type errors**

```bash
yarn typecheck 2>&1 | grep "browser-views" | head -10
```

Expected: no output

**Step 3: Commit**

```bash
git add packages/browser-views-next/src/index.ts
git commit -m "📦 add views default (types) entrypoint"
```

---

## Task 10: Wire into browser-sdk

**Files:**

- Modify: `packages/browser-sdk/src/domain/sdk.ts`
- Modify: `packages/browser-sdk/src/domain/moduleLoader.ts`

**Step 1: Add views collectors to `sdk.ts`**

In `packages/browser-sdk/src/domain/sdk.ts`, add to the imports:

```typescript
import { startCollectors as startViewCollectors } from '@datadog/browser-views-next/collectors'
```

In `createSdk`, after the existing collector starts (step 4.1), add:

```typescript
const stopViewCollectors = startViewCollectors(pipeline)
```

In `__stop`, add:

```typescript
stopViewCollectors()
```

**Step 2: Add views to MODULE_MAP in `moduleLoader.ts`**

```typescript
const MODULE_MAP: Record<string, string> = {
  rum: '@datadog/browser-rum-next/processor',
  logs: '@datadog/browser-logs-next/processor',
  views: '@datadog/browser-views-next/processor',
}
```

**Step 3: Verify typecheck passes**

```bash
yarn typecheck 2>&1 | grep "error TS" | grep -v "pipeline.spec.ts\|vite.config.ts\|assembly.ts" | head -20
```

Expected: no output

**Step 4: Run integration tests**

```bash
yarn test:unit --spec packages/browser-sdk/src/integration/logs.spec.ts
```

Expected: 6 tests PASS (existing tests still green, views collectors auto-start but don't affect logs)

**Step 5: Commit**

```bash
git add packages/browser-sdk/src/domain/sdk.ts packages/browser-sdk/src/domain/moduleLoader.ts
git commit -m "🔌 wire browser-views-next into browser-sdk"
```

---

## Task 11: Integration test for views

**Files:**

- Create: `packages/browser-sdk/src/integration/views.spec.ts`

**Step 1: Write the integration test**

```typescript
// packages/browser-sdk/src/integration/views.spec.ts
import { createSdk } from '../domain/sdk'
import { viewsProcessor } from '@datadog/browser-views-next/processor'
import { unregisterSdk } from '@datadog/core-next'
import type { ViewsPublicApi } from '@datadog/browser-views-next'

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function flushBatch(): void {
  const originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  if (originalVisibilityState) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityState)
  } else {
    delete (document as any).visibilityState
  }
}

describe('views integration', () => {
  let fetchSpy: jasmine.Spy
  let currentSdk: any

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 200 })))
    currentSdk = null
  })

  afterEach(() => {
    currentSdk?.__stop?.()
    unregisterSdk('default')
    delete (globalThis as any)._DD_SESSION
  })

  it('initial view: observation:view is sent on SDK init', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('"loadingType":"initial_load"')
    expect(body).toContain('"url"')
  })

  it('manual view: startView() sends observation:view with route_change', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    fetchSpy.calls.reset()

    const views = currentSdk!['views'] as ViewsPublicApi
    views.startView('checkout')

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('"loadingType":"route_change"')
    expect(body).toContain('"name":"checkout"')
  })

  it('view observation includes session.id from core enricher', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    await tick()
    flushBatch()

    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    const event = JSON.parse(body)
    expect(event.session).toBeDefined()
    expect(typeof event.session.id).toBe('string')
  })
})
```

**Step 2: Run the integration test**

```bash
yarn test:unit --spec packages/browser-sdk/src/integration/views.spec.ts
```

Expected: 3 tests PASS

**Step 3: Run all integration tests together**

```bash
yarn test:unit --spec "packages/browser-sdk/src/integration/*.spec.ts"
```

Expected: all PASS

**Step 4: Commit**

```bash
git add packages/browser-sdk/src/integration/views.spec.ts
git commit -m "✅ add views integration test"
```

---

## Task 12: Final typecheck

**Step 1: Run full typecheck**

```bash
yarn typecheck 2>&1 | grep "error TS" | grep -v "pipeline.spec.ts\|vite.config.ts\|assembly.ts"
```

Expected: no output (only the pre-existing errors in those excluded files)

**Step 2: Run all unit tests in the new package**

```bash
yarn test:unit --spec "packages/browser-views-next/src/**/*.spec.ts"
```

Expected: all PASS

**Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "🔍 browser-views-next: final cleanup and typecheck"
```
