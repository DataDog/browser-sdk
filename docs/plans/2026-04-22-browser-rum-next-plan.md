# browser-rum-next Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement core RUM events (resources, errors, long tasks) as a v8 product module, plus event routing in sdk.ts and Batch upsert for views.

**Architecture:** Two new packages: `browser-performance-next` (PerformanceObserver-based collector) and `browser-rum-next` (RUM processor module with enrichers and resource matcher). Event routing in `sdk.ts` splits observations between logs and RUM transports. Batch gains upsert for view event dedup.

**Tech Stack:** TypeScript, PerformanceObserver API, Jasmine/Karma tests, tsdown builds.

---

## Prerequisites

Run `yarn install` and `git submodule update --init` before starting.

All test commands use: `yarn test:unit --spec <path>`

Reference files for patterns:
- Collector pattern: `packages/browser-views-next/src/navigationCollector.ts`
- Module pattern: `packages/browser-views-next/src/processor/index.ts`
- Enricher pattern: `packages/core-next/src/domain/enricher/sessionEnricher.ts`
- Package scaffold: `packages/browser-views-next/package.json`
- SDK wiring: `packages/browser-sdk/src/domain/sdk.ts`

---

### Task 1: Add Batch.upsert() method

The Batch class only has `add()`. Views need upsert (replace previous event with same key). This is a prerequisite for event routing.

**Files:**
- Modify: `packages/core-next/src/domain/transport/batch.ts`
- Modify: `packages/core-next/src/domain/transport/batch.spec.ts`

**Step 1: Write the failing test**

Add to `batch.spec.ts`:

```typescript
it('upsert replaces a previous message with the same key', () => {
  const batch = new Batch({ maxSizeBytes: 4096, maxCount: 50, flushTimeoutMs: 30_000 })
  const flushed: string[][] = []
  batch.on('flush', (msgs) => flushed.push([...msgs]))

  batch.upsert('view-1', '{"id":"view-1","count":1}')
  batch.upsert('view-1', '{"id":"view-1","count":2}')
  batch.add('{"type":"error"}')
  batch.flush()

  expect(flushed.length).toBe(1)
  expect(flushed[0].length).toBe(2) // upserted view + error
  expect(flushed[0][0]).toBe('{"id":"view-1","count":2}')
  expect(flushed[0][1]).toBe('{"type":"error"}')
})

it('upsert counts size correctly after replacement', () => {
  const batch = new Batch({ maxSizeBytes: 100, maxCount: 50, flushTimeoutMs: 30_000 })
  const flushed: string[][] = []
  batch.on('flush', (msgs) => flushed.push([...msgs]))

  batch.upsert('k', 'aaaa') // 4 bytes
  batch.upsert('k', 'bb')   // replaces: now 2 bytes, not 6

  expect(flushed.length).toBe(0) // no flush, well under limit
})
```

**Step 2: Run test to verify it fails**

Run: `yarn test:unit --spec packages/core-next/src/domain/transport/batch.spec.ts`
Expected: FAIL — `batch.upsert is not a function`

**Step 3: Implement upsert**

In `batch.ts`, add a `Map<string, number>` to track keyed message indices, and an `upsert(key, message)` method:

```typescript
private keyedIndices = new Map<string, number>()

upsert(key: string, message: string): void {
  const messageSize = this.getSize(message)

  if (this.keyedIndices.has(key)) {
    const index = this.keyedIndices.get(key)!
    const oldSize = this.getSize(this.buffer[index])
    this.buffer[index] = message
    this.currentSize += messageSize - oldSize
    this.schedule()
    return
  }

  const hasMessages = this.buffer.length > 0
  const wouldExceedSize = this.currentSize + messageSize > this.options.maxSizeBytes
  const wouldExceedCount = this.buffer.length >= this.options.maxCount

  if (hasMessages && (wouldExceedSize || wouldExceedCount)) {
    this.flush()
  }

  this.keyedIndices.set(key, this.buffer.length)
  this.buffer.push(message)
  this.currentSize += messageSize
  this.schedule()
}
```

Clear `keyedIndices` in `flush()` and `destroy()`:

```typescript
flush(): void {
  if (this.buffer.length === 0) return
  this.emit('flush', this.buffer)
  this.buffer = []
  this.currentSize = 0
  this.keyedIndices.clear()
  this.cancel()
}

destroy(): void {
  this.cancel()
  this.buffer = []
  this.currentSize = 0
  this.keyedIndices.clear()
}
```

