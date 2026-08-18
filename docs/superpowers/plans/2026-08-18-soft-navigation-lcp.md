# Soft Navigation LCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `view.performance.lcp` for `route_change` views by consuming Chrome's Soft
Navigation API (`soft-navigation` + `interaction-contentful-paint` performance entries), gated
behind a new `ExperimentalFeature.SOFT_NAVIGATION` flag.

**Architecture:** New per-view metric tracker (`trackRouteChangeViewMetrics`) mirrors the
existing `trackInitialViewMetrics` pattern. It subscribes to the two new Chrome performance
entry types, correlates them by `interactionId`, and populates the same
`InitialViewMetrics.largestContentfulPaint` field already serialized by `viewCollection.ts` —
no schema changes. Wired into `trackViews.ts` only for `ROUTE_CHANGE` views, only when the flag
is enabled and the browser supports the API.

**Tech Stack:** TypeScript, Jasmine/Karma (unit tests), Playwright (E2E tests), existing
`PerformanceObserver` abstraction in `packages/browser-rum-core/src/browser/performanceObservable.ts`.

**Spec:** `docs/superpowers/specs/2026-08-18-soft-navigation-lcp-design.md`

## Global Constraints

- Feature is fully gated behind `ExperimentalFeature.SOFT_NAVIGATION` (`enableExperimentalFeatures: ['soft_navigation']`) AND browser support (`supportPerformanceTimingEvent(RumPerformanceEntryType.SOFT_NAVIGATION)`). Both conditions required.
- No changes to `rawRumEvent.types.ts` or `viewCollection.ts` — reuse the existing `view.performance.lcp.*` schema.
- No `subParts` (loadDelay/loadTime/renderDelay) computed for soft-nav LCP — that concept relies on hard-navigation TTFB, which doesn't apply here (see spec's Non-goals).
- `createPerformanceObservable(options)` takes a single `options` argument — no `configuration` parameter (confirmed against current `packages/browser-rum-core/src/browser/performanceObservable.ts:201`, this differs from some external references — do not add one).
- Run `yarn typecheck` and `yarn lint` after each task, per this repo's `AGENTS.md` personal-rules requirement to lint/typecheck before pushing.

---

### Task 1: Add `soft-navigation` and `interaction-contentful-paint` performance entry types

**Files:**
- Modify: `packages/browser-rum-core/src/browser/performanceObservable.ts`
- Modify: `packages/browser-rum-core/test/fixtures.ts`
- Test: `packages/browser-rum-core/src/browser/performanceObservable.spec.ts`

**Interfaces:**
- Produces: `RumPerformanceEntryType.SOFT_NAVIGATION` ('soft-navigation'), `RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT` ('interaction-contentful-paint')
- Produces: `RumSoftNavigationEntry { entryType, name: string, startTime: RelativeTime, interactionId: number, getLargestInteractionContentfulPaint(): RumInteractionContentfulPaintTiming | null, toJSON() }`
- Produces: `RumInteractionContentfulPaintTiming { entryType, interactionId: number, largestContentfulPaint: RumLargestContentfulPaintTiming, toJSON() }`
- Produces: `createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, overrides?)` and `createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, overrides?)` test fixtures

These two entry types come from Chrome's Soft Navigation API (stable, unflagged, since Chrome
151 — see spec's "Background" section). `largestContentfulPaint` on the ICP entry reuses the
exact same shape as a standalone `largest-contentful-paint` entry (per the WICG spec IDL:
`InteractionContentfulPaint.largestContentfulPaint` is typed as the full `LargestContentfulPaint`
interface), so we type it as `RumLargestContentfulPaintTiming` rather than inventing a new shape.

- [ ] **Step 1: Write the failing tests**

Add to `packages/browser-rum-core/src/browser/performanceObservable.spec.ts`, inside the
existing `describe('performanceObservable', ...)` block, after the last `it(...)`:

```typescript
  it('should notify soft navigation entries', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const softNavigationObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.SOFT_NAVIGATION,
    })
    performanceSubscription = softNavigationObservable.subscribe(observableCallback)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION)])
    expect(observableCallback).toHaveBeenCalledWith([
      jasmine.objectContaining({ entryType: RumPerformanceEntryType.SOFT_NAVIGATION, interactionId: 42 }),
    ])
  })

  it('should notify interaction contentful paint entries', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const icpObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT,
    })
    performanceSubscription = icpObservable.subscribe(observableCallback)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT)])
    expect(observableCallback).toHaveBeenCalledWith([
      jasmine.objectContaining({
        entryType: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT,
        interactionId: 42,
        largestContentfulPaint: jasmine.objectContaining({ entryType: RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT }),
      }),
    ])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test:unit --spec packages/browser-rum-core/src/browser/performanceObservable.spec.ts`
