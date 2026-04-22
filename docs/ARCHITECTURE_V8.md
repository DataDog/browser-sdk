# Architecture v8

Documents the new SDK architecture being built in the `*-next` packages.

## Core principles

- **Environment-agnostic core** — `core-next` has zero browser dependencies. Browser-specific I/O lives in `browser-sdk`.
- **Modules, not packages** — RUM, Logs, and other products are modules loaded into a single SDK, not standalone packages.
- **Pipeline-based processing** — events flow through an enricher chain (DAG-ordered) before reaching the transport.
- **Classes allowed** — `*-next` packages use class-based architecture for interface implementations (unlike legacy packages).
- **Every event is timestamped** — all events published to the pipeline carry both a monotonic clock (`startTime`) and a wall clock (`startDate`). Publishers set both when they know exactly when the event occurred. A timestamp enricher registered on `*` fills in defaults for events that don't.

## Package structure

```
core-next              → environment-agnostic infrastructure
                         pipeline, enrichers, session, batch, config, context managers

browser-sdk            → browser runtime + SDK orchestration
                         cookie/localStorage stores, HTTP transport, encoders,
                         core collectors (console, errors, network),
                         createSdk assembler, public API surface

browser-logs-next      → logs product module

browser-rum-next       → rum product module
                         views, performance observers, resource matcher,
                         RUM enrichers (viewContext, display, connectivity, pageState)
```

There is no `browser-core-next` — `browser-sdk` owns both the browser building blocks and the SDK assembly. There is no `browser-views-next` or `browser-performance-next` — views and performance observers are internal to the RUM module.

## Overall architecture

```
Developer app
  import { createSdk } from '@datadog/browser-sdk'
  import { logsProcessor } from '@datadog/browser-logs-next/processor'
  import { rumProcessor } from '@datadog/browser-rum-next/processor'
        │
        │  DD.init({ clientToken: '...', logs: {...}, rum: {...} })
        │  DD.setUser({ id: '42', name: 'Ada' })
        │  DD.logs.logger.info('hello')
        │  DD.rum.addAction('checkout')
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                          browser-sdk                             │
│                                                                  │
│   createSdk · session · transport · batch · contexts             │
│                                                                  │
│   core collectors (always active):                               │
│     console → resource:console                                   │
│     errors  → resource:runtime_error, resource:report            │
│     network → resource:network_request                           │
│                                                                  │
│   context managers (setUser, setGlobalContext, setAccount)        │
│   beforeSend (global, one callback for all observations)         │
│   core enrichers on observation:*                                │
│                    │                                             │
│                    ▼                                             │
│               [ pipeline ]                                       │
└──────────────────────────────────────────────────────────────────┘
                       │
     dynamically loaded when config key detected:
     import('@datadog/browser-logs-next/processor')
     import('@datadog/browser-rum-next/processor')
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    MODULE PROCESSORS                             │
│                                                                  │
│  browser-logs-next/processor    browser-rum-next/processor       │
│  ───────────────────────────    ─────────────────────────────    │
│  processor + enrichers          processor + enrichers            │
│  resource:* → observation:log   starts view + perf collectors    │
│                                 resource:* → observation:view    │
│                                 resource:* → observation:resource│
│                                 resource:* → observation:error   │
│                                 resource:* → observation:long_task│
│                                 viewContextEnricher on obs:*     │
└──────────────────────────────────────────────────────────────────┘
```

## Collector placement

Collectors are split between the SDK core and product modules based on who needs them:

**SDK core collectors** (always active, live in `browser-sdk`):
- Console collector — captures `console.*` calls. Used by both logs and RUM.
- Error collector — captures `window.error` and `unhandledrejection`. Used by both logs and RUM.
- Network collector — captures fetch/XHR. Used by both logs and RUM.

