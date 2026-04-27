# View Metrics Design

## Scope

Add Core Web Vitals and navigation timings to the v8 RUM view: FCP, LCP, CLS, INP, and navigation timings. FID (deprecated), loading time, and scroll metrics are out of scope.

## Performance collector expansion

The existing performance collector in `browser-rum-next/src/performance/` observes additional PerformanceObserver entry types and publishes them to the pipeline:

```
Entry type                  → Pipeline event
─────────────────────────────────────────────
resource                    → resource:performance_entry       (existing)
longtask                    → resource:long_task               (existing)
long-animation-frame        → resource:long_animation_frame    (existing)
paint                       → resource:paint                   (new)
largest-contentful-paint    → resource:largest_contentful_paint (new)
layout-shift                → resource:layout_shift            (new)
event (40ms threshold)      → resource:performance_event       (new)
first-input                 → resource:first_input             (new)
navigation                  → resource:navigation_timing       (new)
```

One collector file, one `PerformanceObserver` per entry type, all `buffered: true`. The collector is a thin dispatcher — it doesn't interpret the entries.

## View processor rewrite

The view processor changes from a stateless transformer to a stateful accumulator.

### State

A plain `currentView` object that metrics write into:

```typescript
let currentView = {
  id: generateId(),
  url: location.href,
  referrer: document.referrer,
  startTime: 0,
  startDate: Math.round(performance.timeOrigin),
  loadingType: 'initial_load',
  documentVersion: 0,
  isActive: true,
}
```

When a new navigation arrives (`resource:navigation` or `action:start_view`), the processor finalizes the current view (`isActive = false`, emit final `observation:view`), then creates a fresh `currentView` with reset metrics.

### Metric accumulation

Each metric observer subscribes to a pipeline event and mutates `currentView` directly. After writing, it publishes `observation:view` with the full current state and increments `documentVersion`. No throttling — the transport layer handles batching.

### Pipeline subscriptions

```
resource:navigation / action:start_view
  → finalize previous view
  → create new currentView
  → publish observation:view (initial state)
  → publish signal:view_changed

resource:paint (name === 'first-contentful-paint')
  → if initial_load: currentView.firstContentfulPaint = entry.startTime
  → publish observation:view

resource:largest_contentful_paint
  → if initial_load: currentView.largestContentfulPaint = { value, targetSelector }
  → publish observation:view

resource:layout_shift (hadRecentInput === false)
  → accumulate into CLS sliding session window
  → currentView.cumulativeLayoutShift = { value, targetSelector }
  → publish observation:view

resource:performance_event / resource:first_input
  → track in top-10 interactions list
  → currentView.interactionToNextPaint = { value (P98), targetSelector }
  → publish observation:view

resource:navigation_timing
  → if initial_load: currentView.navigationTimings = { domComplete, domContentLoaded, ... }
  → publish observation:view
```

### Progressive emission

Multiple `observation:view` events are published per view, each with the full accumulated state. The backend deduplicates by view ID and document version. No batch-level upsert — events go through `batch.add()` like everything else.

Example progression for an initial page load:
```
observation:view  { documentVersion: 1, loadingType: 'initial_load' }
observation:view  { documentVersion: 2, navigationTimings: { ... } }
observation:view  { documentVersion: 3, firstContentfulPaint: 450 }
observation:view  { documentVersion: 4, largestContentfulPaint: { value: 1200 } }
observation:view  { documentVersion: 5, cumulativeLayoutShift: { value: 0.05 } }
...
```

For route changes, only CLS and INP accumulate (FCP, LCP, navigation timings are initial load only).

## View event shape

```typescript
{
  type: 'view',
  id: string,
  url: string,
  referrer: string,
  loadingType: 'initial_load' | 'route_change' | 'bf_cache',
  startTime: number,
  startDate: number,
  duration: number,              // recomputed on each emission
  documentVersion: number,       // increments on each emission
  isActive: boolean,             // false after view ends

  // Core Web Vitals (undefined until captured)
  firstContentfulPaint?: number,
  largestContentfulPaint?: {
    value: number,
    targetSelector?: string,
  },
  cumulativeLayoutShift?: {
    value: number,
    targetSelector?: string,
  },
  interactionToNextPaint?: {
    value: number,
    targetSelector?: string,
  },

  // Navigation timings (initial load only)
  navigationTimings?: {
    domComplete: number,
    domContentLoaded: number,
    domInteractive: number,
    loadEvent: number,
    firstByte: number,
  },
}
```

## Metric-specific details

### FCP (First Contentful Paint)

Subscribe to `resource:paint`. Filter entries where `name === 'first-contentful-paint'`. Initial load only. Discard entries with `startTime > 600_000` (10 minutes — stale buffered entry).

### LCP (Largest Contentful Paint)

Subscribe to `resource:largest_contentful_paint`. Initial load only. Each entry replaces the previous value (browser reports progressively larger elements). Stop tracking after the first user interaction or `document.visibilityState === 'hidden'`.

To detect interaction/hidden, the processor listens for `resource:performance_event`, `resource:first_input`, or `visibilitychange` and sets a flag to ignore subsequent LCP entries.

### CLS (Cumulative Layout Shift)

Subscribe to `resource:layout_shift`. Filter entries where `hadRecentInput === false` (ignore user-triggered shifts). All view types.

Uses the sliding session window algorithm:
- Start a new session window on the first shift
- Add subsequent shifts to the window if: gap from previous shift < 1 second AND total window duration < 5 seconds
- Otherwise, start a new window
- Report the maximum window value across all windows

Track the element with the largest impact for `targetSelector`.

### INP (Interaction to Next Paint)

Subscribe to `resource:performance_event` (with `durationThreshold: 40`) and `resource:first_input`. All view types.

Maintain the 10 longest interactions (by duration). Report the P98 value: with 10 entries, that's `interactions[Math.floor(interactions.length - 1 - interactions.length * 0.02)]` — effectively the longest.

Each interaction has sub-parts: `inputDelay` (startTime → processingStart), `processingDuration` (processingStart → processingEnd), `presentationDelay` (processingEnd → startTime + duration).

### Navigation Timings

Subscribe to `resource:navigation_timing`. Initial load only.

Extract timing phases from the `PerformanceNavigationTiming` entry:
- `firstByte`: responseStart
- `domInteractive`: domInteractive
- `domContentLoaded`: domContentLoadedEventEnd
- `domComplete`: domComplete
- `loadEvent`: loadEventEnd

## Future considerations

If the view processor grows too complex, the web vitals computation can be extracted into a separate processor that publishes `observation:vitals`. The view processor would subscribe to it instead of raw performance entries.

## Out of scope

- FID (First Input Delay) — deprecated in favor of INP
- Loading time — requires page activity detection, complex heuristic
- Scroll metrics — lower value, can be added later
- BFCache-specific FCP/LCP approximation — can be added later
- Event counts per view (action count, error count, resource count) — depends on action tracking (not yet implemented)
- Custom timings API