Expected: FAIL — `RumPerformanceEntryType.SOFT_NAVIGATION` and `.INTERACTION_CONTENTFUL_PAINT`
don't exist yet (TypeScript compile error) and `createPerformanceEntry` throws
`Unsupported entryType fixture` for both.

- [ ] **Step 3: Add the new entry types to `performanceObservable.ts`**

In `packages/browser-rum-core/src/browser/performanceObservable.ts`, update the enum (around
line 20-31):

```typescript
export enum RumPerformanceEntryType {
  EVENT = 'event',
  FIRST_INPUT = 'first-input',
  LARGEST_CONTENTFUL_PAINT = 'largest-contentful-paint',
  LAYOUT_SHIFT = 'layout-shift',
  LONG_TASK = 'longtask',
  LONG_ANIMATION_FRAME = 'long-animation-frame',
  NAVIGATION = 'navigation',
  PAINT = 'paint',
  RESOURCE = 'resource',
  SOFT_NAVIGATION = 'soft-navigation',
  INTERACTION_CONTENTFUL_PAINT = 'interaction-contentful-paint',
  VISIBILITY_STATE = 'visibility-state',
}
```

Add two new interfaces right after `RumFirstHiddenTiming` (around line 174, before the
`RumPerformanceEntry` union type):

```typescript
export interface RumSoftNavigationEntry {
  entryType: RumPerformanceEntryType.SOFT_NAVIGATION
  name: string
  startTime: RelativeTime
  interactionId: number
  getLargestInteractionContentfulPaint(): RumInteractionContentfulPaintTiming | null
  toJSON(): Omit<RumSoftNavigationEntry, 'toJSON' | 'getLargestInteractionContentfulPaint'>
}

export interface RumInteractionContentfulPaintTiming {
  entryType: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT
  interactionId: number
  largestContentfulPaint: RumLargestContentfulPaintTiming
  toJSON(): Omit<RumInteractionContentfulPaintTiming, 'toJSON'>
}
```

Update the `RumPerformanceEntry` union (around line 176-186) to add both:

```typescript
export type RumPerformanceEntry =
  | RumPerformanceResourceTiming
  | RumPerformanceLongTaskTiming
  | RumPerformanceLongAnimationFrameTiming
  | RumPerformancePaintTiming
  | RumPerformanceNavigationTiming
  | RumLargestContentfulPaintTiming
  | RumFirstInputTiming
  | RumPerformanceEventTiming
  | RumLayoutShiftTiming
  | RumFirstHiddenTiming
  | RumSoftNavigationEntry
  | RumInteractionContentfulPaintTiming
```

Update `EntryTypeToReturnType` (around line 188-199) to add both:

```typescript
export interface EntryTypeToReturnType {
  [RumPerformanceEntryType.EVENT]: RumPerformanceEventTiming
  [RumPerformanceEntryType.FIRST_INPUT]: RumFirstInputTiming
  [RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT]: RumLargestContentfulPaintTiming
  [RumPerformanceEntryType.LAYOUT_SHIFT]: RumLayoutShiftTiming
  [RumPerformanceEntryType.PAINT]: RumPerformancePaintTiming
  [RumPerformanceEntryType.LONG_TASK]: RumPerformanceLongTaskTiming
  [RumPerformanceEntryType.LONG_ANIMATION_FRAME]: RumPerformanceLongAnimationFrameTiming
  [RumPerformanceEntryType.NAVIGATION]: RumPerformanceNavigationTiming
  [RumPerformanceEntryType.RESOURCE]: RumPerformanceResourceTiming
  [RumPerformanceEntryType.SOFT_NAVIGATION]: RumSoftNavigationEntry
  [RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT]: RumInteractionContentfulPaintTiming
  [RumPerformanceEntryType.VISIBILITY_STATE]: RumFirstHiddenTiming
}
```

- [ ] **Step 4: Add fixtures to `test/fixtures.ts`**

In `packages/browser-rum-core/test/fixtures.ts`, inside the `switch (entryType)` block of
`createPerformanceEntry`, add two new cases (placed after the `LARGEST_CONTENTFUL_PAINT` case,
since the ICP fixture reuses it):

