# browser-rum-next Design

## Scope

Core RUM events: resources (enriched with PerformanceResourceTiming), errors (as RUM events), and long tasks. Actions and vitals are out of scope for this module and will be separate modules.

## Relationship to Existing Modules

The logs module and the RUM module subscribe to the same pipeline resources independently. A `resource:runtime_error` triggers both `observation:log` (from logs) and `observation:rum_error` (from RUM) when both modules are loaded. No coordination between them. The customer controls what they get by choosing which modules to load.

## New Package: browser-performance-next

A single performance collector that observes `PerformanceObserver` entries and publishes typed events:

- `resource:performance_entry` — `PerformanceResourceTiming` entries (source of truth for RUM resources)
- `resource:long_task` — `PerformanceLongTaskTiming` entries (duration > 50ms)
- `resource:long_animation_frame` — Long Animation Frame entries (detailed breakdown with script attribution)

The collector is always active when the RUM module is loaded. It registers observers for `resource`, `longtask`, and `long-animation-frame` entry types.

```
browser-performance-next/
  src/collectors/index.ts
  src/resourceTimingCollector.ts
  src/longTaskCollector.ts
```

## New Package: browser-rum-next

The RUM product module. Subscribes to pipeline resources, correlates them, and publishes RUM observations.

```
browser-rum-next/
  src/domain/processor.ts           # Resource/error/longtask → RUM observations
  src/domain/configuration.ts       # RUM-specific config
  src/domain/resourceMatcher.ts     # Correlates performance_entry with network_request
  src/domain/enrichers/
    viewContextEnricher.ts          # view.id, view.name on all RUM observations
    displayEnricher.ts              # viewport dimensions
    connectivityEnricher.ts         # network type
    pageStateEnricher.ts            # active/hidden state
  src/processor/index.ts            # Module init, public API
  src/index.ts                      # Types + public API
```

The RUM module depends on the views module for view context. If views isn't loaded, the viewContextEnricher skips.

## Event Flow

```
PerformanceObserver
  ├─ resource entries ──────→ resource:performance_entry
  ├─ longtask entries ──────→ resource:long_task
  └─ long-animation-frame ──→ resource:long_animation_frame

fetch/XHR (existing) ──────→ resource:network_request
window.error (existing) ───→ resource:runtime_error

RUM Processor subscribes to:
  resource:performance_entry ──→ correlate with network_request
                                  ──→ observation:rum_resource
  resource:runtime_error ──────→ observation:rum_error
  resource:long_task ──────────→ observation:rum_long_task
  resource:long_animation_frame → observation:rum_long_task (richer variant)

Core enrichers (observation:*):
  metadataEnricher ──→ date, source, service
  sessionEnricher ──→ session.id
  tagsEnricher ────→ ddtags
  internalContextEnricher ──→ _dd.format_version

RUM enrichers (observation:rum_*):
  viewContextEnricher ──→ view.id, view.name
  displayEnricher ─────→ display.viewport
  connectivityEnricher ─→ connectivity.type
  pageStateEnricher ────→ page_states

sdk.ts routing:
  observation:log ──────→ logs transport
  observation:view ─────→ rum transport (upsert by view.id)
  observation:rum_* ────→ rum transport (accumulate)
```

## Resource Matcher

`PerformanceResourceTiming` is the source of truth. It covers everything: fetch, XHR, images, scripts, stylesheets, fonts. Most entries don't have a corresponding `resource:network_request` because the network collector only patches fetch and XHR.

The `PerformanceResourceTiming` entry only becomes available after the resource finishes loading. The fetch/XHR `loadend` fires first, then the browser adds the performance entry. So network requests are always buffered before performance entries arrive.

The matcher is a time-bounded buffer:

1. On `resource:network_request`: store in a `Map<string, NetworkRequestResource[]>` keyed by URL. Multiple requests to the same URL can be in-flight, so it's an array.
2. On `resource:performance_entry`: look up by URL, find the entry whose timing overlaps (startTime within a tolerance window), remove from buffer, merge, publish `observation:rum_resource`.
3. Cleanup: entries older than 5 seconds get evicted. Lazy cleanup on insertion.

Unmatched performance entries still produce a RUM resource observation (just without request-level details like abort status or response body). The network request data is optional enrichment, not a requirement.

For matching, URL is the primary key. When multiple requests share the same URL, timing proximity (performance entry startTime vs network request startTime) is the tiebreaker.

## RUM Observation Types

### observation:rum_resource

```typescript
{
  type: 'resource',
  resource: {
    url, method, status_code, duration,
    type: 'fetch' | 'xhr' | 'image' | 'script' | 'css' | ...,
    size, encoded_body_size, decoded_body_size, transfer_size,
    protocol, delivery_type, render_blocking_status,
    redirect: { duration, start }, dns: { duration, start },
    connect: { duration, start }, ssl: { duration, start },
    first_byte: { duration, start }, download: { duration, start },
  },
}
```

### observation:rum_error

```typescript
{
  type: 'error',
  error: {
    message, type, stack, source: 'source',
    fingerprint?, causes?,
  },
}
```

### observation:rum_long_task

```typescript
{
  type: 'long_task',
  long_task: { duration },
  // long-animation-frame variant adds:
  scripts?: [{
    source_url, source_function_name, invoker, invoker_type,
    duration, execution_start, pause_duration,
    forced_style_and_layout_duration, window_attribution,
  }],
}
```

These follow the `rum-events-format` schema for Datadog intake compatibility.

## Event Routing in sdk.ts

The `observation:*` subscriber routes events to the correct transport:

- `observation:log` → logs batch (logs endpoint)
- `observation:view` → rum batch (rum endpoint, upsert by view.id)
- `observation:rum_*` → rum batch (rum endpoint, accumulate)

The Batch class needs an `upsert(key, data)` method alongside `add(data)`. When a view event arrives, it replaces the previous event with the same view.id in the buffer.

## RUM-Specific Enrichers

### viewContextEnricher

Subscribes to `signal:view_changed` to track current view. Stamps `view.id` and `view.name` on every `observation:rum_*` event. If views module isn't loaded, skips.

### displayEnricher

Reads `window.innerWidth` and `window.innerHeight`. Stamps `display.viewport.width` and `display.viewport.height`.

### connectivityEnricher

Reads `navigator.connection` when available. Stamps `connectivity.effective_type`, `connectivity.type`.

### pageStateEnricher

Tracks `document.visibilityState` changes. Stamps the page state (active/hidden) at event time.

## Public API

```typescript
{
  addError(error, context?)        // manual error → observation:rum_error
  getInternalContext()              // session/view IDs for tracing
  setGlobalContext(context)
  setUser(user)
  setAccount(account)
}
```

Actions, vitals, and Session Replay APIs are out of scope.

## Out of Scope

- Action tracking (click actions, frustration detection, manual actions)
- Web Vitals collection (LCP, CLS, INP, FCP)
- Custom vitals (duration vitals, operation steps)
- Tracing (trace_id, span_id injection into requests)
- Session Replay
- beforeSend per event type (handled at sdk.ts level)