**Step 4: Run tests**

Run: `yarn test:unit --spec packages/core-next/src/domain/transport/batch.spec.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add packages/core-next/src/domain/transport/batch.ts packages/core-next/src/domain/transport/batch.spec.ts
git commit -m "✨ Add Batch.upsert() for keyed message replacement"
```

---

### Task 2: Add event routing in sdk.ts

Replace the hardcoded logs-only routing with type-based routing. Views and RUM observations go to the RUM transport, logs go to the logs transport.

**Files:**
- Modify: `packages/browser-sdk/src/domain/sdk.ts`
- Modify: `packages/browser-sdk/src/integration/logs.spec.ts`
- Modify: `packages/browser-sdk/src/integration/views.spec.ts`

**Step 1: Update the observation subscriber in sdk.ts**

Replace the `observation:*` subscriber block (around line 188) with routing logic:

```typescript
pipeline.subscribe('observation:*', (event, eventType) => {
  const record = event as Record<string, unknown>

  // beforeSend gate
  for (const mod of modules) {
    const moduleConfig = (config as Record<string, unknown>)[mod.name] as Record<string, unknown> | undefined
    const beforeSend = moduleConfig?.beforeSend as ((e: Record<string, unknown>) => boolean | void) | undefined
    if (beforeSend) {
      const result = beforeSend(record)
      if (result === false) return
    }
  }

  const serialized = JSON.stringify(event)

  // Route by event type
  if (eventType === 'observation:log') {
    batch.add(serialized)
    // flush to logs endpoint
  } else if (eventType === 'observation:view') {
    const viewId = (record as any).id as string
    rumBatch.upsert(viewId, serialized)
  } else {
    rumBatch.add(serialized)
  }
})
```

This requires a second Batch instance (`rumBatch`) and wiring its flush to the RUM transport. Create both batches and wire them:

```typescript
const logsBatch = new Batch({ maxSizeBytes: 16 * 1024, maxCount: 50, flushTimeoutMs: 30_000 })
const rumBatch = new Batch({ maxSizeBytes: 16 * 1024, maxCount: 50, flushTimeoutMs: 30_000 })

logsBatch.on('flush', (messages) => {
  const data = messages.join('\n')
  const payload = { data, bytesCount: new Blob([data]).size }
  transports.get('logs')?.send(payload)
  replicaTransports?.get('logs')?.send({ ...payload })
})

rumBatch.on('flush', (messages) => {
  const data = messages.join('\n')
  const payload = { data, bytesCount: new Blob([data]).size }
  transports.get('rum')?.send(payload)
  replicaTransports?.get('rum')?.send({ ...payload })
})
```

Update page exit / session expire to flush both batches. Update `__stop` to destroy both.

**Step 2: Check the Pipeline.subscribe callback signature**

The subscriber callback needs to receive the event type string as a second argument. Check `packages/core-next/src/domain/pipeline/pipeline.ts` to verify this is supported. If not, the routing can inspect event properties instead (e.g., check if event has `type: 'resource'` or look at the observation key).

Alternative approach without event type in callback: use separate subscribers:

```typescript
pipeline.subscribe('observation:log', (event) => {
  // ... beforeSend gate ...
  logsBatch.add(JSON.stringify(event))
})

pipeline.subscribe('observation:view', (event) => {
  // ... beforeSend gate ...
  const viewId = (event as any).id as string
  rumBatch.upsert(viewId, JSON.stringify(event))
})

pipeline.subscribe('observation:rum_*', (event) => {
  // ... beforeSend gate ...
  rumBatch.add(JSON.stringify(event))
})
```

This is cleaner — three specific subscribers instead of one with routing logic.

**Step 3: Update integration tests**

The views integration test currently asserts on `fetchSpy.calls.mostRecent()` which was the logs endpoint. After routing, views go to the RUM endpoint. Update the assertions to check the correct transport call.

The logs integration test should still work since logs still go to the logs transport.

**Step 4: Run tests**

Run: `yarn test:unit --spec packages/browser-sdk/src/integration/logs.spec.ts --spec packages/browser-sdk/src/integration/views.spec.ts --spec packages/browser-sdk/src/domain/sdk.spec.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add packages/browser-sdk/src/domain/sdk.ts packages/browser-sdk/src/integration/logs.spec.ts packages/browser-sdk/src/integration/views.spec.ts
git commit -m "✨ Add event routing: logs → logs transport, views/rum → rum transport"
```