```typescript
    case RumPerformanceEntryType.SOFT_NAVIGATION:
      entry = {
        entryType: RumPerformanceEntryType.SOFT_NAVIGATION,
        name: 'https://example.com/soft-nav',
        startTime: 1000 as RelativeTime,
        interactionId: 42,
        getLargestInteractionContentfulPaint: () => null,
      }
      break

    case RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT:
      entry = {
        entryType: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT,
        interactionId: 42,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
        }),
      }
      break
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test:unit --spec packages/browser-rum-core/src/browser/performanceObservable.spec.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 6: Typecheck and lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add packages/browser-rum-core/src/browser/performanceObservable.ts packages/browser-rum-core/test/fixtures.ts packages/browser-rum-core/src/browser/performanceObservable.spec.ts
git commit -m "⚗️ Add soft-navigation and interaction-contentful-paint performance entry types"
```

---

### Task 2: Implement `trackRouteChangeViewMetrics`

**Files:**
- Create: `packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.ts`
- Test: `packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.spec.ts`

**Interfaces:**
- Consumes: `RumPerformanceEntryType.SOFT_NAVIGATION`, `.INTERACTION_CONTENTFUL_PAINT`,
  `RumSoftNavigationEntry`, `RumInteractionContentfulPaintTiming` (Task 1), `createPerformanceObservable(options)` (existing), `getSelectorFromElement(element, actionNameAttribute)` (existing, `packages/browser-rum-core/src/domain/getSelectorFromElement.ts`), `LargestContentfulPaint` (existing, `./trackLargestContentfulPaint`), `InitialViewMetrics` (existing, `./trackInitialViewMetrics`), `RumConfiguration` (existing, `../../configuration`)
- Produces: `trackRouteChangeViewMetrics(configuration: RumConfiguration, scheduleViewUpdate: () => void): { initialViewMetrics: InitialViewMetrics, setViewEnd: () => void, stop: () => void }` — consumed by Task 3.

**Design notes carried over from the spec (read before implementing):**

Per-view subscriptions, not global (see spec's "Per-view vs global subscription" section) —
each `route_change` view gets its own `trackRouteChangeViewMetrics` call.

Critical correctness detail NOT obvious from a first read of the spec: a per-view
`SOFT_NAVIGATION` subscription must be torn down as soon as **this** view ends (via
`setViewEnd()`), not kept alive until the delayed `stop()`. If it stays subscribed, an already-
ended view's tracker (one whose own interaction never produced a `soft-navigation` entry — e.g.
a programmatic route change) would still be listening when the *next* view's soft-navigation
entry arrives, and would incorrectly claim it (since `PerformanceObserver` notifies every active
observer of a type, not just the most recently created one). `interaction-contentful-paint`
entries, by contrast, keep updating LCP for up to `KEEP_TRACKING_AFTER_VIEW_DELAY` after view end
(mirrors `trackInteractionToNextPaint`'s `setViewEnd` pattern for the same "late-arriving data"
problem) — those are safe to keep listening for because they're filtered by `interactionId`,
which is only known once this view's own `soft-navigation` entry has arrived.

- [ ] **Step 1: Write the failing tests**

Create `packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.spec.ts`:

