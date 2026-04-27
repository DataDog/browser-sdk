# View Metrics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Core Web Vitals (FCP, LCP, CLS, INP) and navigation timings to the v8 RUM view processor, with all metric data flowing through the pipeline.

**Architecture:** The performance collector expands to observe 6 new PerformanceObserver entry types and publish them to the pipeline. The view processor is rewritten from a stateless transformer to a stateful accumulator that subscribes to metric events, writes into a `currentView` object, and publishes `observation:view` on each change.

**Tech Stack:** TypeScript, PerformanceObserver API, Jasmine/Karma tests.

---

## Prerequisites

- Design doc: `docs/plans/2026-04-22-view-metrics-design.md`
- Test command: `yarn test:unit --spec <path>`
- Current performance collector: `packages/browser-rum-next/src/performance/`
- Current view processor: `packages/browser-rum-next/src/views/processor.ts`
- Pipeline event types: `packages/core-next/src/domain/pipeline/events.ts`

---

### Task 1: Add new pipeline event types for web vitals

**Files:**
- Modify: `packages/core-next/src/domain/pipeline/events.ts`

**Step 1:** Add 6 new event types to `SdkEventMap`:

```typescript
'resource:paint': unknown
'resource:largest_contentful_paint': unknown
'resource:layout_shift': unknown
'resource:performance_event': unknown
'resource:first_input': unknown
'resource:navigation_timing': unknown
```

Add them after the existing `resource:long_animation_frame` entry.

**Step 2:** Commit:
```
git commit -m "🏷️ Add web vital pipeline event types to SdkEventMap"
```

---

### Task 2: Expand performance collector with web vital observers

**Files:**
- Modify: `packages/browser-rum-next/src/performance/resourceTimingCollector.ts` → rename to `packages/browser-rum-next/src/performance/performanceCollector.ts` (it now observes all entry types, not just resource timing)
- Create: `packages/browser-rum-next/src/performance/performanceCollector.spec.ts`
- Modify: `packages/browser-rum-next/src/performance/collectors.ts` — update import
- Delete: `packages/browser-rum-next/src/performance/resourceTimingCollector.ts` + spec
- Delete: `packages/browser-rum-next/src/performance/longTaskCollector.ts` + spec (merged into single collector)

**Step 1: Write the new collector**

A single `startPerformanceCollection` function that creates one `PerformanceObserver` per entry type. Each observer publishes to a typed pipeline event. All use `buffered: true`.

```typescript
import type { Pipeline } from '@datadog/core-next'

function startPerformanceCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}

  const observers: PerformanceObserver[] = []

  function observe(type: string, eventType: string, options?: Record<string, unknown>): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          pipeline.publish(eventType, entry)
        }
      })
      observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit)
      observers.push(observer)
    } catch {
      // Entry type not supported in this browser
    }
  }

  observe('resource', 'resource:performance_entry')
  observe('paint', 'resource:paint')
  observe('largest-contentful-paint', 'resource:largest_contentful_paint')
  observe('layout-shift', 'resource:layout_shift')
  observe('event', 'resource:performance_event', { durationThreshold: 40 })
  observe('first-input', 'resource:first_input')
  observe('navigation', 'resource:navigation_timing')

  // Long tasks: prefer long-animation-frame, fall back to longtask
  try {
    const lafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pipeline.publish('resource:long_animation_frame', entry)
      }
    })
    lafObserver.observe({ type: 'long-animation-frame', buffered: true })
    observers.push(lafObserver)
  } catch {
    observe('longtask', 'resource:long_task')
  }

  return () => {
    for (const observer of observers) observer.disconnect()
  }
}

export { startPerformanceCollection }
```

**Step 2: Write test**

Basic test — verify it returns a cleanup function and doesn't throw. PerformanceObserver is a real browser API, so we test structure, not observation behavior. The metric-specific tests are in the view processor.

**Step 3: Update `collectors.ts`**

Replace the two separate imports with the single `startPerformanceCollection`.

**Step 4: Delete old files** (`resourceTimingCollector.ts`, `resourceTimingCollector.spec.ts`, `longTaskCollector.ts`, `longTaskCollector.spec.ts`)

**Step 5: Run tests, commit:**
```
git commit -m "♻️ Consolidate performance observers into single collector"
```

---

### Task 3: Add view metrics types

**Files:**
- Modify: `packages/browser-rum-next/src/views/types.ts`

**Step 1:** Add metric types to the view types file:

