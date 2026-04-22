# Architecture v8

Documents the new SDK architecture being built in the `*-next` packages.

## Core principles

- **Environment-agnostic core** — `core-next` has zero browser dependencies. Browser-specific I/O lives in `browser-sdk`.
- **Modules, not packages** — RUM, Logs, and other products are modules loaded into a single SDK, not standalone packages.
- **Pipeline-based processing** — events flow through an enricher chain (DAG-ordered) before reaching the transport.
- **Async by default** — module processors load asynchronously. The pipeline buffers events until all modules are ready.
- **Classes allowed** — `*-next` packages use class-based architecture for interface implementations (unlike legacy packages).
- **Every event is timestamped** — all events published to the pipeline carry both a monotonic clock (`startTime`) and a wall clock (`startDate`).

## Package structure

```
core-next              → environment-agnostic infrastructure
                         pipeline, enrichers, session, batch, config, context managers

browser-sdk            → browser runtime + SDK orchestration
                         cookie/localStorage stores, HTTP transport, encoders,
                         core collectors (console, errors, network),
                         createSdk assembler, SDK-level public API (init, setUser, etc.),
                         module extensions (bundled for config validation)

browser-logs-next      → logs product module

browser-rum-next       → rum product module
                         views, performance observers, resource matcher,
                         RUM enrichers (viewContext, display, connectivity, pageState)
```

There is no `browser-core-next` — `browser-sdk` owns both the browser building blocks and the SDK assembly. There is no `browser-views-next` or `browser-performance-next` — views and performance observers are internal to the RUM module.

## Module entry points

Each module has three entry points:

```
@datadog/browser-rum-next/extension   → config validation (bundled in browser-sdk)
@datadog/browser-rum-next/processor   → heavy async chunk (processors, enrichers, collectors)
@datadog/browser-rum-next             → public API (lightweight bridge)
```

**`/extension`** — contains the module's config extension (`validate` function). Bundled into `browser-sdk` at build time so `init()` can validate config synchronously. Tiny — just a type and a validation function.

**`/processor`** — the heavy chunk. Contains processors, enrichers, and module-specific collectors. Loaded asynchronously by `init()` when the module's config key is present. This is where domain logic lives.

**Default (public API)** — lightweight bridge that publishes events to the pipeline. Imported by the customer directly. Registers itself in the SDK registry at import time. Does not import the processor.

## Overall architecture

```
Developer app
  import { init, setUser } from '@datadog/browser-sdk'
  import { datadogRum } from '@datadog/browser-rum-next'
  import { datadogLogs } from '@datadog/browser-logs-next'
        │
        │  init({ clientToken: '...', logs: {...}, rum: {...} })
        │  setUser({ id: '42', name: 'Ada' })
        │  datadogRum.startView('checkout')
        │  datadogLogs.logger.info('hello')
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                          browser-sdk                             │
│                                                                  │
│   init() · session · transport · batch · context managers        │
│                                                                  │
│   SDK-level API: init, setUser, setGlobalContext, setAccount     │
│   beforeSend (global, one callback for all observations)         │
│   core enrichers on observation:*                                │
│                                                                  │
│   core collectors (always active):                               │
│     console → resource:console                                   │
│     errors  → resource:runtime_error, resource:report            │
│     network → resource:network_request                           │
│                                                                  │
│   bundled extensions (for config validation):                    │
│     rumExtension, logsExtension                                  │
│                    │                                             │
│                    ▼                                             │
│               [ pipeline ]                                       │
└──────────────────────────────────────────────────────────────────┘
                       │
     async loaded when config key detected:
     resolveModule('rum')  → @datadog/browser-rum-next/processor
     resolveModule('logs') → @datadog/browser-logs-next/processor
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    MODULE PROCESSORS                             │
│                                                                  │
│  browser-logs-next/processor    browser-rum-next/processor       │
│  ───────────────────────────    ─────────────────────────────    │
│  processor + enrichers          starts view + perf collectors    │
│  resource:* → observation:log   resource:* → observation:view    │
│                                 resource:* → observation:resource│
│                                 resource:* → observation:error   │
│                                 resource:* → observation:long_task│
│                                 viewContextEnricher on obs:*     │
└──────────────────────────────────────────────────────────────────┘
```

## Module loading

Async loading is the default for both CDN and npm. Module processors are loaded after `init()` creates the pipeline and validates config.

### resolveModule

`createSdk` accepts a `resolveModule: (name: string) => Promise<Module>` parameter. The entry point (CDN or npm) provides the implementation:

