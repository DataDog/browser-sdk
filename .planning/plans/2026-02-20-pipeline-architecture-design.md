# Pipeline Architecture Design

**Date:** 2026-02-20
**Status:** Approved

## Overview

This document describes a new event-processing architecture for the Datadog Browser SDK (v8). The goal is to replace the current `Observable` + `LifeCycle` + `abstractHooks`/`assembly` stack with a unified, typed, async-capable **Pipeline** that supports decoupled cross-domain composition, a cleaner mental model, and explicit initialization contracts.

### Primary motivations

- **Decoupling between packages** — RUM, Session Replay, Profiling, Logs can be independently loaded and tree-shaken. No shared `LifeCycle` object wired in `startRum`.
- **Cleaner mental model** — Raw signals → Observations → Decoration is easier to reason about than Observable + LifeCycle + Hooks + Assembly.
- **Cross-domain composition** — Multiple domains (RUM, SR, Performance) subscribe to the same events without tight coupling. New domains can be added without modifying core.

---

## Core Concepts

### 1. Pipeline

The central event-processing infrastructure. A single, typed pub/sub channel that replaces `Observable`, `LifeCycle`, and the `abstractHooks`/`assembly` stack.

- Browser instrumentation publishes raw events directly to the Pipeline.
- Domain modules subscribe to raw events and publish Observations back to the Pipeline.
- All events pass through an async decorator DAG before reaching subscribers.
- Signals (internal SDK coordination events) travel through the same Pipeline but have no decorators registered — they pass through instantly.

**Two-phase lifecycle:**

```
Registration phase  →  pipeline.decorate('observation', sessionFactory)
                       pipeline.decorate('resource', urlFilterFactory)
                       ...

Seal               →  pipeline.seal()
                      // DAGs resolved per event type, all decorators instantiated
                      // pipeline.publish() before seal() throws
                      // pipeline.decorate() after seal() throws

Active phase       →  pipeline.publish('resource', rawData)
                      pipeline.publish('signal', { type: 'sessionExpired' })
```

**API:**

```ts
pipeline.publish('resource', data)               // emit an event
pipeline.subscribe('observation', handler)        // receive events (post-decoration)
pipeline.decorate('observation', sessionFactory)  // register a decorator for an event type
pipeline.seal()                                   // freeze — resolves DAGs, instantiates decorators
```

**Async sequential processing:**

Events are buffered. Each event enters the decorator DAG only after the previous event has been fully processed and delivered to subscribers. This guarantees ordering: a `resource` event that causes a domain module to publish an `observation` will always complete its own decorator pass before that observation enters its DAG.

### 2. Signals

Internal SDK coordination events (`sessionStarted`, `sessionExpired`, `viewCreated`, `pageMayExit`, etc.) travel through the same Pipeline as a single `signal` event type carrying a discriminated union payload. No decorators are registered for `signal` — it passes through instantly.

```ts
type RumSignal =
  | { type: 'sessionStarted'; sessionId: string }
  | { type: 'sessionExpired' }
  | { type: 'viewCreated';   viewId: string; name?: string }
  | { type: 'pageMayExit';   reason: 'visibility_hidden' | 'before_unload' | 'page_frozen' }

pipeline.publish('signal', { type: 'sessionExpired' })

pipeline.subscribe('signal', (signal) => {
  if (signal.type === 'sessionExpired') { /* flush, stop collecting */ }
})
```

`pageMayExit` can also be published as an `action` event (with a `subtype` field) if a domain module needs to produce an Observation from it.

### 3. Observation

A generic, domain-agnostic data point. Any domain can produce one. It represents a meaningful metric or measurement (a resource load time, an error, a user action) but is not yet ready to send — it needs decoration to become a final RUM event.

```ts
interface Observation {
  readonly type: string           // e.g. 'resource', 'error', 'action', 'long_task', 'vital'
  readonly startTime: number
  readonly duration?: number
  readonly data: Record<string, unknown>  // domain-specific payload, opaque to the pipeline
}
```

The producing domain is irrelevant once an Observation is on the Pipeline.

### 4. Decorator (updated from `core-next`)

An async function registered for a specific event type. Decorators run in DAG order when an event of that type is published. They can enrich an event (add attributes), pass through unchanged, or discard it entirely.

```ts
interface Decorator<TEvent, TAttributes> {
  decorate(event: TEvent, accumulated: Partial<TAttributes>): Promise<DecoratorResult<TAttributes>>
}

type DecoratorResult<TAttributes> =
  | { status: 'contributed'; attributes: TAttributes }
  | { status: 'skipped' }
  | { status: 'discarded'; reason: string }
```

`decorate()` receives both the original event and the attributes accumulated so far from upstream decorators (those that ran before it per the DAG). This allows a decorator that `requires: ['session']` to read `accumulated.session` contributed by the session decorator.

---

## Event Types

### Pipeline event map

The Pipeline is generic over a single event map type. Core defines no event types — each product composes its own:

```ts
// core-next: truly generic
class Pipeline<TEventMap> { ... }

// rum-core: owns its slice
export type RumCoreEvents = {
  resource:    RawResourceData       // XHR, fetch, PerformanceResourceTiming
  action:      RawActionData         // click, input, custom action, page exit
  observation: Observation           // any enrichable data point
  signal:      RumSignal             // internal coordination
}

// rum: composes with Session Replay + Profiler additions
import type { RumCoreEvents } from '@datadog/browser-rum-core'
type RumEvents = RumCoreEvents & { srObservation: SRObservation }

const pipeline = new Pipeline<RumEvents>()  // fully typed
```

The composed pipeline instance is passed to all sub-modules as `Pipeline<RumEvents>`. Each module uses only the event types it cares about but gets full type safety.

