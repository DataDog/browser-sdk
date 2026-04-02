# Architecture v8

Documents the new SDK architecture being built in the `*-next` packages.

## Core principles

- **Environment-agnostic core** — `core-next` has zero browser dependencies. Browser-specific I/O lives in `browser-core-next`.
- **Modules, not packages** — RUM, Logs, and other products are modules loaded into a single SDK, not standalone packages.
- **Pipeline-based processing** — events flow through an enricher chain (DAG-ordered) before reaching the transport.
- **Classes allowed** — `*-next` packages use class-based architecture for interface implementations (unlike legacy packages).

## Package structure

```mermaid
graph TD
  core-next["@datadog/core-next\n(environment-agnostic infrastructure)"]
  browser-core-next["@datadog/browser-core-next\n(browser I/O: fetch, beacon, storage)"]
  rum-next["rum module\n(not a standalone package)"]
  logs-next["logs module\n(not a standalone package)"]
  browser-sdk["@datadog/browser-sdk\n(product bundle)"]

  core-next --> browser-core-next
  core-next --> rum-next
  core-next --> logs-next
  browser-core-next --> browser-sdk
  rum-next --> browser-sdk
  logs-next --> browser-sdk
```

## Initialization

The user calls a single `init()` with a flat config. Module keys drive which modules are loaded:

```ts
sdk.init({
  clientToken: 'abc',
  site: 'datadoghq.com',
  rum: { applicationId: 'xyz', trackUserInteractions: true },
  logs: { forwardErrorsToLogs: true },
})
```

- The presence of a module key (e.g. `rum: { ... }`) activates that module automatically.
- An empty object (e.g. `rum: {}`) is enough to activate a module with defaults.
- If a module key is absent, the module is skipped.

### Module loading strategy (open decision)

Two approaches are under consideration:

- **Code splitting** — modules are part of the same bundle but lazy-loaded via dynamic `import()`. Simpler for developers, standard bundler feature, full type safety at compile time.
- **Remote loading** — modules are separate scripts fetched from a CDN at runtime. More powerful for customers (true pay-for-what-you-use), but requires versioning infrastructure and more complex error handling.

Both are compatible with the configuration design. The loading mechanism is an implementation detail that can be decided later.

## Configuration

Configuration is assembled at init time by merging a base config with each module's validated slice.

### Base configuration (`core-next`)

Fields every SDK needs:

```ts
interface BaseInitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean // replaces trackingConsent — defaults to true
  sessionSampleRate?: number
  env?: string
  service?: string
  version?: string
}
```

`enabled: false` means events are collected but not sent. When absent, defaults to `true`.

### Module configuration — TypeScript module augmentation

Each module extends `SdkInitConfiguration` via TypeScript module augmentation. Importing a module automatically adds its config fields to the init type:

```ts
// core-next defines the base — must be an interface, not a type alias
interface SdkInitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean
  // ...
}

// @datadog/rum-next augments it when imported:
declare module '@datadog/core-next' {
  interface SdkInitConfiguration {
    rum?: RumInitConfiguration
  }
}

// User code:
import '@datadog/rum-next' // augments the type as a side-effect

sdk.init({
  clientToken: 'abc',
  rum: { applicationId: 'xyz' }, // TypeScript knows about 'rum'
})
```

Benefits:

- `browser-sdk` never needs to know about module config types
- Config changes only require updating the module package — no `browser-sdk` rebuild coupling
- If a module isn't imported, its fields don't exist in the type
- Each module owns its config definition completely

**Constraint:** `SdkInitConfiguration` must remain an `interface` in `core-next` — module augmentation does not work with `type` aliases.

### Module extensions

Each module provides a `ConfigExtension` that validates its own slice:

```ts
interface ConfigExtension<TKey extends string, TInit, TConfig> {
  key: TKey
  validate(init: TInit | undefined): TConfig | null // null = invalid, abort init
}
```

`buildConfiguration` assembles the final config and returns `null` if any extension fails validation.

### ConfigReader (singleton)

After init, a `ConfigReader` singleton is created. Components reach for it to read config:

```ts
const reader = createConfigReader(config)
reader.get().clientToken
reader.get().applicationId // typed from rum module
```

## Data pipeline

### Event taxonomy

The pipeline carries five categories of data, each with different semantics:

**Resource** — passive data points from browser APIs (PerformanceResourceTiming, fetch/XHR completions). Raw, minimal. Some transform into observations immediately, others are consumed directly by subscribers (e.g. profiling module).

**Action** — active data points from user interactions (clicks, taps, custom actions). May accumulate child events (errors, resources) before becoming an observation. Also directly subscribable by other modules.

**Observation** — the step before a final event. Domain-agnostic, enrichable. A resource that completed, an action that resolved, a view update, an error. Only observations go through the enricher chain and become events. This is what `beforeSend` receives after enrichment.

**Signal** — internal SDK coordination (`sessionStarted`, `sessionExpired`, `viewCreated`, `pageMayExit`). No enrichment, instant delivery. Never serialized to the backend.

**Telemetry** — SDK internal reporting (debug, error, usage, configuration). Fast track — separate from the ordered pipeline. Never blocked by stuck domain events.