**CDN build** — fetches scripts from CDN URLs:
```javascript
const resolveModule = (name) => loadScript(`https://cdn.datadoghq.com/v8/modules/${name}.js`)
```

**npm build** — uses dynamic imports:
```javascript
const resolveModule = (name) => import(`@datadog/browser-${name}-next/processor`)
```

The customer never sees `resolveModule`. It's wired internally by the entry point.

**npm inline optimization:** npm users can optionally pass modules directly via the `modules` field in init config. When present, those modules are used directly without async loading. This is an optimization for speed, not the default path.

### Version compatibility

Modules follow semver. A module declares a compatible core version range via `peerDependencies` (e.g., `"@datadog/core-next": "^8.0.0"`). npm enforces this at install time. CDN uses the same contract via URL convention — the SDK constructs module URLs from its own major version.

### Loading flow

1. Module public APIs are imported — they register themselves in the SDK registry and buffer events locally
2. `init()` is called — creates pipeline, session, transport, enrichers, starts core collectors
3. `init()` connects each registered public API to the pipeline — local buffers drain into the pipeline
4. `init()` loads module processors async via `resolveModule` for each detected config key
5. Modules init: register enrichers, processors, transport routes
6. `pipeline.seal()` — pipeline buffer drains through the full enricher chain
7. If a module fails to load (network error), the SDK seals without it. Errors go to telemetry.

### Pre-init buffering

Two buffering stages ensure no events are lost between import and seal:

**Module local buffer** (import time → `init()`): Each module public API has a lightweight buffer. Events published before `init()` are queued. When `init()` calls `connect(pipeline)`, they drain into the pipeline.

**Pipeline buffer** (`init()` → `seal()`): After `init()` creates the pipeline but before `seal()`, events are buffered in the pipeline. Core collectors start publishing immediately. When all async modules finish loading, `seal()` drains through enrichers.

```
Import time          init() called          Modules loaded         seal()
     │                    │                      │                   │
     │  module local      │  pipeline            │  pipeline         │  events flow
     │  buffers events    │  buffers events      │  buffers events   │  through enrichers
     │                    │                      │                   │
     ▼                    ▼                      ▼                   ▼
  [local buf] ──drain──► [pipeline buf] ─────────────────drain────► [enrichers → transport]
```

### Pre-init telemetry (open decision)

Core collectors start at `init()` time, not at import time. Browser events before `init()` (uncaught errors, network requests) are not captured. This is the same as v6. After `init()`, the SDK measures the delta between page load and init time via telemetry to understand how many events are missed.

## Public API

`browser-sdk` exports SDK-level functions. Module packages export product-specific APIs.

```javascript
import { init, setUser, setGlobalContext, setAccount } from '@datadog/browser-sdk'
import { datadogRum } from '@datadog/browser-rum-next'
import { datadogLogs } from '@datadog/browser-logs-next'

// SDK-level (owned by browser-sdk)
init({ clientToken: '...', logs: { ... }, rum: { ... } })
setUser({ id: '42', name: 'Ada' })
setGlobalContext({ deployment: 'canary' })
setAccount({ id: 'acct-1' })

// Module-specific (owned by each module)
datadogRum.startView('checkout')
datadogRum.addAction('click')
datadogRum.addError(new Error('boom'))
datadogLogs.logger.info('hello')
```

`init()` only exists on `browser-sdk`. Module public APIs do not expose `init`.

Context managers (`setUser`, `setGlobalContext`, `setAccount`) are owned by `createSdk`. Modules read context through enrichers — they don't create their own context managers.

### CDN global

The CDN build sets `window.DD` as the global object:

```javascript
DD.init({ clientToken: '...', rum: { ... }, logs: { ... } })
DD.setUser({ id: '42' })
DD.rum.startView('checkout')
DD.logs.logger.info('hello')
```

No legacy globals (`datadogRum`, `datadogLogs`). v8 is a breaking change.

### CDN bundles

```
datadog-sdk.js           → browser-sdk + all extensions + all public API bridges
datadog-rum.js           → rum processor chunk (views, perf, enrichers)
datadog-logs.js          → logs processor chunk
```

The base script sets up the `DD` global, registers public APIs. When `init()` is called, it fetches processor chunks for the detected config keys.

## Configuration

Configuration is assembled at init time by merging a base config with each module's validated slice.

### Base configuration (`core-next`)

```ts
interface BaseInitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean       // replaces trackingConsent — defaults to true
  env?: string
  service?: string
  version?: string
  beforeSend?: (event: Record<string, unknown>) => boolean | void
  modules?: Module[]      // optional: inline modules for npm speed optimization
}
```

`beforeSend` is global — one callback for all observations. The customer filters by event type if needed.

### Module configuration — TypeScript module augmentation

Each module extends `SdkInitConfiguration` via TypeScript module augmentation:

```ts
// @datadog/browser-rum-next augments it when imported:
declare module '@datadog/core-next' {
  interface SdkInitConfiguration {
    rum?: RumInitConfiguration
  }
}
```

The presence of a config key (`rum: {}`) activates the module. Extensions are bundled in `browser-sdk` for synchronous validation during `init()`. Adding a new first-party module requires updating `browser-sdk` to bundle its extension.

### Session sampling

Per-module, deterministic. The session ID is used as a seed to compute whether each module is sampled for that session. Same session, but each module independently decides based on its own sample rate.

```javascript
init({
  logs: { sessionSampleRate: 100 },  // all sessions log
  rum: { sessionSampleRate: 10 },    // 10% of sessions get RUM
})
```

The session is always created. Sampling is a module-level decision, not a session-level one.

## Data pipeline

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

No partial string wildcards. Observation types have simple names:

```
observation:log               → logs endpoint
observation:view              → rum endpoint
observation:resource          → rum endpoint
observation:error             → rum endpoint
observation:long_task         → rum endpoint
```

### Event lifecycle

```
Public API bridges (datadogRum.startView, datadogLogs.logger.info)
  └─ action:* (published to pipeline)