```typescript
import type { RelativeTime } from '@datadog/js-core/time'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement, createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { trackRouteChangeViewMetrics } from './trackRouteChangeViewMetrics'

describe('trackRouteChangeViewMetrics', () => {
  let scheduleViewUpdate: jasmine.Spy<() => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function startTracking() {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    const tracker = trackRouteChangeViewMetrics(mockRumConfiguration(), scheduleViewUpdate)
    registerCleanupTask(() => tracker.stop())
    return tracker
  }

  beforeEach(() => {
    scheduleViewUpdate = jasmine.createSpy()
  })

  it('should report LCP from the soft-navigation entry seeded ICP', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 7,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 1250 as RelativeTime,
              size: 100,
            }),
          }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toEqual({
      value: 250 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
    })
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(1)
  })

  it('should pick up an ICP entry that arrived before the soft-navigation entry', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1250 as RelativeTime,
          size: 100,
        }),
      }),
    ])
    expect(scheduleViewUpdate).not.toHaveBeenCalled()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(250 as RelativeTime)
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(1)
  })

  it('should update LCP when a bigger ICP entry arrives for the same interaction', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          size: 50,
        }),
      }),
    ])
    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(200 as RelativeTime)

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1400 as RelativeTime,
          size: 100,
        }),
      }),
    ])
    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(400 as RelativeTime)
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(2)
  })

  it('should ignore ICP entries with a size not bigger than the current LCP', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1400 as RelativeTime,
          size: 100,
        }),
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          size: 50,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(400 as RelativeTime)
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(1)
  })

  it('should ignore ICP entries for a different interaction', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 99,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1400 as RelativeTime,
          size: 100,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toBeUndefined()
    expect(scheduleViewUpdate).not.toHaveBeenCalled()
  })

  it('should compute the target selector and resource url from the LCP element', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 7,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 1250 as RelativeTime,
              size: 100,
              element: appendElement('<div id="soft-nav-lcp"></div>'),
              url: 'https://example.com/soft-nav-image.png',
            }),
          }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toEqual({
      value: 250 as RelativeTime,
      targetSelector: '#soft-nav-lcp',
      resourceUrl: 'https://example.com/soft-nav-image.png',
    })
  })

  it('should not let a later soft-navigation entry be claimed after setViewEnd', () => {
    const { initialViewMetrics, setViewEnd } = startTracking()

    // This view's own interaction never produces a soft-navigation entry (e.g. a programmatic
    // route change). The view ends when the next route change starts.
    setViewEnd()

    // A soft-navigation entry belonging to the *next* view must not be claimed by this
    // already-ended tracker.
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 5000 as RelativeTime,
        interactionId: 42,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 42,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 5200 as RelativeTime,
              size: 999,
            }),
          }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toBeUndefined()
    expect(scheduleViewUpdate).not.toHaveBeenCalled()
  })

  it('should keep applying ICP updates for its own interaction after setViewEnd', () => {
    const { initialViewMetrics, setViewEnd } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])

    setViewEnd()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1300 as RelativeTime,
          size: 10,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(300 as RelativeTime)
  })

  it('should stop applying ICP updates after stop()', () => {
    const { initialViewMetrics, stop } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 7,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 1200 as RelativeTime,
              size: 50,
            }),
          }),
      }),
    ])
    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(200 as RelativeTime)

    stop()

    // A bigger ICP entry for the same interaction arrives after stop(): must be ignored.
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1900 as RelativeTime,
          size: 999,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(200 as RelativeTime)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test:unit --spec packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.spec.ts`
Expected: FAIL — `trackRouteChangeViewMetrics` module does not exist yet.

- [ ] **Step 3: Implement `trackRouteChangeViewMetrics.ts`**

Create `packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.ts`:

```typescript
import type { RelativeTime } from '@datadog/js-core/time'
import type { RumConfiguration } from '../../configuration'
import {
  createPerformanceObservable,
  RumPerformanceEntryType,
} from '../../../browser/performanceObservable'
import type {
  RumInteractionContentfulPaintTiming,
  RumSoftNavigationEntry,
} from '../../../browser/performanceObservable'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

/**
 * Tracks the Largest Contentful Paint (LCP) for a `route_change` view using Chrome's Soft
 * Navigation API. Only called when `ExperimentalFeature.SOFT_NAVIGATION` is enabled and the
 * browser supports the `soft-navigation` performance entry type (see trackViews.ts).
 *
 * One instance of this tracker is created per route_change view (see the spec's "Per-view vs
 * global subscription" section for why). The soft-navigation entry for this view's interaction
 * arrives asynchronously (after Chrome confirms the paint), so `setViewEnd` MUST be called
 * (synchronously, when the view ends) to stop listening for new soft-navigation entries -- ICP
 * entries keep being tracked until `stop()`, since by then this tracker's `interactionId` is
 * already known and used to filter them.
 */
export function trackRouteChangeViewMetrics(configuration: RumConfiguration, scheduleViewUpdate: () => void) {
  const initialViewMetrics: InitialViewMetrics = {}

  let softNavEntry: RumSoftNavigationEntry | undefined
  let biggestIcpSize = 0
  const pendingIcpEntries: RumInteractionContentfulPaintTiming[] = []

  const icpSubscription = createPerformanceObservable({
    type: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT,
    buffered: true,
  }).subscribe((entries) => {
    pendingIcpEntries.push(...entries)
    applyIcpEntries(entries)
  })

  const softNavSubscription = createPerformanceObservable({
    type: RumPerformanceEntryType.SOFT_NAVIGATION,
    buffered: false,
  }).subscribe((entries) => {
    if (softNavEntry) {
      return
    }
    softNavEntry = entries[0]

    // The ICP entry for this interaction might have arrived before this soft-navigation entry
    // (Chrome's documented ordering caveat) -- re-scan everything seen so far now that we know
    // our interactionId.
    applyIcpEntries(pendingIcpEntries)

    const seededIcp = softNavEntry.getLargestInteractionContentfulPaint()
    if (seededIcp) {
      applyIcpEntries([seededIcp])
    }
  })

  function applyIcpEntries(entries: RumInteractionContentfulPaintTiming[]) {
    if (!softNavEntry) {
      return
    }
    for (const entry of entries) {
      if (entry.interactionId !== softNavEntry.interactionId || entry.largestContentfulPaint.size <= biggestIcpSize) {
        continue
      }
      biggestIcpSize = entry.largestContentfulPaint.size
      const lcpEntry = entry.largestContentfulPaint
      const largestContentfulPaint: LargestContentfulPaint = {
        value: (lcpEntry.startTime - softNavEntry.startTime) as RelativeTime,
        targetSelector: lcpEntry.element
          ? getSelectorFromElement(lcpEntry.element, configuration.actionNameAttribute)
          : undefined,
        resourceUrl: lcpEntry.url || undefined,
      }
      initialViewMetrics.largestContentfulPaint = largestContentfulPaint
      scheduleViewUpdate()
    }
  }

  return {
    initialViewMetrics,
    setViewEnd: () => {
      softNavSubscription.unsubscribe()
    },
    stop: () => {
      softNavSubscription.unsubscribe()
      icpSubscription.unsubscribe()
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test:unit --spec packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.spec.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.ts packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.spec.ts
git commit -m "⚗️ Track LCP for route_change views using the Soft Navigation API"
```

