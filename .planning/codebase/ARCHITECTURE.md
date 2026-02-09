# Architecture

**Analysis Date:** 2026-01-21

## Pattern Overview

**Overall:** Layered Event-Driven Architecture with Domain-Driven Design

**Key Characteristics:**
- Observable-based event system using pub/sub pattern (LifeCycle)
- Clear dependency layering: core → rum-core → rum/logs/rum-react
- Assembly pattern for event enrichment and transformation
- Modular domain-driven structure with collection modules per concern
- Batch-based transport with compression support

## Layers

**Core Layer:**
- Purpose: Foundation library providing shared utilities and primitives
- Location: `packages/core/src`
- Contains: Browser APIs, observables, transport, session management, configuration, error handling, telemetry
- Depends on: None (base layer)
- Used by: All other packages (rum-core, logs, rum-react, worker, flagging)

**RUM Core Layer:**
- Purpose: Real User Monitoring business logic without UI-specific features
- Location: `packages/rum-core/src`
- Contains: Event collection (views, actions, errors, resources, long tasks, vitals), RUM assembly, contexts, tracing
- Depends on: @datadog/browser-core
- Used by: rum, rum-slim, rum-react packages

**Product Layer:**
- Purpose: User-facing SDK packages with specific feature sets
- Location: `packages/rum`, `packages/rum-slim`, `packages/logs`, `packages/rum-react`
- Contains: Public APIs, entry points, product-specific features (session replay, profiling, React integration)
- Depends on: core and/or rum-core
- Used by: End-user applications

**Transport Layer:**
- Purpose: Data transmission to Datadog backend
- Location: `packages/core/src/transport`, `packages/rum-core/src/transport`
- Contains: Batching, compression, HTTP requests, event bridge, flush control
- Depends on: Core utilities
- Used by: Collection modules

**Browser Integration Layer:**
- Purpose: Browser API observation and instrumentation
- Location: `packages/core/src/browser`, `packages/rum-core/src/browser`
- Contains: XHR/Fetch observables, performance observables, DOM mutation tracking, location change tracking
- Depends on: Core utilities
- Used by: Collection modules

## Data Flow

**RUM Event Collection Flow:**

1. Browser event occurs (click, XHR, error, etc.)
2. Observable captures raw event (xhrObservable, performanceObservable, etc.)
3. Collection module processes event (actionCollection, resourceCollection, errorCollection)
4. Collection emits RAW_RUM_EVENT_COLLECTED to LifeCycle with domain context
5. Assembly module enriches event with contexts (view, session, user, global)
6. Assembly emits RUM_EVENT_COLLECTED with fully assembled event
7. Batch collects events and manages buffer
8. FlushController triggers flush based on size/time/page exit
9. Encoder compresses batch (optional, via worker)
10. HttpRequest sends to Datadog intake

**Context Enrichment:**

1. Context managers maintain state (viewHistory, sessionContext, userContext, globalContext)
2. Assembly reads current context values at event time
3. Hooks allow custom transformation via beforeSend callbacks
4. Rate limiters and telemetry track event volumes

**State Management:**
- Session state persisted in cookies/localStorage
- View history maintained in memory with expiration
- Context managers use Observable pattern for updates
- ValueHistory tracks time-based context changes

## Key Abstractions

**LifeCycle:**
- Purpose: Central event bus for SDK-internal communication
- Examples: `packages/rum-core/src/domain/lifeCycle.ts`
- Pattern: Type-safe pub/sub with enum-based event types (AUTO_ACTION_COMPLETED, RAW_RUM_EVENT_COLLECTED, RUM_EVENT_COLLECTED, etc.)

**Observable:**
- Purpose: Reactive data streams for browser events
- Examples: `packages/core/src/tools/observable.ts`, `packages/core/src/browser/xhrObservable.ts`, `packages/core/src/browser/fetchObservable.ts`
- Pattern: Subscribe/unsubscribe with typed callbacks, buffering support

**Collection Modules:**
- Purpose: Domain-specific event capture and processing
- Examples: `packages/rum-core/src/domain/action/actionCollection.ts`, `packages/rum-core/src/domain/resource/resourceCollection.ts`, `packages/rum-core/src/domain/error/errorCollection.ts`
- Pattern: Subscribe to observables, emit to LifeCycle, manage domain state

**Assembly:**
- Purpose: Event enrichment and transformation pipeline
- Examples: `packages/rum-core/src/domain/assembly.ts`
- Pattern: Combine raw events with contexts, apply hooks, validate modifications, emit assembled events

**Context Managers:**
- Purpose: Stateful context tracking with customer data
- Examples: `packages/core/src/domain/contexts/userContext.ts`, `packages/rum-core/src/domain/contexts/viewHistory.ts`
- Pattern: ContextManager interface with set/get/remove, validation, storage sync

**Batch:**
- Purpose: Event buffering and transmission
- Examples: `packages/core/src/transport/batch.ts`
- Pattern: Add messages to buffer, upsert by key, flush on trigger, encode before send

## Entry Points

**RUM Full (with Session Replay):**
- Location: `packages/rum/src/entries/main.ts`
- Triggers: Application calls `datadogRum.init()`
- Responsibilities: Initialize RUM core, start recorder API, start profiler API, create deflate encoder, expose DD_RUM global

**RUM Slim (without Session Replay):**
- Location: `packages/rum-slim/src/entries/main.ts`
- Triggers: Application calls `datadogRum.init()`
- Responsibilities: Initialize RUM core with stub recorder, lighter bundle size

**RUM Core Bootstrap:**
- Location: `packages/rum-core/src/boot/startRum.ts`
- Triggers: Called by product packages (rum, rum-slim)
- Responsibilities: Start all collection modules, initialize contexts, start transport, wire up LifeCycle subscriptions

**Logs:**
- Location: `packages/logs/src/entries/main.ts`
- Triggers: Application calls `datadogLogs.init()`
- Responsibilities: Initialize log collection, start transport, expose DD_LOGS global

**React Plugin:**
- Location: `packages/rum-react/src/entries/main.ts`
- Triggers: Application passes plugin to `datadogRum.init()`
- Responsibilities: React error boundary, performance tracking, React Router integration

## Error Handling

**Strategy:** Monitored execution with fallback to ensure SDK never breaks host application

**Patterns:**
- `monitor()` and `monitored()` decorators wrap SDK functions to catch and report internal errors
- `catchUserErrors()` wraps user-provided callbacks to isolate user code failures
- `trackRuntimeError()` reports SDK errors to telemetry without throwing
- `computeRawError()` normalizes error objects with stack traces
- Multiple error sources tracked: console.error, window.onerror, unhandledrejection, CSP violations, ReportingObserver

## Cross-Cutting Concerns

**Logging:** Console display utilities with debug mode, warning/error helpers in `packages/core/src/tools/display.ts`

**Validation:** Type checking and sanitization in context managers, JSON schema validation for remote config, field modification limits in assembly

**Authentication:** Customer API keys in configuration, session tokens in cookies, synthetics test detection, tracking consent state management

---

*Architecture analysis: 2026-01-21*
