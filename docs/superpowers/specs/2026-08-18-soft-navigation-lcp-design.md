# Soft Navigation LCP Design

- GitHub issue: [DataDog/browser-sdk#2696](https://github.com/DataDog/browser-sdk/issues/2696)
- Jira: [RUM-17885](https://datadoghq.atlassian.net/browse/RUM-17885)
- Related (superseded) draft: [PR #4154](https://github.com/DataDog/browser-sdk/pull/4154)

## Problem

`route_change` views never report Largest Contentful Paint. `trackViews.ts` only calls
`trackInitialViewMetrics` (the module that tracks LCP, FCP, and navigation timings) for
`ViewLoadingType.INITIAL_LOAD`. For every other loading type, `initialViewMetrics` is hardcoded
to `{}`:

```typescript
// trackViews.ts (current)
const { stop: stopInitialViewMetricsTracking, initialViewMetrics } =
  loadingType === ViewLoadingType.INITIAL_LOAD
    ? trackInitialViewMetrics(configuration, startClocks, setLoadEvent, scheduleViewUpdate)
    : { stop: noop, initialViewMetrics: {} as InitialViewMetrics }
```

This is a correctness gap for single-page applications: the browser's native
`largest-contentful-paint` entry is only emitted once per hard navigation, so there is no
standard signal SPA routers can use to compute LCP per route. Reporters have flagged this in
GH #2696 for apps using client-side routing (Module Federation SPA, in that case).

## Background: Chrome Soft Navigation API

Chrome ships (stable since Chrome 151, unflagged) a heuristic-based detector for
user-initiated, client-side route changes. Two new `PerformanceEntry` types:

- **`soft-navigation`** — fired once per detected soft navigation. Carries `name` (new URL),
  `startTime` (time of the *interaction* that triggered the navigation, e.g. the click — not
  the `pushState` call), `navigationId`, `interactionId`, and a method
  `getLargestInteractionContentfulPaint()` that returns the largest ICP entry recorded so far
  for that interaction.
- **`interaction-contentful-paint`** (ICP) — fired after interactions that produce a
  contentful paint. Contains a `largestContentfulPaint` sub-entry (`startTime`, `size`,
  `element`, `url`) and an `interactionId` linking it back to the originating interaction.
  ICP entries can be emitted *before* their corresponding `soft-navigation` entry (if the
  paint completes before the URL updates).

Detection heuristic (browser-side, not something we control): a user interaction → DOM
mutation + paint → URL update via History API, all in the same task.

LCP for a soft navigation = the largest ICP entry whose `interactionId` matches the
soft-navigation's `interactionId`, with its timestamp made relative to the soft-navigation's
`startTime` (not the original hard-navigation start).

## Non-goals

- FCP, CLS, INP, TTFB for soft navigations. The issue and this round of work are scoped to
  LCP only (the metric the reporter and Chrome's own docs identify as the one SPAs can't
  currently get natively). Other metrics can reuse this same collection scaffolding later.
- Firefox/Safari support — the Chrome API doesn't exist there. On unsupported browsers this
  feature is a no-op (see "Gating" below).
- Reworking `trackInitialViewMetrics` to share code with the new tracker. The two data
  sources (`largest-contentful-paint` vs `interaction-contentful-paint`) are different enough
  that forcing a shared abstraction now would be premature.

## Design

### Feature flag

New `ExperimentalFeature.SOFT_NAVIGATION` (`experimentalFeatures.ts`). Customers opt in via
`enableExperimentalFeatures: ['soft_navigation']`.

Rationale for a flag (as opposed to unconditional feature-detection, which is how every other
metric in the SDK works): this changes what data appears on existing `route_change` view
events. Customers with dashboards/monitors built around "route_change views have no LCP" need
to opt in before that assumption changes.

### Gating

Two independent conditions, both required:

```typescript
loadingType === ViewLoadingType.ROUTE_CHANGE
  && isExperimentalFeatureEnabled(ExperimentalFeature.SOFT_NAVIGATION)
  && supportPerformanceTimingEvent(RumPerformanceEntryType.SOFT_NAVIGATION)
```

`supportPerformanceTimingEvent` already exists (`performanceObservable.ts`) and wraps
`PerformanceObserver.supportedEntryTypes.includes(...)`. This is the actual browser-capability
gate; the flag is purely a customer opt-in on top of it.

### New performance entry types

Extend `performanceObservable.ts`:

```typescript
export enum RumPerformanceEntryType {
  // ...existing
  SOFT_NAVIGATION = 'soft-navigation',
  INTERACTION_CONTENTFUL_PAINT = 'interaction-contentful-paint',
}

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
  largestContentfulPaint: {
    startTime: RelativeTime
    size: number
    element?: Element
    url?: string
  }
  toJSON(): Omit<RumInteractionContentfulPaintTiming, 'toJSON'>
}
```

Both added to `RumPerformanceEntry` union and `EntryTypeToReturnType`, following the existing
pattern for every other entry type in this file.

### `trackRouteChangeViewMetrics` (new module)

Location: `packages/browser-rum-core/src/domain/view/viewMetrics/trackRouteChangeViewMetrics.ts`

Mirrors the shape of `trackInitialViewMetrics`: takes `viewStart` and `scheduleViewUpdate`,
returns `{ stop, initialViewMetrics }` where `initialViewMetrics.largestContentfulPaint`
matches the existing `LargestContentfulPaint` interface — so `viewCollection.ts` needs zero
changes to serialize it.

Subscription strategy (per view, not global — see "Per-view vs global" below):

1. Subscribe to `SOFT_NAVIGATION` entries with `buffered: false`. The view is only created in
   response to a `pushState`/`replaceState` detected by the SDK's location-change observable,
   which always happens *after* the user interaction that Chrome's heuristic keys off. So the
   next `soft-navigation` entry to arrive on this subscription is unambiguously this view's
   entry — no timestamp-window matching needed.
2. Subscribe to `INTERACTION_CONTENTFUL_PAINT` entries with `buffered: true`, to also catch any
   ICP entry that fired before the soft-navigation entry (per Chrome's documented ordering
   caveat).
3. On the soft-navigation entry: record `interactionId` and `startTime`. Seed the LCP value
   from `entry.getLargestInteractionContentfulPaint()` if present.
4. For every accumulated/incoming ICP entry: keep it only if `interactionId` matches and
   `largestContentfulPaint.size` is greater than the current biggest size seen (same
   biggest-size-wins pattern as `trackLargestContentfulPaint`).
5. Reported LCP value = `icp.largestContentfulPaint.startTime - softNavEntry.startTime` (LCP
   relative to the soft navigation, per Chrome's documented convention — not relative to the
   hard-navigation origin).
6. Call `scheduleViewUpdate()` whenever the tracked value changes.

`stop()` unsubscribes both observables. Lifecycle matches `trackInitialViewMetrics`: the view
keeps tracking for `KEEP_TRACKING_AFTER_VIEW_DELAY` (5 min) after the view ends, which is far
longer than the sub-second delay Chrome takes to emit these entries.

#### Per-view vs global subscription

Considered and rejected: a single global subscriber for `soft-navigation`/ICP entries, shared
across all views, correlating by `interactionId` and exposing a query API to views (the
pattern `web-vitals` and PR #4154 use).

Rejected because it re-introduces a timing/ownership problem in a different shape: a global
listener still has to decide "which view does this `soft-navigation` entry belong to," which
is exactly what the per-view approach gets for free by relying on view-creation ordering
(views are created sequentially by the location-change observable; a `soft-navigation` entry
cannot exist before the interaction that also causes the SDK to create the view). Per-view
subscriptions cost one extra pair of `PerformanceObserver` instances per route change, which is
in line with how every other per-view metric (CLS, INP, scroll) is already implemented in this
codebase.

### `trackViews.ts` change

```typescript
const { stop: stopInitialViewMetricsTracking, initialViewMetrics } =
  loadingType === ViewLoadingType.INITIAL_LOAD
    ? trackInitialViewMetrics(configuration, startClocks, setLoadEvent, scheduleViewUpdate)
    : loadingType === ViewLoadingType.ROUTE_CHANGE
        && isExperimentalFeatureEnabled(ExperimentalFeature.SOFT_NAVIGATION)
        && supportPerformanceTimingEvent(RumPerformanceEntryType.SOFT_NAVIGATION)
      ? trackRouteChangeViewMetrics(startClocks, scheduleViewUpdate)
      : { stop: noop, initialViewMetrics: {} as InitialViewMetrics }
```

`BF_CACHE` and `SESSION_RENEWAL` loading types are unaffected — they keep the current `{}`
fallback.

### Schema

No changes. `view.performance.lcp.*` already exists in `rawRumEvent.types.ts` and is
serialized generically from `view.initialViewMetrics.largestContentfulPaint` regardless of
loading type. `view.loading_type === 'route_change'` is already sufficient for anyone
querying/filtering this data downstream — no new boolean or flag field is added to the event
schema (unlike PR #4154's `navigation.soft`).

### Telemetry

No manual wiring needed. `telemetryEvent.types.ts` already reports every enabled experimental
flag generically via `experimental_features: Array.from(getExperimentalFeatures())`. Adding
`SOFT_NAVIGATION` to the `ExperimentalFeature` enum is sufficient — it will show up in that
array automatically. (The `use_` prefix pattern in `configuration.ts` is unrelated: it tracks
usage of specific configuration *values* that might carry customer data, not experimental
feature flags.)

## Testing

**Unit tests** (`trackRouteChangeViewMetrics.spec.ts`):
- Mock `PerformanceObserver`; emit a `soft-navigation` entry with a seeded
  `getLargestInteractionContentfulPaint()` result → assert `initialViewMetrics.largestContentfulPaint`
  is set with the correct relative timestamp.
- Emit a `soft-navigation` entry, then a larger `interaction-contentful-paint` entry with a
  matching `interactionId` → assert the value updates.
- Emit an `interaction-contentful-paint` entry with a matching `interactionId` *before* the
  `soft-navigation` entry → assert it's still picked up once the soft-nav entry arrives.
- Emit ICP entries with a non-matching `interactionId` → assert they're ignored.
- Flag disabled, or `supportPerformanceTimingEvent` returns false → assert
  `trackRouteChangeViewMetrics` is never called (covered in `trackViews.spec.ts`).

**E2E test** (`test/e2e/scenario/rum/softNavigation.scenario.ts`):
- Chromium only. Click a button whose handler does synchronous DOM mutation + `pushState` →
  assert the resulting `route_change` view event has `view.performance.lcp.timestamp` populated.
- Same setup without the experimental flag enabled → assert LCP stays `undefined`.

## Rollout

Ship behind `ExperimentalFeature.SOFT_NAVIGATION`, matching the pattern used for other
in-progress features in this codebase (flag added, default off, promoted later once validated
on staging/internal dogfooding).