---

### Task 3: Wire `trackRouteChangeViewMetrics` into `trackViews.ts`

**Files:**
- Modify: `packages/browser-core/src/tools/experimentalFeatures.ts`
- Modify: `packages/browser-rum-core/src/domain/view/trackViews.ts`
- Test: `packages/browser-rum-core/src/domain/view/trackViews.spec.ts`

**Interfaces:**
- Consumes: `ExperimentalFeature`, `isExperimentalFeatureEnabled` (browser-core), `supportPerformanceTimingEvent`, `RumPerformanceEntryType.SOFT_NAVIGATION` (Task 1), `trackRouteChangeViewMetrics` (Task 2)
- Produces: `ExperimentalFeature.SOFT_NAVIGATION = 'soft_navigation'`, consumed via `enableExperimentalFeatures: ['soft_navigation']` in SDK init config (no code consumes this beyond the gate added here).

- [ ] **Step 1: Add the experimental feature flag**

In `packages/browser-core/src/tools/experimentalFeatures.ts`, update the enum:

```typescript
export enum ExperimentalFeature {
  SESSION_REPLAY_RECORD_CANVAS = 'session_replay_record_canvas',
  TRACK_INTAKE_REQUESTS = 'track_intake_requests',
  TRACK_WEBSOCKETS = 'track_websockets',
  SOFT_NAVIGATION = 'soft_navigation',
}
```