---

### Task 3: Scaffold browser-performance-next package

**Files:**
- Create: `packages/browser-performance-next/package.json`
- Create: `packages/browser-performance-next/tsdown.config.ts`
- Create: `packages/browser-performance-next/src/index.ts`
- Create: `packages/browser-performance-next/src/collectors/index.ts`
- Create: `packages/browser-performance-next/src/types.ts`

**Step 1: Create package.json**

Follow the pattern from `browser-views-next/package.json`. Key fields:

```json
{
  "name": "@datadog/browser-performance-next",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.mjs", "types": "./dist/index.d.mts" },
    "./collectors": { "import": "./dist/collectors.mjs", "types": "./dist/collectors.d.mts" }
  },
  "peerDependencies": {
    "@datadog/core-next": "workspace:*"
  },
  "devDependencies": {
    "@datadog/core-next": "workspace:*",
    "tsdown": "latest",
    "typescript": "5.8.3"
  }
}
```

No `/processor` entrypoint — this is a collector-only package.

**Step 2: Create tsdown.config.ts**

```typescript
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', collectors: 'src/collectors/index.ts' },
  format: 'esm',
  dts: true,
})
```

**Step 3: Create types.ts**

Define the event types this collector publishes:

```typescript
interface ResourceTimingEntry {
  name: string
  entryType: 'resource'
  startTime: number
  duration: number
  initiatorType: string
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  responseStatus: number
  renderBlockingStatus?: string
  deliveryType?: string
  nextHopProtocol?: string
  // Timing phases
  redirectStart: number
  redirectEnd: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  connectEnd: number
  secureConnectionStart: number
  requestStart: number
  responseStart: number
  responseEnd: number
}

interface LongTaskEntry {
  entryType: 'longtask'
  startTime: number
  duration: number
}

interface LongAnimationFrameEntry {
  entryType: 'long-animation-frame'
  startTime: number
  duration: number
  blockingDuration: number
  renderStart: number
  styleAndLayoutStart: number
  firstUIEventTimestamp: number
  scripts: LongAnimationFrameScript[]
}

interface LongAnimationFrameScript {
  sourceURL: string
  sourceFunctionName: string
  invoker: string
  invokerType: string
  duration: number
  executionStart: number
  pauseDuration: number
  forcedStyleAndLayoutDuration: number
  windowAttribution: string
}

export type {
  ResourceTimingEntry,
  LongTaskEntry,
  LongAnimationFrameEntry,
  LongAnimationFrameScript,
}
```

**Step 4: Create stub collectors/index.ts and index.ts**

```typescript
// src/collectors/index.ts
import type { Pipeline } from '@datadog/core-next'

function startCollectors(_pipeline: Pipeline<Record<string, unknown>>): () => void {
  return () => {}
}

export { startCollectors }
```

```typescript
// src/index.ts
export type { ResourceTimingEntry, LongTaskEntry, LongAnimationFrameEntry, LongAnimationFrameScript } from './types'
```

**Step 5: Run `yarn install` to register the workspace**

**Step 6: Commit**

```
git add packages/browser-performance-next/
git commit -m "📦 Scaffold browser-performance-next package"
```

---

### Task 4: Implement resourceTimingCollector

**Files:**
- Create: `packages/browser-performance-next/src/resourceTimingCollector.ts`
- Create: `packages/browser-performance-next/src/resourceTimingCollector.spec.ts`
- Modify: `packages/browser-performance-next/src/collectors/index.ts`

**Step 1: Write the failing test**

```typescript
import { Pipeline } from '@datadog/core-next'
import { startResourceTimingCollection } from './resourceTimingCollector'
import type { ResourceTimingEntry } from './types'

describe('startResourceTimingCollection', () => {
  it('returns a cleanup function', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
    const stop = startResourceTimingCollection(pipeline)
    expect(typeof stop).toBe('function')
    stop()
  })
})
```

**Step 2: Implement the collector**

The collector creates a `PerformanceObserver` for `'resource'` entries (buffered) and publishes each as `resource:performance_entry`. On stop, it disconnects the observer.

