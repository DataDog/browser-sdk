# Telemetry Design

## Context

Telemetry is the internal reporting system that allows the SDK to signal errors, usage patterns, and configuration snapshots back to Datadog. It must be reliable — a bug in the main event pipeline must not prevent telemetry from reporting that bug.

## Public API

Modules receive a `Telemetry` instance as a dependency at init time:

```ts
class Telemetry {
  constructor(pipeline: Pipeline, config: Configuration) {}

  debug(message: string, context?: object): void
  error(message: string, error?: unknown): void
  usage(feature: string): void
  configuration(config: object): void
}
```

No interface needed — TypeScript structural typing allows mocking the class directly in tests.

## Event types

| Method          | Type            | Description                                                                |
| --------------- | --------------- | -------------------------------------------------------------------------- |
| `debug`         | `log`           | Internal diagnostic messages                                               |
| `error`         | `log`           | SDK errors with scrubbed stack trace                                       |
| `usage`         | `usage`         | Which public API was called — static call-site info only, no runtime state |
| `configuration` | `configuration` | Init config snapshot, sent once per init                                   |

## Pipeline integration

Telemetry events are published to the pipeline's **fast track** (see `ARCHITECTURE_V8.md`).

> **Dependency:** The fast track requires pipeline changes that are not yet implemented. Until then, telemetry can be implemented with its own internal queue that bypasses the ordered pipeline.

Context (session ID, view ID, etc.) is provided by synchronous context providers registered at init time:

```ts
telemetry.registerContext(() => ({
  sessionId: session.getId(),
  viewId: view.getId(),
}))
```

Context providers must be synchronous — no async allowed on the fast track.

## Rate limiting

- Max **15 events per kind** per page load
- Kind is derived from event type + status (e.g. `error:debug`, `usage`, `configuration`)
- Events beyond the limit are silently dropped

## Deduplication

- Events with identical serialized content within the same kind are dropped
- Prevents the same SDK error from flooding telemetry across repeated calls

## Sample rates

Sampling is decided once at init and applies for the full page load:

| Event type       | Config field                       | Default |
| ---------------- | ---------------------------------- | ------- |
| `debug`, `error` | `telemetrySampleRate`              | 20%     |
| `configuration`  | `telemetryConfigurationSampleRate` | —       |
| `usage`          | `telemetryUsageSampleRate`         | —       |

If the draw fails, all telemetry methods become no-ops for that page.

## Excluded sites

`US1-FED` is excluded from telemetry collection for compliance. If the configured site is excluded, all telemetry methods are no-ops.

## Stack trace scrubbing

`error()` extracts and formats the error's stack trace. Customer frames are filtered out — only frames matching known Datadog SDK URLs are kept. This prevents leaking customer code paths in telemetry.

## What is not in scope

- Fast track pipeline implementation (tracked in `ARCHITECTURE_V8.md`)
- Metrics telemetry (`addTelemetryMetrics`) — deferred until needed
- `TelemetryService` distinction (RUM vs Logs) — modules set their service when registering