No test needed for this alone (it's a plain enum value, exercised by the tests below) — but
run `yarn typecheck` after this step before continuing, since `browser-core` is a separate
package from `browser-rum-core` and needs to build first for the next step's imports to resolve.

- [ ] **Step 2: Write the failing tests**

Add to `packages/browser-rum-core/src/domain/view/trackViews.spec.ts`. First, extend the
existing import block at the top of the file:

```typescript
import { PageExitReason, display, ExperimentalFeature, addExperimentalFeatures } from '@datadog/browser-core'
```

(replacing the existing `import { PageExitReason, display } from '@datadog/browser-core'` line)

Then add a new `describe` block, placed after the existing `describe('initial view metrics', ...)`
block (which ends around line 636, right before `describe('view is active', ...)`):

```typescript
  describe('route change view metrics (soft navigation)', () => {
    it('does not track LCP for route_change views when the experimental feature is disabled', () => {
      const { getViewUpdate, getViewUpdateCount, startView } = setupViewTest()
      startView()
      clock.tick(0)

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
          interactionId: 7,
          getLargestInteractionContentfulPaint: () =>
            createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
              interactionId: 7,
              largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
            }),
        }),
      ])
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const routeChangeUpdate = getViewUpdate(getViewUpdateCount() - 1)
      expect(routeChangeUpdate.loadingType).toBe(ViewLoadingType.ROUTE_CHANGE)
      expect(routeChangeUpdate.initialViewMetrics).toEqual({})
    })

    it('tracks LCP for route_change views when the experimental feature is enabled and the browser supports it', () => {
      addExperimentalFeatures([ExperimentalFeature.SOFT_NAVIGATION])
      const { getViewUpdate, getViewUpdateCount, startView } = setupViewTest()
      startView()
      clock.tick(0)

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
          startTime: clock.relative(0),
          interactionId: 7,
          getLargestInteractionContentfulPaint: () =>
            createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
              interactionId: 7,
              largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
                startTime: clock.relative(200),
                size: 100,
              }),
            }),
        }),
      ])
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const routeChangeUpdate = getViewUpdate(getViewUpdateCount() - 1)
      expect(routeChangeUpdate.loadingType).toBe(ViewLoadingType.ROUTE_CHANGE)
      expect(routeChangeUpdate.initialViewMetrics.largestContentfulPaint?.value).toBe(200 as RelativeTime)
    })

    it('does not track LCP for route_change views when the browser does not support the soft navigation API', () => {
      addExperimentalFeatures([ExperimentalFeature.SOFT_NAVIGATION])
      ;({ notifyPerformanceEntries } = mockPerformanceObserver({
        supportedEntryTypes: [RumPerformanceEntryType.RESOURCE],
      }))
      const { getViewUpdate, getViewUpdateCount, startView } = setupViewTest()
      startView()
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const routeChangeUpdate = getViewUpdate(getViewUpdateCount() - 1)
      expect(routeChangeUpdate.loadingType).toBe(ViewLoadingType.ROUTE_CHANGE)
      expect(routeChangeUpdate.initialViewMetrics).toEqual({})
    })

    it("does not let a later route_change view steal an earlier, already-ended view's soft-navigation entry", () => {
      addExperimentalFeatures([ExperimentalFeature.SOFT_NAVIGATION])
      const { getViewUpdate, getViewUpdateCount, startView } = setupViewTest()

      // First route change: no soft-navigation entry ever fires for it (e.g. a programmatic pushState).
      startView()
      clock.tick(0)
      const firstRouteChangeViewId = getViewUpdate(getViewUpdateCount() - 1).id

      // Second route change starts (ending the first view) and its interaction produces a soft nav.
      startView()
      clock.tick(0)
      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
          interactionId: 42,
          getLargestInteractionContentfulPaint: () =>
            createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
              interactionId: 42,
              largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
                size: 100,
              }),
            }),
        }),
      ])
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      let latestUpdateForFirstView
      for (let i = getViewUpdateCount() - 1; i >= 0; i--) {
        if (getViewUpdate(i).id === firstRouteChangeViewId) {
          latestUpdateForFirstView = getViewUpdate(i)
          break
        }
      }

      expect(latestUpdateForFirstView!.initialViewMetrics).toEqual({})
    })
  })
```

This nested `describe` lives inside the existing outer `describe('view metrics', ...)` block
(around line 448), so it has access to that block's `beforeEach` (`clock = mockClock()` and
`;({ notifyPerformanceEntries } = mockPerformanceObserver())`) — same as the sibling
`describe('initial view metrics', ...)` block already there.

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test:unit --spec packages/browser-rum-core/src/domain/view/trackViews.spec.ts`
Expected: FAIL on the 2nd, 3rd, and 4th new tests (the 1st, "disabled by default", already
passes against current behavior — confirm it does; if it fails too, something else is wrong).

- [ ] **Step 4: Wire `trackRouteChangeViewMetrics` into `trackViews.ts`**

In `packages/browser-rum-core/src/domain/view/trackViews.ts`, replace the existing
`@datadog/browser-core` import block (currently lines 12-26):

```typescript
import {
  noop,
  PageExitReason,
  shallowClone,
  generateUUID,
  throttle,
  display,
  setInterval,
  clearInterval,
  setTimeout,
  Observable,
  createContextManager,
  queueMicrotask,
  mockable,
} from '@datadog/browser-core'
```

with:

```typescript
import {
  noop,
  PageExitReason,
  shallowClone,
  generateUUID,
  throttle,
  display,
  setInterval,
  clearInterval,
  setTimeout,
  Observable,
  createContextManager,
  queueMicrotask,
  mockable,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
} from '@datadog/browser-core'
```

Then add two new import lines right after the existing `import { trackViewEventCounts } from './trackViewEventCounts'` line (currently line 35):

```typescript
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from '../../browser/performanceObservable'
import { trackRouteChangeViewMetrics } from './viewMetrics/trackRouteChangeViewMetrics'
```

Then, in the `newView` function, replace this block (currently around line 268-271):

```typescript
  const { stop: stopInitialViewMetricsTracking, initialViewMetrics } =
    loadingType === ViewLoadingType.INITIAL_LOAD
      ? trackInitialViewMetrics(configuration, startClocks, setLoadEvent, scheduleViewUpdate)
      : { stop: noop, initialViewMetrics: {} as InitialViewMetrics }