```typescript
import type { Pipeline } from '@datadog/core-next'
import type { ResourceTimingEntry } from './types'

function startResourceTimingCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {}
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      pipeline.publish('resource:performance_entry', entry as unknown as ResourceTimingEntry)
    }
  })

  observer.observe({ type: 'resource', buffered: true })

  return () => {
    observer.disconnect()
  }
}

export { startResourceTimingCollection }
```

**Step 3: Wire into collectors/index.ts**

```typescript
import type { Pipeline } from '@datadog/core-next'
import { startResourceTimingCollection } from '../resourceTimingCollector'

function startCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const stopResources = startResourceTimingCollection(pipeline)
  return () => {
    stopResources()
  }
}

export { startCollectors }
```

**Step 4: Run tests, commit**

```
git commit -m "✨ Add resourceTimingCollector to browser-performance-next"
```

---

### Task 5: Implement longTaskCollector

**Files:**
- Create: `packages/browser-performance-next/src/longTaskCollector.ts`
- Create: `packages/browser-performance-next/src/longTaskCollector.spec.ts`
- Modify: `packages/browser-performance-next/src/collectors/index.ts`

**Step 1: Implement the collector**

Observes both `longtask` and `long-animation-frame` entry types. Publishes `resource:long_task` or `resource:long_animation_frame` respectively. Prefer `long-animation-frame` when supported, fall back to `longtask`.

```typescript
import type { Pipeline } from '@datadog/core-next'

function startLongTaskCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {}
  }

  const observers: PerformanceObserver[] = []

  // Try long-animation-frame first (richer data)
  try {
    const lafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pipeline.publish('resource:long_animation_frame', entry)
      }
    })
    lafObserver.observe({ type: 'long-animation-frame', buffered: true })
    observers.push(lafObserver)
  } catch {
    // Fallback to longtask
    try {
      const ltObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          pipeline.publish('resource:long_task', entry)
        }
      })
      ltObserver.observe({ type: 'longtask', buffered: true })
      observers.push(ltObserver)
    } catch {
      // Neither supported
    }
  }

  return () => {
    for (const observer of observers) {
      observer.disconnect()
    }
  }
}

export { startLongTaskCollection }
```

**Step 2: Wire into collectors/index.ts**

Add `startLongTaskCollection` alongside `startResourceTimingCollection`. Combine cleanups.

**Step 3: Add test, run, commit**

```
git commit -m "✨ Add longTaskCollector to browser-performance-next"
```

---

### Task 6: Add pipeline event types for performance entries

**Files:**
- Modify: `packages/core-next/src/domain/pipeline/events.ts`
- Modify: `packages/core-next/src/index.ts`

**Step 1: Add new resource types to SdkEventMap**

```typescript
// In events.ts, add to SdkEventMap:
'resource:performance_entry': unknown
'resource:long_task': unknown
'resource:long_animation_frame': unknown

// Add RUM observation types:
'observation:rum_resource': unknown
'observation:rum_error': unknown
'observation:rum_long_task': unknown
```

**Step 2: Commit**

```
git commit -m "🏷️ Add performance and RUM event types to SdkEventMap"
```

---

### Task 7: Scaffold browser-rum-next package

**Files:**
- Create: `packages/browser-rum-next/package.json`
- Create: `packages/browser-rum-next/tsdown.config.ts`
- Create: `packages/browser-rum-next/src/index.ts`
- Create: `packages/browser-rum-next/src/processor/index.ts`
- Create: `packages/browser-rum-next/src/domain/configuration.ts`

**Step 1: Create package.json**

Same pattern as browser-views-next. Three entrypoints: default, `/processor`, `/collectors`.

Peer dependencies: `@datadog/core-next`, `@datadog/browser-performance-next`.

**Step 2: Create configuration with extension**

RUM config fields: `trackResources` (boolean, default true), `trackLongTasks` (boolean, default true), `trackErrors` (boolean, default true).

**Step 3: Create stub processor/index.ts with Module interface**

```typescript
const rumProcessor: Module = {
  name: 'rum',
  extension: rumExtension,
  init(context: ModuleContext): RumPublicApi {
    // TODO: register enrichers, start processor
    return { addError() {}, getInternalContext() { return {} } }
  },
}
```

**Step 4: Run `yarn install`, commit**

```
git commit -m "📦 Scaffold browser-rum-next package"
```

---

### Task 8: Implement resourceMatcher

The core correlation logic. Buffers network requests, matches against performance entries.