**RUM-owned collectors** (start inside RUM's module init):
- View collectors — patches `history.pushState`/`replaceState`, observes navigations. Only useful if RUM is loaded.
- Performance collectors — `PerformanceObserver` for resource timing, long tasks, long animation frames. Only useful if RUM is loaded.

If a customer loads only logs, view and performance collectors don't run. No wasted patching.

## Public API

The SDK returns a unified object. Context methods are top-level. Product-specific methods are namespaced under the module name.

```javascript
DD.init({ clientToken: '...', logs: { ... }, rum: { ... } })

// SDK-level (owned by browser-sdk)
DD.setUser({ id: '42', name: 'Ada' })
DD.setGlobalContext({ deployment: 'canary' })
DD.setAccount({ id: 'acct-1' })

// Module-specific (owned by each module)
DD.logs.logger.info('hello')
DD.rum.addAction('checkout')
DD.rum.startView('checkout')
DD.rum.addError(new Error('boom'))
```

Context managers (`setUser`, `setGlobalContext`, `setAccount`) are owned by `createSdk`. Modules read context through enrichers, they don't create their own context managers.

## Configuration

Configuration is assembled at init time by merging a base config with each module's validated slice.

### Base configuration (`core-next`)

Fields every SDK needs:

```ts
interface BaseInitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean // replaces trackingConsent — defaults to true
  env?: string
  service?: string
  version?: string
  beforeSend?: (event: Record<string, unknown>) => boolean | void
}
```

`beforeSend` is global — one callback for all observations. The customer filters by event type if needed:

```javascript
DD.init({
  clientToken: '...',
  beforeSend: (event) => {
    if (event.type === 'log' && event.status === 'debug') return false
    if (event.type === 'resource' && event.resource.url.includes('/health')) return false
    return true
  },
  logs: { ... },
  rum: { ... },
})
```

### Module configuration — TypeScript module augmentation

Each module extends `SdkInitConfiguration` via TypeScript module augmentation. Importing a module automatically adds its config fields to the init type:

```ts
// core-next defines the base — must be an interface, not a type alias
interface SdkInitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean
}

// @datadog/browser-rum-next augments it when imported:
declare module '@datadog/core-next' {
  interface SdkInitConfiguration {
    rum?: RumInitConfiguration
  }
}
```

### Session sampling

Per-module, deterministic. The session ID is used as a seed to compute whether each module is sampled for that session. Same session, but each module independently decides based on its own sample rate.

```javascript
DD.init({
  logs: { sessionSampleRate: 100 },  // all sessions log
  rum: { sessionSampleRate: 10 },    // 10% of sessions get RUM
})
```

The session is always created. Sampling is a module-level decision, not a session-level one.

## Data pipeline

### Base event shape

Every event published to the pipeline carries two timestamps:

```ts
interface BaseEvent {
  startTime: number // performance.now() at the moment the event occurred
  startDate: number // Date.now() at the moment the event occurred
}
```

**Why both?** `startTime` is monotonic and high-precision for ordering and duration. `startDate` is the absolute wall clock. Comparing deltas reveals clock freezes (device suspend).

### Event taxonomy

The pipeline carries five categories of data:

**Resource** — passive data from browser APIs (navigation events, fetch/XHR, performance entries). Published by collectors.

**Action** — data published intentionally — by collectors responding to user gestures or by the public API (`logger.info()`, `startView()`).

**Observation** — the step before a final event. Enrichable. Only observations go through the enricher chain and become serialized events sent to Datadog.

**Signal** — internal SDK coordination (`signal:session_expired`, `signal:view_changed`). No enrichment, never serialized.

**Telemetry** — SDK internal reporting. Fast track, separate from the ordered pipeline.

### Event naming

Event types use colon-separated namespaces. Wildcards apply to full segments only:

```
resource:console              — exact match
resource:network_request      — exact match
observation:*                 — matches all observations
*                             — matches everything
```

No partial string wildcards. `observation:rum_*` is not valid. Observation types have simple names:

```
observation:log               → logs endpoint
observation:view              → rum endpoint
observation:resource          → rum endpoint
observation:error             → rum endpoint
observation:long_task         → rum endpoint
```

### Event lifecycle

```
Collectors (browser APIs)
  └─ resource:* / action:*
       └─ Module processors
            └─ observation:*
                 └─ Core enrichers (session, metadata, tags, context)
                      └─ Module enrichers (rate limit, view context)
                           └─ beforeSend gate
                                └─ Transport (route → batch → endpoint)
```

### Enricher chain

DAG-ordered enrichers transform observations into events. Each enricher can:

- Return enriched data — chain continues
- Return `SKIP` — enricher and its dependents are bypassed, event still reaches subscribers
- Return `DISCARD` — event is dropped entirely

Core enrichers registered by `createSdk` on `observation:*`:

1. `metadataEnricher` — `date`, `source`, `service`
2. `sessionEnricher` — `session: { id }` (discards if session expired)
3. `internalContextEnricher` — `_dd: { format_version, browser_sdk_version }`
4. `tagsEnricher` — `ddtags`
5. `contextEnricher` — merges global context, user context, account context from shared context managers

Module-specific enrichers are registered during module init. RUM's `viewContextEnricher` registers on `observation:*` (not just RUM observations) so that log observations also get view context when RUM is loaded.

## Transport

The transport is a component that modules register their routes with during init. It owns batching, flushing, and delivery.

```ts
// During module init:
transport.route('observation:log', 'logs')       // logs module
transport.route('observation:view', 'rum')        // rum module
transport.route('observation:resource', 'rum')    // rum module
transport.route('observation:error', 'rum')       // rum module
transport.route('observation:long_task', 'rum')   // rum module
```

The transport subscribes to the pipeline once, looks up the registered route for each event type, and sends it to the correct batch/endpoint. Batches and endpoints are only created for tracks that have registered routes.

`ModuleContext` includes the transport so modules can call `transport.route()` during init.

### Batch

Accumulates serialized messages, emits a `flush` event when size/count/timeout limits are hit. `browser-sdk` hooks `visibilitychange`/`beforeunload` to trigger flush on exit.

### HTTP Transport

Pluggable interface — `browser-sdk` provides fetch with keepalive + XHR fallback + retry. Any environment can provide its own implementation.

## RUM module internals

The RUM module (`browser-rum-next`) contains:

- **View collectors** — patches `history.pushState`/`replaceState`, observes navigations and initial page load
- **Performance collectors** — `PerformanceObserver` for resource timing (`resource`), long tasks (`longtask`), and long animation frames (`long-animation-frame`)
- **Resource matcher** — correlates `resource:network_request` (from SDK core collector) with `resource:performance_entry` (from RUM's performance collector). Performance entries are the source of truth; network requests provide supplementary data (abort status, response body). Network requests are always buffered first, performance entries trigger the lookup.
- **View processor** — `resource:navigation` → `observation:view` + `signal:view_changed`
- **Resource processor** — `resource:performance_entry` + optional network match → `observation:resource`
- **Error processor** — `resource:runtime_error` → `observation:error`
- **Long task processor** — `resource:long_task` / `resource:long_animation_frame` → `observation:long_task`
- **RUM enrichers:**
  - `viewContextEnricher` — registered on `observation:*`, stamps `view.id` and `view.name` on all observations (including logs)
  - `displayEnricher` — viewport dimensions
  - `connectivityEnricher` — network type from `navigator.connection`
  - `pageStateEnricher` — `document.visibilityState` at event time

## Telemetry

Telemetry signals (errors, usage, debug) are published to the pipeline's **fast track**. This guarantees:

- Telemetry is never blocked by stuck RUM/log events
- No ordering requirements
- Enrichers on the fast track must be synchronous

> **TODO:** The fast track requires pipeline changes not yet implemented.

## Tracking consent

Replaced by `enabled` in the configuration. No separate consent state machine.

- `enabled: true` (default) — collect and send events
- `enabled: false` — collect events but do not send