```

with:

```typescript
  const {
    stop: stopInitialViewMetricsTracking,
    initialViewMetrics,
    setViewEnd: setRouteChangeViewEnd,
  } =
    loadingType === ViewLoadingType.INITIAL_LOAD
      ? { ...trackInitialViewMetrics(configuration, startClocks, setLoadEvent, scheduleViewUpdate), setViewEnd: noop }
      : loadingType === ViewLoadingType.ROUTE_CHANGE &&
          isExperimentalFeatureEnabled(ExperimentalFeature.SOFT_NAVIGATION) &&
          supportPerformanceTimingEvent(RumPerformanceEntryType.SOFT_NAVIGATION)
        ? trackRouteChangeViewMetrics(configuration, scheduleViewUpdate)
        : { stop: noop, initialViewMetrics: {} as InitialViewMetrics, setViewEnd: noop }
```

All three branches now share the same `{ stop, initialViewMetrics, setViewEnd }` shape
explicitly (rather than relying on a destructuring default for an absent property), so
TypeScript can infer a clean union without ambiguity.

Then, in the `end()` method (currently around line 349-367), add the new call right after the
existing `setViewEnd(endClocks.relative)` line (that's the INP tracker's `setViewEnd`, unrelated
to but confusingly similarly-named as our new `setRouteChangeViewEnd` — both exist, both get
called, they do different things):

```typescript
    end(options: { endClocks?: ClocksState; sessionIsActive?: boolean } = {}) {
      if (endClocks) {
        // view already ended
        return
      }
      endClocks = options.endClocks ?? clocksNow()
      sessionIsActive = options.sessionIsActive ?? true

      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks })
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks })
      clearInterval(keepAliveIntervalId)
      setViewEnd(endClocks.relative)
      setRouteChangeViewEnd()
      stopCommonViewMetricsTracking()
      pageMayExitSubscription.unsubscribe()
      triggerViewUpdate()
      setTimeout(() => {
        this.stop()
      }, KEEP_TRACKING_AFTER_VIEW_DELAY)
    },
```

(only the `setRouteChangeViewEnd()` line is new; everything else in this method is unchanged)

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test:unit --spec packages/browser-rum-core/src/domain/view/trackViews.spec.ts`
Expected: PASS (the entire file — this touches a shared code path, so re-run the full spec file,
not just the new tests, to confirm no regression in `INITIAL_LOAD`/`BF_CACHE`/`SESSION_RENEWAL`
behavior)

- [ ] **Step 6: Typecheck and lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add packages/browser-core/src/tools/experimentalFeatures.ts packages/browser-rum-core/src/domain/view/trackViews.ts packages/browser-rum-core/src/domain/view/trackViews.spec.ts
git commit -m "⚗️ Gate soft navigation LCP tracking behind ExperimentalFeature.SOFT_NAVIGATION"
```

---

### Task 4: E2E test

**Files:**
- Create: `test/e2e/scenario/rum/softNavigation.scenario.ts`

**Interfaces:**
- Consumes: `createTest`, `html` (existing, `../../lib/framework`), `enableExperimentalFeatures: ['soft_navigation']` config option (Task 3)

Chrome 151 (the version this repo's default `chromium` Playwright project currently runs, per
`test/e2e/playwright.config.ts` and the `cb98e8624` "Bump chrome to 151.0.7922.71-1" commit)
ships the Soft Navigation API unflagged — no `--enable-features=SoftNavigationHeuristics` or
similar browser launch flag is needed.

- [ ] **Step 1: Write the E2E test**

Create `test/e2e/scenario/rum/softNavigation.scenario.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