**Files:**
- Create: `packages/browser-rum-next/src/domain/resourceMatcher.ts`
- Create: `packages/browser-rum-next/src/domain/resourceMatcher.spec.ts`

**Step 1: Write failing tests**

```typescript
describe('ResourceMatcher', () => {
  it('matches a network request to a performance entry by URL', () => { ... })
  it('returns undefined when no network request matches', () => { ... })
  it('removes matched entries from buffer', () => { ... })
  it('evicts entries older than 5 seconds', () => { ... })
  it('matches by timing proximity when multiple requests share URL', () => { ... })
})
```

**Step 2: Implement**

```typescript
class ResourceMatcher {
  private buffer = new Map<string, { resource: NetworkRequestResource; timestamp: number }[]>()
  private readonly TTL = 5_000

  add(resource: NetworkRequestResource): void {
    const key = resource.url
    if (!this.buffer.has(key)) this.buffer.set(key, [])
    this.buffer.get(key)!.push({ resource, timestamp: Date.now() })
    this.evict()
  }

  match(url: string, startTime: number): NetworkRequestResource | undefined {
    const entries = this.buffer.get(url)
    if (!entries || entries.length === 0) return undefined

    // Find closest by startTime
    let bestIndex = 0
    let bestDelta = Math.abs(entries[0].resource.startTime - startTime)
    for (let i = 1; i < entries.length; i++) {
      const delta = Math.abs(entries[i].resource.startTime - startTime)
      if (delta < bestDelta) { bestDelta = delta; bestIndex = i }
    }

    const matched = entries.splice(bestIndex, 1)[0]
    if (entries.length === 0) this.buffer.delete(url)
    return matched.resource
  }

  private evict(): void {
    const now = Date.now()
    for (const [url, entries] of this.buffer) {
      const filtered = entries.filter((e) => now - e.timestamp < this.TTL)
      if (filtered.length === 0) this.buffer.delete(url)
      else this.buffer.set(url, filtered)
    }
  }
}
```

**Step 3: Run tests, commit**

```
git commit -m "✨ Add ResourceMatcher for correlating performance entries with network requests"
```

---

### Task 9: Implement RUM processor

The core processor that transforms resources into RUM observations.

**Files:**
- Create: `packages/browser-rum-next/src/domain/processor.ts`
- Create: `packages/browser-rum-next/src/domain/processor.spec.ts`

**Step 1: Write failing tests**

```typescript
describe('startProcessor', () => {
  it('transforms resource:performance_entry into observation:rum_resource', async () => { ... })
  it('enriches rum_resource with matched network_request data', async () => { ... })
  it('publishes rum_resource without network match', async () => { ... })
  it('transforms resource:runtime_error into observation:rum_error', async () => { ... })
  it('transforms resource:long_task into observation:rum_long_task', async () => { ... })
  it('does not transform resources when config disables them', async () => { ... })
})
```

**Step 2: Implement**

The processor creates a `ResourceMatcher`, subscribes to pipeline events:

- `resource:network_request` → buffer in matcher
- `resource:performance_entry` → match, build observation:rum_resource, publish
- `resource:runtime_error` → build observation:rum_error, publish
- `resource:long_task` / `resource:long_animation_frame` → build observation:rum_long_task, publish

**Step 3: Run tests, commit**

```
git commit -m "✨ Add RUM processor: resources, errors, long tasks"
```

---

### Task 10: Implement RUM enrichers

Four enrichers for RUM-specific context.

**Files:**
- Create: `packages/browser-rum-next/src/domain/enrichers/viewContextEnricher.ts`
- Create: `packages/browser-rum-next/src/domain/enrichers/viewContextEnricher.spec.ts`
- Create: `packages/browser-rum-next/src/domain/enrichers/displayEnricher.ts`
- Create: `packages/browser-rum-next/src/domain/enrichers/displayEnricher.spec.ts`
- Create: `packages/browser-rum-next/src/domain/enrichers/connectivityEnricher.ts`
- Create: `packages/browser-rum-next/src/domain/enrichers/connectivityEnricher.spec.ts`
- Create: `packages/browser-rum-next/src/domain/enrichers/pageStateEnricher.ts`
- Create: `packages/browser-rum-next/src/domain/enrichers/pageStateEnricher.spec.ts`

Each enricher follows the `enricher()` factory pattern from core-next.