```typescript
export interface LargestContentfulPaint {
  value: number
  targetSelector?: string
}

export interface CumulativeLayoutShift {
  value: number
  targetSelector?: string
}

export interface InteractionToNextPaint {
  value: number
  targetSelector?: string
}

export interface NavigationTimings {
  domComplete: number
  domContentLoaded: number
  domInteractive: number
  loadEvent: number
  firstByte: number
}
```

**Step 2:** Update `ViewObservation` to include optional metric fields:

```typescript
export interface ViewObservation {
  id: string
  url: string
  referrer: string
  loadingType: ViewLoadingType
  startTime: number
  startDate: number
  date: number
  duration: number
  documentVersion: number
  isActive: boolean
  name?: string

  // Core Web Vitals
  firstContentfulPaint?: number
  largestContentfulPaint?: LargestContentfulPaint
  cumulativeLayoutShift?: CumulativeLayoutShift
  interactionToNextPaint?: InteractionToNextPaint

  // Navigation timings (initial load only)
  navigationTimings?: NavigationTimings

  [key: string]: unknown
}
```

**Step 3:** Commit:
```
git commit -m "🏷️ Add view metric types"
```

---

### Task 4: Implement CLS tracker

CLS is the most self-contained metric. Good first one to implement.

**Files:**
- Create: `packages/browser-rum-next/src/views/metrics/trackCls.ts`
- Create: `packages/browser-rum-next/src/views/metrics/trackCls.spec.ts`

**Step 1: Write failing tests**

```typescript
describe('trackCls', () => {
  it('computes CLS from layout-shift entries without recent input', () => { ... })
  it('ignores layout-shift entries with recent input', () => { ... })
  it('uses sliding session window: starts new window after 1s gap', () => { ... })
  it('uses sliding session window: starts new window after 5s max duration', () => { ... })
  it('reports the maximum window value', () => { ... })
  it('returns undefined when no shifts occurred', () => { ... })
})
```

The tests call `trackCls()` directly with mock layout-shift entries (no pipeline needed). The function accumulates entries and returns the current CLS value.

**Step 2: Implement**

```typescript
interface ClsState {
  value: number
  targetSelector?: string
}

interface ClsTracker {
  process(entry: { value: number; hadRecentInput: boolean; startTime: number; sources?: Array<{ node?: Element }> }): void
  get(): ClsState | undefined
}

function trackCls(): ClsTracker {
  let maxSessionValue = 0
  let currentSessionValue = 0
  let currentSessionStart = 0
  let previousEntryTime = 0
  let largestShiftTarget: Element | undefined

  // ... sliding window logic ...

  return {
    process(entry) { /* accumulate */ },
    get() { return maxSessionValue > 0 ? { value: maxSessionValue, targetSelector: ... } : undefined }
  }
}
```

**Step 3: Run tests, commit:**
```
git commit -m "✨ Add CLS tracker with sliding session window algorithm"
```

---

### Task 5: Implement FCP tracker

**Files:**
- Create: `packages/browser-rum-next/src/views/metrics/trackFcp.ts`
- Create: `packages/browser-rum-next/src/views/metrics/trackFcp.spec.ts`

Simple tracker. Filters `resource:paint` entries for `name === 'first-contentful-paint'`. Returns the `startTime`. Discards entries > 600_000ms (10 minutes — stale buffered entry).

```typescript
interface FcpTracker {
  process(entry: { name: string; startTime: number }): void
  get(): number | undefined
}
```

Tests:
- Returns startTime for first-contentful-paint entry
- Ignores other paint types
- Discards entries > 10 minutes
- Only keeps the first value (subsequent are ignored)

Commit: `✨ Add FCP tracker`

---

### Task 6: Implement LCP tracker

**Files:**
- Create: `packages/browser-rum-next/src/views/metrics/trackLcp.ts`
- Create: `packages/browser-rum-next/src/views/metrics/trackLcp.spec.ts`

Each `largest-contentful-paint` entry replaces the previous value (browser reports progressively larger elements). Tracking stops after first user interaction or visibility change.

```typescript
interface LcpTracker {
  process(entry: { startTime: number; size: number; element?: Element }): void
  stop(): void  // called on first interaction or visibility hidden
  get(): LargestContentfulPaint | undefined
}
```

Tests:
- Returns latest entry (progressive replacement)
- Ignores entries after stop() is called
- Returns undefined when no entries

Commit: `✨ Add LCP tracker`

---

### Task 7: Implement INP tracker

**Files:**
- Create: `packages/browser-rum-next/src/views/metrics/trackInp.ts`
- Create: `packages/browser-rum-next/src/views/metrics/trackInp.spec.ts`