test.describe('soft navigation', () => {
  const NAV_BUTTON = html`
    <button id="nav-button">Navigate</button>
    <script>
      document.querySelector('#nav-button').addEventListener('click', () => {
        const el = document.createElement('div')
        el.textContent = 'New page content'
        document.body.appendChild(el)
        history.pushState(null, '', '/soft-nav-route')
      })
    </script>
  `

  createTest('reports LCP on a route_change view created from a user-initiated soft navigation')
    .withRum({ enableExperimentalFeatures: ['soft_navigation'] })
    .withBody(NAV_BUTTON)
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Soft navigation API is Chromium-only')

      await page.locator('#nav-button').click()
      // Let the async soft-navigation and interaction-contentful-paint PerformanceEntries settle.
      await page.waitForTimeout(100)

      await flushEvents()

      const routeChangeViews = intakeRegistry.rumViewEvents.filter((v) => v.view.loading_type === 'route_change')
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)

      const lastRouteChange = routeChangeViews[routeChangeViews.length - 1]
      expect(lastRouteChange.view.performance?.lcp?.timestamp).toBeGreaterThanOrEqual(0)
    })

  createTest('does not report LCP on a route_change view without the experimental feature enabled')
    .withRum()
    .withBody(NAV_BUTTON)
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Soft navigation API is Chromium-only')

      await page.locator('#nav-button').click()
      await page.waitForTimeout(100)

      await flushEvents()

      const routeChangeViews = intakeRegistry.rumViewEvents.filter((v) => v.view.loading_type === 'route_change')
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)

      const lastRouteChange = routeChangeViews[routeChangeViews.length - 1]
      expect(lastRouteChange.view.performance?.lcp).toBeUndefined()
    })

  createTest('does not error on browsers without the soft navigation API')
    .withRum({ enableExperimentalFeatures: ['soft_navigation'] })
    .withBody(NAV_BUTTON)
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName === 'chromium', 'This test validates behavior on browsers without soft-navigation API')

      await page.locator('#nav-button').click()
      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const initialLoadViews = viewEvents.filter((v) => v.view.loading_type === 'initial_load')
      const routeChangeViews = viewEvents.filter((v) => v.view.loading_type === 'route_change')

      expect(initialLoadViews.length).toBeGreaterThanOrEqual(1)
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)
      expect(routeChangeViews[0].view.performance?.lcp).toBeUndefined()

      // No console errors -- automatically validated by test teardown.
    })
})
```

- [ ] **Step 2: Build the SDK and test apps**

Run: `yarn build:apps`

- [ ] **Step 3: Run the E2E test to verify it passes**

Run: `yarn test:e2e -g "soft navigation"`
Expected: PASS (3 tests: LCP reported when enabled, LCP absent when disabled, no errors when
API unsupported -- the third test only runs on non-chromium projects, which aren't part of the
default local run, so it will show as skipped unless you also run
`yarn test:e2e -g "soft navigation" --project=firefox` or similar)

If the first test is flaky (Chrome's soft-navigation heuristic can occasionally not fire if the
DOM mutation + `pushState` aren't recognized as being in the "same task"), re-run once before
investigating -- this is a known characteristic of the underlying browser heuristic, not
necessarily a bug in this implementation. If it fails consistently, use the
`browser-sdk-event-inspection` skill to manually inspect what events Chrome DevTools' Performance
panel shows for the click (see the "DevTools support for soft Navigations" section referenced in
the design spec) before assuming the SDK code is at fault.

- [ ] **Step 4: Lint**

Run: `yarn lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add test/e2e/scenario/rum/softNavigation.scenario.ts
git commit -m "⚗️ Add E2E test for soft navigation LCP tracking"
```

---

## Self-Review Notes

**Spec coverage:** Feature flag (Task 3) ✓, gating on browser support (Task 3) ✓, new entry
types (Task 1) ✓, `trackRouteChangeViewMetrics` module + per-view subscription design (Task 2) ✓,
`trackViews.ts` integration (Task 3) ✓, no schema changes (verified — no task touches
`rawRumEvent.types.ts` or `viewCollection.ts`) ✓, no telemetry wiring needed (verified against
actual codebase, corrected from the spec's first draft) ✓, unit tests for all described
scenarios (Task 2) ✓, E2E tests for the three documented scenarios (Task 4) ✓.

**Additional correctness issue found and fixed during planning (not in the original spec):** the
spec's per-view subscription design, as originally written, didn't address what happens when a
route_change view's own interaction never produces a `soft-navigation` entry (e.g. a
programmatic `pushState` with no DOM mutation) — such a tracker would stay subscribed and could
steal the *next* view's entry. Fixed by having `trackRouteChangeViewMetrics` return a
`setViewEnd` hook (mirroring `trackInteractionToNextPaint`'s existing pattern for the same class
of problem) that `trackViews.ts` calls immediately on `view.end()`, before the 5-minute delayed
`stop()`. Covered by dedicated tests in both Task 2 (unit) and Task 3 (integration).