**viewContextEnricher**: Subscribes to `signal:view_changed` to track current view ID/name. Stamps `view: { id, name }` on RUM observations. Returns `SKIP` if no view is active.

**displayEnricher**: Reads `window.innerWidth`/`innerHeight`. Stamps `display: { viewport: { width, height } }`.

**connectivityEnricher**: Reads `navigator.connection`. Stamps `connectivity: { effective_type }` when available.

**pageStateEnricher**: Tracks `document.visibilityState`. Stamps `page_states` at event time.

Each enricher gets its own spec file. Test with pipeline + enricher chain.

**Commit each enricher separately:**

```
git commit -m "✨ Add viewContextEnricher for RUM observations"
git commit -m "✨ Add displayEnricher for viewport dimensions"
git commit -m "✨ Add connectivityEnricher for network type"
git commit -m "✨ Add pageStateEnricher for visibility state"
```

---

### Task 11: Wire RUM module init

Connect everything in the Module init function.

**Files:**
- Modify: `packages/browser-rum-next/src/processor/index.ts`
- Create: `packages/browser-rum-next/src/processor/index.spec.ts`

**Step 1: Implement full module init**

```typescript
const rumProcessor: Module = {
  name: 'rum',
  extension: rumExtension,
  init(context: ModuleContext): RumPublicApi {
    const globalContext = new ContextManager()
    const userContext = new ContextManager()
    const accountContext = new ContextManager()

    // Register RUM enrichers
    context.pipeline.enrich('observation:rum_*', viewContextEnricher(context.pipeline))
    context.pipeline.enrich('observation:rum_*', displayEnricher())
    context.pipeline.enrich('observation:rum_*', connectivityEnricher())
    context.pipeline.enrich('observation:rum_*', pageStateEnricher())

    // Start processor
    startProcessor({
      pipeline: context.pipeline,
      config: (context.config as any).rum,
      globalContext,
      userContext,
      accountContext,
    })

    return {
      addError(error, context?) { ... },
      getInternalContext() { ... },
      // context CRUD (same pattern as logs/views)
    }
  },
}
```

**Step 2: Test module init, public API**

**Step 3: Commit**

```
git commit -m "🔌 Wire browser-rum-next module init with enrichers and public API"
```

---

### Task 12: Wire performance collectors in sdk.ts

**Files:**
- Modify: `packages/browser-sdk/src/domain/sdk.ts`
- Modify: `packages/browser-sdk/package.json`

**Step 1: Add browser-performance-next as dependency**

**Step 2: Start performance collectors alongside existing collectors**

```typescript
import { startCollectors as startPerformanceCollectors } from '@datadog/browser-performance-next/collectors'

// In createSdk, after existing collectors:
const stopPerformanceCollectors = startPerformanceCollectors(pipeline)
```

Add to `__stop` cleanup.

**Step 3: Run all integration tests, commit**

```
git commit -m "🔌 Wire browser-performance-next collectors in SDK"
```

---

### Task 13: Add RUM integration test

End-to-end test: SDK with RUM module loaded, verify observations reach the RUM transport.

**Files:**
- Create: `packages/browser-sdk/src/integration/rum.spec.ts`

**Step 1: Write integration test**

Test that:
- Performance entries produce `observation:rum_resource` sent to RUM endpoint
- Runtime errors produce `observation:rum_error` sent to RUM endpoint
- RUM observations include view context
- Logs still go to logs endpoint when both modules loaded

**Step 2: Run, commit**

```
git commit -m "✅ Add RUM integration tests"
```

---

## Summary

| Task | Description | Depends on |
|------|-------------|------------|
| 1 | Batch.upsert() | — |
| 2 | Event routing in sdk.ts | 1 |
| 3 | Scaffold browser-performance-next | — |
| 4 | resourceTimingCollector | 3 |
| 5 | longTaskCollector | 3 |
| 6 | Pipeline event types | — |
| 7 | Scaffold browser-rum-next | 6 |
| 8 | ResourceMatcher | 7 |
| 9 | RUM processor | 7, 8 |
| 10 | RUM enrichers (4x) | 7 |
| 11 | Wire RUM module init | 9, 10 |
| 12 | Wire performance collectors in sdk.ts | 2, 4, 5 |
| 13 | RUM integration test | 11, 12 |

Tasks 1, 3, and 6 can start in parallel. Tasks 4-5 depend on 3. Tasks 8-10 depend on 7. Task 13 is the final integration checkpoint.
