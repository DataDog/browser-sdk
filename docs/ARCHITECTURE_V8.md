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

The product bundle assembles the SDK with its modules at build time. The user calls a single `init()`:

```ts
// @datadog/browser-sdk
const sdk = createSDK([rumModule, logsModule])

sdk.init({
  clientToken: 'abc',
  site: 'datadoghq.com',
  rum: { applicationId: 'xyz', trackUserInteractions: true },
  logs: { forwardErrorsToLogs: true },
})
```

- The presence of a module key (e.g. `rum: { ... }`) activates that module automatically.
- `createSDK([...modules])` infers the full init type from the module tuple — TypeScript catches missing or wrong fields at the call site.
- If a module key is absent, the module is skipped.

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

```mermaid
flowchart TD
  collectors["collectors\n(views, actions, errors…)"]
  pipeline["Pipeline\n(pub/sub)"]
  enrichers["enricher chain\n(session, view, context…)"]
  batch["Batch\n(accumulate messages)"]
  transport["Transport\n(browser: fetch/beacon)"]
  intake["Datadog intake"]

  collectors -->|"raw events"| pipeline
  pipeline -->|"publish"| enrichers
  enrichers -->|"enriched events"| batch
  batch -->|"flush"| transport
  transport --> intake
```

### Pipeline

Typed pub/sub event bus. Collectors publish raw events. The pipeline runs them through the enricher chain before notifying subscribers.

### Enricher chain

DAG-ordered enrichers transform events. Each enricher can:

- Return enriched data — chain continues
- Return `SKIP` — enricher and its dependents are bypassed, event still reaches subscribers
- Return `DISCARD` — event is dropped entirely

### Batch

Accumulates serialized messages, emits a `flush` event when size/count/timeout limits are hit. Browser-core hooks `visibilitychange`/`beforeunload` to trigger flush on exit.

### Transport

Pluggable interface — `browser-core` provides `HttpTransport` (fetch + beacon + retry). Any environment can provide its own implementation.

## Tracking consent

Replaced by `enabled` in the configuration. No separate consent state machine.

- `enabled: true` (default) — collect and send events
- `enabled: false` — collect events but do not send