### Distinguishing signals from regular events

There is no architectural distinction — signals are just an event type with no decorators registered. The naming convention (`signal`) and the discriminated union payload are the only signal-specific mechanism. Subscribers use standard TypeScript narrowing on `signal.type`.

---

## Decorator System

### Per-event-type DAGs

Decorators are registered per event type. `pipeline.seal()` builds one independent DAG per event type that has decorators, using the existing `resolveDecoratorOrder` (Kahn's algorithm, unchanged).

```ts
// Registration
pipeline.decorate('observation', trackingConsentFactory) // canDiscard: true
pipeline.decorate('observation', sessionFactory)         // provides: ['session']
pipeline.decorate('observation', viewFactory)            // requires: ['session']
pipeline.decorate('resource',    urlFilterFactory)       // canDiscard: true

// Seal
pipeline.seal()
// → builds DAG for 'observation': [trackingConsent, session, view]
// → builds DAG for 'resource':    [urlFilter]
// → 'signal' has no DAG (no decorators registered)
```

### Execution per event

1. Dequeue event from buffer.
2. Look up DAG for this event type. If empty, skip to step 5.
3. Run decorators sequentially in DAG order, each `await`-ed:
   - `contributed` → merge attributes into `accumulated`, continue.
   - `skipped` → continue unchanged.
   - `discarded` → stop immediately, drop event (no subscribers notified).
4. Merge all contributed attributes into the final enriched event.
5. Deliver enriched event to all subscribers for this event type.
6. Dequeue next event.

### `provides` / `requires` semantics

These declare ordering constraints. `provides: ['session']` means "I contribute session attributes to the accumulated output." `requires: ['session']` means "I must run after the session decorator — I may read `accumulated.session` in my `decorate()` call." The DAG enforces this ordering; `resolveDecoratorOrder` validates it at seal time and throws on cycles or missing providers.

### Sealing rationale

Sealing enforces that all decorators are registered before any event is processed. This guarantees every event sees the same decorator set — no "Event A decorated by N decorators, Event B by N+1" due to initialization timing. The DAG is resolved once and frozen, not recomputed per event.

**Profiler fix:** `startProfilingContext` moves into `startRumEventCollection` alongside all other decorator registrations. The profiler decorator registers at startup and returns `{ status: 'skipped' }` until the profiler bundle has loaded. No events are missed (current known gap: profiling context absent from events emitted during `bufferedDataObservable.unbuffer()`).

### `DecorationTrace` (unchanged)

Built-in observability — records which decorator ran, status returned, and duration. Emitted alongside each enriched observation for debugging and internal telemetry.

---

## Package Structure

### `core-next` — generic infrastructure, zero domain knowledge

- `Pipeline<TEventMap>` class
- `Decorator<TEvent, TAttributes>` interface (updated: async `decorate()`)
- `DecoratorFactory<TEvent, TAttributes>` interface (unchanged structure)
- `resolveDecoratorOrder` — DAG resolver (unchanged)
- `DecorationTrace` / `DecorationStep` (unchanged)
- `Observation` base interface
- Continues to re-export all of `@datadog/browser-core` for API parity during transition

### `rum-core` — RUM domain

- `RumCoreEvents` type map
- `RumSignal` discriminated union
- All decorator factories (replaces `hooks.register(HookNames.Assemble, ...)` pattern):
  - `trackingConsentDecoratorFactory`
  - `sessionDecoratorFactory`
  - `viewDecoratorFactory`
  - `urlContextsDecoratorFactory`
  - `connectivityDecoratorFactory`
  - `pageStateDecoratorFactory`
  - `displayDecoratorFactory`
  - `syntheticsDecoratorFactory`
  - `ciVisibilityDecoratorFactory`
  - `featureFlagDecoratorFactory`
  - `globalContextDecoratorFactory`
  - `userContextDecoratorFactory`
  - `accountContextDecoratorFactory`
  - `actionContextDecoratorFactory`
  - `defaultContextDecoratorFactory`
  - `sourceCodeDecoratorFactory`
- All collection modules (now `pipeline.publish()` instead of `lifeCycle.notify(RAW_RUM_EVENT_COLLECTED)`)
- `startRumEventCollection` evolves: calls `pipeline.decorate(...)` for all factories, then `pipeline.seal()`

### `rum` — full RUM (composes rum-core + SR + Profiler)

- Defines `RumEvents = RumCoreEvents & { srObservation: SRObservation }`
- Instantiates `new Pipeline<RumEvents>()`
- Session Replay: subscribes to `pipeline.subscribe('signal', ...)` instead of `lifeCycle.subscribe(SESSION_EXPIRED, ...)`
- Profiler decorator: registered at startup in `startRumEventCollection`, returns `skipped` until bundle loads

### `logs` — independent pipeline

- `LogsEvents` type map
- `LogsSignal` discriminated union
- Own decorator factories (session, tracking consent, rum internal context)
- `new Pipeline<LogsEvents>()`

### Replacement map

| Current | Replaced by |
|---|---|
| `Observable<T>` | Browser instrumentation calls `pipeline.publish()` directly |
| `LifeCycle` (domain events) | `Pipeline` |
| `LifeCycle` (coordination events) | `signal` event type on the Pipeline |
| `abstractHooks` + `Hooks` | `pipeline.decorate()` + `DecoratorFactory` |
| `assembly.ts` | Built into Pipeline's async decorator DAG execution |

---

## Out of Scope (deferred)

- Migration strategy (step-by-step transition from current architecture)
- Error handling within the decorator DAG
- Testing strategy for pipeline-based modules
- Performance benchmarking of async sequential processing vs current synchronous hooks