### Event lifecycle

```mermaid
flowchart TD
  browser["Browser APIs"]
  user["User input"]
  resource["Resource\n(passive)"]
  action["Action\n(active)"]
  subscribers["Subscribers\n(profiling, etc.)"]
  observation["Observation\n(enrichable)"]
  enrichers["Enricher chain\n(session, view, context…)"]
  event["Event\n(rum-events-format)"]
  beforeSend["beforeSend"]
  batch["Batch"]
  transport["Transport"]
  intake["Datadog intake"]

  browser --> resource
  user --> action
  resource --> subscribers
  action --> subscribers
  resource -->|"some transform"| observation
  action -->|"resolved"| observation
  observation --> enrichers
  enrichers --> event
  event --> beforeSend
  beforeSend --> batch
  batch -->|"flush"| transport
  transport --> intake
```

### Mapping from current SDK events

| Current event             | v8 category | Rationale                                               |
| ------------------------- | ----------- | ------------------------------------------------------- |
| **RUM events**            |             |                                                         |
| `RESOURCE`                | Resource    | Passive network data from browser APIs                  |
| `ACTION`                  | Action      | User-initiated interactions                             |
| `VIEW`                    | Observation | Enrichable page lifecycle data with accumulated metrics |
| `ERROR`                   | Observation | Enrichable runtime failures                             |
| `LONG_TASK`               | Observation | Enrichable performance bottlenecks                      |
| `VITAL`                   | Observation | Enrichable custom measurements                          |
| **Lifecycle events**      |             |                                                         |
| `SESSION_EXPIRED`         | Signal      | Internal coordination for session cleanup               |
| `SESSION_RENEWED`         | Signal      | Internal coordination for session refresh               |
| `VIEW_CREATED`            | Signal      | Internal coordination for view context                  |
| `VIEW_UPDATED`            | Signal      | Internal coordination for view metrics                  |
| `VIEW_ENDED`              | Signal      | Internal coordination for view termination              |
| `ACTION_STARTED`          | Signal      | Internal coordination for action lifecycle              |
| `AUTO_ACTION_COMPLETED`   | Signal      | Internal coordination for action completion             |
| `REQUEST_STARTED`         | Signal      | Internal coordination for request lifecycle             |
| `REQUEST_COMPLETED`       | Signal      | Internal coordination for resource fetch completion     |
| `PAGE_MAY_EXIT`           | Signal      | Internal coordination for page unload                   |
| `RAW_RUM_EVENT_COLLECTED` | Signal      | Pipeline entry point (replaced by `pipeline.publish()`) |
| `RUM_EVENT_COLLECTED`     | Signal      | Pipeline exit point (replaced by subscribers)           |
| `RAW_ERROR_COLLECTED`     | Signal      | Error pipeline entry (replaced by `pipeline.publish()`) |
| `VITAL_STARTED`           | Signal      | Internal coordination for vital lifecycle               |
| **Telemetry**             |             |                                                         |
| `LOG` (error/debug)       | Telemetry   | SDK diagnostic logs                                     |
| `CONFIGURATION`           | Telemetry   | SDK init config snapshot                                |
| `USAGE`                   | Telemetry   | Public API call tracking                                |

> **Open question:** Who converts resources/actions into observations — the collector that produced them, or a dedicated subscriber that listens and publishes observations?

### Pipeline tracks

The pipeline supports multiple tracks with different processing guarantees:

| Track       | Ordering               | Enrichers        | Use case                                         |
| ----------- | ---------------------- | ---------------- | ------------------------------------------------ |
| **ordered** | Sequential, guaranteed | Async or sync    | Observations — view before action                |
| **fast**    | None                   | Synchronous only | Telemetry — must never wait behind a stuck event |

Collectors publish to a specific track. Fast-track events bypass the ordered queue entirely — a stuck enricher cannot block telemetry signals.

### Enricher chain

DAG-ordered enrichers transform observations into events. Each enricher can:

- Return enriched data — chain continues
- Return `SKIP` — enricher and its dependents are bypassed, event still reaches subscribers
- Return `DISCARD` — event is dropped entirely

### Batch

Accumulates serialized messages, emits a `flush` event when size/count/timeout limits are hit. Browser-core hooks `visibilitychange`/`beforeunload` to trigger flush on exit.

### Transport

Pluggable interface — `browser-core` provides `HttpTransport` (fetch + beacon + retry). Any environment can provide its own implementation.

## Telemetry

Telemetry signals (errors, usage, debug) are published to the pipeline's **fast track**. This guarantees:

- Telemetry is never blocked by stuck RUM/log events
- No ordering requirements — a telemetry error doesn't need to wait for the current view
- Enrichers on the fast track must be synchronous — no async that could hang

Context (session ID, service, version) is provided by synchronous context providers registered specifically for the telemetry track.

> **TODO:** The fast track requires pipeline changes not yet implemented. Until then, telemetry uses its own internal queue.

## Tracking consent

Replaced by `enabled` in the configuration. No separate consent state machine.

- `enabled: true` (default) — collect and send events
- `enabled: false` — collect events but do not send