Collectors (browser APIs)
  └─ resource:*

       └─ Module processors (subscribe to resource/action, publish observations)
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

Module-specific enrichers register on exactly the types they care about. RUM's `viewContextEnricher` is an exception — it registers on `observation:*` so log observations also get view context when RUM is loaded.

## ModuleContext

Passed to each module's `init()` function:

```typescript
interface ModuleContext {
  config: Configuration
  pipeline: Pipeline
  session: Session
  transport: Transport
}
```

Context managers are NOT in `ModuleContext`. The SDK registers a `contextEnricher` on `observation:*` that stamps global/user/account context. Modules publish observations with their domain data; enrichers add the rest. If a module ever needs direct read access to context managers, we can add it later.

## Transport

The transport is a component that modules register their routes with during init. It owns batching, flushing, and delivery.

```typescript
// During module init:
transport.route('observation:log', 'logs')       // logs module
transport.route('observation:view', 'rum')        // rum module
transport.route('observation:resource', 'rum')    // rum module
transport.route('observation:error', 'rum')       // rum module
transport.route('observation:long_task', 'rum')   // rum module
```

The transport subscribes to the pipeline once, looks up the registered route for each event type, and sends it to the correct batch/endpoint. Batches and endpoints are only created for tracks that have registered routes. If only logs is loaded, no RUM batch or endpoint is created.

`ModuleContext` includes the transport so modules can call `transport.route()` during init.

### Batch

Accumulates serialized messages, emits a `flush` event when size/count/timeout limits are hit. `browser-sdk` hooks `visibilitychange`/`beforeunload` to trigger flush on exit.

### HTTP Transport

Pluggable interface — `browser-sdk` provides fetch with keepalive + XHR fallback + retry. Any environment can provide its own implementation.

## Collector placement

Collectors are split between the SDK core and product modules based on who needs them:

**SDK core collectors** (always active, live in `browser-sdk`):
- Console collector — captures `console.*` calls. Used by both logs and RUM.
- Error collector — captures `window.error` and `unhandledrejection`. Used by both logs and RUM.
- Network collector — captures fetch/XHR. Used by both logs and RUM.

**RUM-owned collectors** (start inside RUM's module init):
- View collectors — patches `history.pushState`/`replaceState`, observes navigations. Only useful if RUM is loaded.
- Performance collectors — `PerformanceObserver` for resource timing, long tasks, long animation frames. Only useful if RUM is loaded.

If a customer loads only logs, view and performance collectors don't run.

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

Telemetry signals (errors, usage, debug) are published to the pipeline's **fast track**:

- Telemetry is never blocked by stuck RUM/log events
- No ordering requirements
- Enrichers on the fast track must be synchronous

> **TODO:** The fast track requires pipeline changes not yet implemented.

## Tracking consent

Replaced by `enabled` in the configuration. No separate consent state machine.

- `enabled: true` (default) — collect and send events
- `enabled: false` — collect events but do not send

## Open decisions

- **Session Replay** — where does it fit in the module model? Likely a separate module with its own processor and large collector (DOM serialization).
- **Error recovery** — what happens if the pipeline gets stuck? Timeout mechanism? Circuit breaker?
- **Remote configuration** — does v8 support dynamic config changes after init?
- **Pre-init event capture** — currently no browser events are captured before `init()`. Telemetry will measure the gap to inform whether this needs solving.