Maintains top 10 longest interactions by duration. Reports P98 value. Processes both `resource:performance_event` and `resource:first_input` entries.

```typescript
interface InpTracker {
  process(entry: { duration: number; startTime: number; processingStart: number; processingEnd: number; target?: Element; interactionId?: number }): void
  get(): InteractionToNextPaint | undefined
}
```

Key logic:
- Group entries by `interactionId` (multiple events per interaction — take max duration)
- Maintain sorted list of top 10 longest interactions
- P98 = longest interaction (with 10 entries, `floor(length - 1 - length * 0.02)` = index 9 = last)

Tests:
- Tracks top 10 longest interactions
- Groups entries by interactionId
- Returns P98 value
- Handles fewer than 10 interactions
- Returns undefined with no interactions

Commit: `✨ Add INP tracker with P98 computation`

---

### Task 8: Implement navigation timings tracker

**Files:**
- Create: `packages/browser-rum-next/src/views/metrics/trackNavigationTimings.ts`
- Create: `packages/browser-rum-next/src/views/metrics/trackNavigationTimings.spec.ts`

Extracts timing phases from `PerformanceNavigationTiming` entry.

```typescript
interface NavTimingsTracker {
  process(entry: PerformanceNavigationTiming): void
  get(): NavigationTimings | undefined
}
```

Extracts: `responseStart` → firstByte, `domInteractive`, `domContentLoadedEventEnd` → domContentLoaded, `domComplete`, `loadEventEnd` → loadEvent.

Tests:
- Extracts all 5 timing values from navigation entry
- Only keeps the first entry (subsequent ignored)
- Returns undefined before any entry

Commit: `✨ Add navigation timings tracker`

---

### Task 9: Rewrite view processor with metric accumulation

This is the main task. The view processor becomes stateful.

**Files:**
- Rewrite: `packages/browser-rum-next/src/views/processor.ts`
- Rewrite: `packages/browser-rum-next/src/views/processor.spec.ts`

**Step 1: Rewrite the processor**

The processor maintains a `currentView` object. On navigation/startView, it finalizes the old view and creates a new one. Metric pipeline events write into `currentView` via the trackers. Each write publishes `observation:view`.

```typescript
function startProcessor({ pipeline }: ProcessorDependencies): void {
  let currentView: ViewObservation | undefined
  let clsTracker: ClsTracker
  let fcpTracker: FcpTracker
  let lcpTracker: LcpTracker
  let inpTracker: InpTracker
  let navTimingsTracker: NavTimingsTracker

  function createView(data: Record<string, unknown>): void {
    // Finalize previous view
    if (currentView) {
      currentView.isActive = false
      currentView.duration = performance.now() - currentView.startTime
      currentView.documentVersion++
      pipeline.publish('observation:view', { ...currentView })
    }

    // Create new view + reset trackers
    clsTracker = trackCls()
    fcpTracker = trackFcp()
    lcpTracker = trackLcp()
    inpTracker = trackInp()
    navTimingsTracker = trackNavigationTimings()

    currentView = {
      id: data.id as string,
      url: data.url as string,
      referrer: data.referrer as string,
      loadingType: data.loadingType as ViewLoadingType,
      startTime: data.startTime as number,
      startDate: data.startDate as number,
      date: data.startDate as number,
      name: data.name as string | undefined,
      duration: 0,
      documentVersion: 0,
      isActive: true,
    }

    publishUpdate()
    pipeline.publish('signal:view_changed', { viewId: currentView.id })
  }

  function publishUpdate(): void {
    if (!currentView) return
    currentView.duration = performance.now() - currentView.startTime
    currentView.documentVersion++

    // Collect current metric values
    currentView.cumulativeLayoutShift = clsTracker.get()
    currentView.interactionToNextPaint = inpTracker.get()
    if (currentView.loadingType === 'initial_load') {
      currentView.firstContentfulPaint = fcpTracker.get()
      currentView.largestContentfulPaint = lcpTracker.get()
      currentView.navigationTimings = navTimingsTracker.get()
    }

    pipeline.publish('observation:view', { ...currentView })
  }

  // Navigation events → new view
  pipeline.subscribe('resource:navigation', (data) => createView(data as Record<string, unknown>))
  pipeline.subscribe('action:start_view', (data) => createView(data as Record<string, unknown>))

  // Metric events → accumulate + publish
  pipeline.subscribe('resource:paint', (data) => {
    const entry = data as { name: string; startTime: number }
    if (entry.name !== 'first-contentful-paint') return
    fcpTracker.process(entry)
    publishUpdate()
  })

  pipeline.subscribe('resource:largest_contentful_paint', (data) => {
    lcpTracker.process(data as any)
    publishUpdate()
  })

  pipeline.subscribe('resource:layout_shift', (data) => {
    const entry = data as { value: number; hadRecentInput: boolean; startTime: number; sources?: any[] }
    if (entry.hadRecentInput) return
    clsTracker.process(entry)
    publishUpdate()
  })

  pipeline.subscribe('resource:performance_event', (data) => {
    inpTracker.process(data as any)
    // First interaction stops LCP tracking
    lcpTracker.stop()
    publishUpdate()
  })

  pipeline.subscribe('resource:first_input', (data) => {
    inpTracker.process(data as any)
    lcpTracker.stop()
    publishUpdate()
  })

  pipeline.subscribe('resource:navigation_timing', (data) => {
    navTimingsTracker.process(data as any)
    publishUpdate()
  })
}
```

**Step 2: Write tests**

Tests use the pipeline directly. Publish metric events, verify `observation:view` includes the accumulated metrics.

```typescript
describe('view processor with metrics', () => {
  // Existing tests (navigation → observation:view, action:start_view → observation:view) still pass

  it('accumulates FCP on initial load', async () => {
    pipeline.publish('resource:navigation', { id: 'v1', url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:paint', { name: 'first-contentful-paint', startTime: 450 })
    await tick()
    // Latest observation:view should include firstContentfulPaint: 450
  })

  it('accumulates CLS from layout shifts', async () => { ... })
  it('accumulates LCP from largest contentful paint entries', async () => { ... })
  it('accumulates INP from performance events', async () => { ... })
  it('accumulates navigation timings on initial load', async () => { ... })
  it('does not accumulate FCP/LCP/navTimings on route_change', async () => { ... })
  it('stops LCP after first interaction', async () => { ... })
  it('increments documentVersion on each update', async () => { ... })
  it('finalizes previous view when new navigation arrives', async () => { ... })
  it('sets isActive to false on finalized view', async () => { ... })
})
```

**Step 3: Run tests, commit:**
```
git commit -m "♻️ Rewrite view processor with metric accumulation"
```

---

### Task 10: Update integration test

**Files:**
- Modify: `packages/browser-sdk/src/integration/views.spec.ts`

**Step 1:** Add an integration test that verifies metrics appear in the view event sent to the RUM endpoint. Since PerformanceObserver entries are real browser data, the test verifies the structure rather than exact values. The initial view should eventually include `documentVersion > 1` (indicating metrics were accumulated).

**Step 2:** Run all integration tests:
```
yarn test:unit --spec packages/browser-sdk/src/integration/views.spec.ts --spec packages/browser-sdk/src/integration/rum.spec.ts --spec packages/browser-sdk/src/integration/logs.spec.ts
```

**Step 3:** Commit:
```
git commit -m "✅ Add view metrics integration test"
```

---

## Task dependency graph

```
Task 1 (event types)
  └─ Task 2 (performance collector) ─────────────────────┐
                                                          │
Task 3 (metric types)                                     │
  ├─ Task 4 (CLS tracker)                                │
  ├─ Task 5 (FCP tracker)                                │
  ├─ Task 6 (LCP tracker)                                │
  ├─ Task 7 (INP tracker)                                │
  └─ Task 8 (nav timings tracker)                        │
       └─ Task 9 (rewrite view processor) ◄──────────────┘
            └─ Task 10 (integration test)
```

Tasks 1 and 3 can run in parallel. Tasks 4-8 can run in parallel (independent trackers). Task 9 depends on all trackers + collector. Task 10 depends on Task 9.

## Verification

After all tasks:
```
yarn test:unit --spec packages/browser-rum-next/src/views/metrics/trackCls.spec.ts --spec packages/browser-rum-next/src/views/metrics/trackFcp.spec.ts --spec packages/browser-rum-next/src/views/metrics/trackLcp.spec.ts --spec packages/browser-rum-next/src/views/metrics/trackInp.spec.ts --spec packages/browser-rum-next/src/views/metrics/trackNavigationTimings.spec.ts --spec packages/browser-rum-next/src/views/processor.spec.ts --spec packages/browser-rum-next/src/performance/performanceCollector.spec.ts --spec packages/browser-sdk/src/integration/views.spec.ts --spec packages/browser-sdk/src/integration/rum.spec.ts
```
