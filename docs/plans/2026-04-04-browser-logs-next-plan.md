# browser-logs-next Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create four packages — three collector modules (console, errors, network) and the logs product module — achieving feature parity with `@datadog/browser-logs`.

**Architecture:** Collector modules monkey-patch browser APIs, publish resources into the shared pipeline. The logs module subscribes to those resources, transforms them into log observations through assembly (enrichment + beforeSend + rate limiting), and pushes observations into the pipeline. The SDK's batch subscriber picks up observations and sends them. The Logger class provides the programmatic API.

**Tech Stack:** TypeScript, Karma/Jasmine unit tests

**Reference files (old logs):**

- `packages/logs/src/domain/logger.ts`
- `packages/logs/src/domain/assembly.ts`
- `packages/logs/src/domain/console/consoleCollection.ts`
- `packages/logs/src/domain/runtimeError/runtimeErrorCollection.ts`
- `packages/logs/src/domain/networkError/networkErrorCollection.ts`
- `packages/logs/src/domain/report/reportCollection.ts`

---

### Task 1: Pipeline event types (core-next)

Define the shared event map types that all modules use.

**Files:**

- Create: `packages/core-next/src/domain/pipeline/events.ts`
- Modify: `packages/core-next/src/domain/pipeline/pipeline.ts` — re-export
- Modify: `packages/core-next/src/index.ts` — export types

**Implementation:**

Define resource, signal, and observation type interfaces. These are the shared contracts — collectors publish resources, modules publish observations.

```ts
// events.ts

// Resources — published by collectors
interface ConsoleResource {
  api: 'log' | 'debug' | 'info' | 'warn' | 'error'
  message: string
  stack?: string
  error?: Error
}

interface RuntimeErrorResource {
  message: string
  stack?: string
  type?: string
  source: 'source'
  causes?: Array<{ message: string; type?: string; stack?: string }>
}

interface ReportResource {
  type: string
  message: string
  stack?: string
  subtype?: string
}

interface NetworkRequestResource {
  method: string
  url: string
  status: number
  isAborted: boolean
  duration: number
  responseBody?: string
  error?: string
}

// The shared event map
interface SdkEventMap {
  'resource:console': ConsoleResource
  'resource:runtime_error': RuntimeErrorResource
  'resource:report': ReportResource
  'resource:network_request': NetworkRequestResource
  'signal:session_expired': void
  'signal:session_renewed': void
  [key: string]: unknown // extensible for module-specific events
}

export type { ConsoleResource, RuntimeErrorResource, ReportResource, NetworkRequestResource, SdkEventMap }
```

No tests — pure types.

**Commit:**

```bash
git commit -m "🏷️ Add shared pipeline event types"
```

---

### Task 2: browser-console-next

Captures console output by monkey-patching `console.*` methods. Publishes `resource:console`.

**Files:**

- Create: `packages/browser-console-next/package.json`
- Create: `packages/browser-console-next/src/index.ts`
- Create: `packages/browser-console-next/src/module.ts`
- Create: `packages/browser-console-next/src/consoleCollector.ts`
- Create: `packages/browser-console-next/src/consoleCollector.spec.ts`

**Module:**

```ts
// module.ts
import type { Module, ModuleContext } from '@datadog/core-next'
import { startConsoleCollection } from './consoleCollector'

const console: Module = {
  name: 'console',
  extension: {
    key: 'console',
    validate: () => ({}),
  },
  init(context: ModuleContext) {
    const stop = startConsoleCollection(context.pipeline)
    return { stop }
  },
}

export { console }
```

**Console collector:**

Monkey-patches `console.log`, `console.debug`, `console.info`, `console.warn`, `console.error`. For each call, publishes a `resource:console` event with the message, api name, stack trace (for error/warn), and the Error object if passed.

Reference: `packages/logs/src/domain/console/consoleCollection.ts` and `packages/core/src/domain/error/trackConsoleError.ts`

Key: use the ORIGINAL console methods to avoid infinite loops. Save references before patching.

**Tests:**

1. Publishes `resource:console` when `console.error` is called
2. Publishes `resource:console` when `console.warn` is called
3. Publishes `resource:console` when `console.log` is called
4. Includes the message in the resource
5. Includes the `api` field matching the console method
6. Includes error object when an Error is passed to `console.error`
7. Includes stack trace for error calls
8. `stop()` restores original console methods
9. Does not publish after `stop()` is called

**Verification:**

```bash
yarn test:unit --spec packages/browser-console-next/src/consoleCollector.spec.ts
```

**Commit:**

```bash
git commit -m "✨ Add browser-console-next collector module"
```

---

### Task 3: browser-errors-next

Captures runtime errors and Reporting API events.

**Files:**

- Create: `packages/browser-errors-next/package.json`
- Create: `packages/browser-errors-next/src/index.ts`
- Create: `packages/browser-errors-next/src/module.ts`
- Create: `packages/browser-errors-next/src/runtimeErrorCollector.ts`
- Create: `packages/browser-errors-next/src/runtimeErrorCollector.spec.ts`
- Create: `packages/browser-errors-next/src/reportCollector.ts`
- Create: `packages/browser-errors-next/src/reportCollector.spec.ts`

**Runtime error collector:**

Listens to `window.addEventListener('error')` and `window.addEventListener('unhandledrejection')`. Publishes `resource:runtime_error`.

Reference: `packages/core/src/domain/error/trackRuntimeError.ts`

**Report collector:**

Listens to the Reporting API via `new ReportingObserver()`. Publishes `resource:report`.

Reference: `packages/logs/src/domain/report/reportCollection.ts` and `packages/core/src/domain/report/reportObservable.ts`

**Runtime error tests:**

1. Publishes `resource:runtime_error` on uncaught error
2. Includes message and stack trace
3. Publishes `resource:runtime_error` on unhandled rejection
4. `stop()` removes event listeners

**Report collector tests:**

1. Publishes `resource:report` when a report is observed
2. Includes report type, message, and subtype
3. `stop()` disconnects the ReportingObserver
4. Does not crash when ReportingObserver is not available

**Commit:**

```bash
git commit -m "✨ Add browser-errors-next collector module"
```

---

### Task 4: browser-network-next

Captures XHR and Fetch request lifecycle.

**Files:**

- Create: `packages/browser-network-next/package.json`
- Create: `packages/browser-network-next/src/index.ts`
- Create: `packages/browser-network-next/src/module.ts`
- Create: `packages/browser-network-next/src/xhrCollector.ts`
- Create: `packages/browser-network-next/src/xhrCollector.spec.ts`
- Create: `packages/browser-network-next/src/fetchCollector.ts`
- Create: `packages/browser-network-next/src/fetchCollector.spec.ts`

**XHR collector:**

Monkey-patches `XMLHttpRequest.prototype.open` and `XMLHttpRequest.prototype.send`. On completion (load/error/abort), publishes `resource:network_request`.

Reference: `packages/core/src/browser/xhrObservable.ts`

**Fetch collector:**

Monkey-patches `window.fetch`. On response or rejection, publishes `resource:network_request`.

Reference: `packages/core/src/browser/fetchObservable.ts`

**XHR tests:**

1. Publishes `resource:network_request` when XHR completes
2. Includes method, url, status
3. Includes `isAborted: true` when XHR is aborted
4. `stop()` restores original XHR methods

**Fetch tests:**

1. Publishes `resource:network_request` when fetch resolves
2. Includes method, url, status
3. Publishes with `status: 0` when fetch rejects (network error)
4. `stop()` restores original fetch

**Commit:**

```bash
git commit -m "✨ Add browser-network-next collector module"
```

---

### Task 5: browser-logs-next — package scaffold + configuration

**Files:**

- Create: `packages/browser-logs-next/package.json`
- Create: `packages/browser-logs-next/src/index.ts`
- Create: `packages/browser-logs-next/src/domain/configuration.ts`
- Create: `packages/browser-logs-next/src/domain/configuration.spec.ts`

**Configuration extension:**

```ts
interface LogsInitConfig {
  beforeSend?: (event: LogEvent) => boolean | void
  forwardErrorsToLogs?: boolean
  forwardConsoleLogs?: ConsoleApi[] | 'all'
  forwardReports?: ReportType[] | 'all'
}

interface LogsConfig {
  forwardErrorsToLogs: boolean
  forwardConsoleLogs: ConsoleApi[]
  forwardReports: ReportType[]
}
```

The `Extension` validates the config and applies defaults (`forwardErrorsToLogs: true`, empty arrays for console/reports unless specified).

**Tests:**

1. Returns valid config with defaults when no options provided
2. Returns `forwardErrorsToLogs: true` by default
3. Returns empty `forwardConsoleLogs` by default
4. Expands `'all'` for `forwardConsoleLogs` to all console APIs
5. Returns null for invalid forwardConsoleLogs values
6. Passes through `beforeSend` callback

**Commit:**

```bash
git commit -m "✨ Add browser-logs-next scaffold and configuration"
```

---

### Task 6: browser-logs-next — Logger class

**Files:**

- Create: `packages/browser-logs-next/src/domain/logger.ts`
- Create: `packages/browser-logs-next/src/domain/logger.spec.ts`

**Implementation:**

Port the Logger class from `packages/logs/src/domain/logger.ts`.

- 9 log levels: ok, debug, info, notice, warn, error, critical, alert, emerg
- 3 handler types: console, http, silent
- Context management (set/get/setProperty/removeProperty/clear)
- Tag management (addTag/removeTagsWithKey/getTags)
- Level filtering (messages below current level are dropped)
- Handler routing (console → console.log, http → callback, silent → nothing)

The Logger takes a `handleLog` callback in the constructor. The module wires this to the pipeline during init.

**Tests:**

1. Logs at each level via convenience methods
2. Filters messages below the current level
3. Routes to console handler
4. Routes to http handler (calls the callback)
5. Silent handler produces no output
6. Multiple handlers work simultaneously
7. Context management (set, get, property, clear)
8. Tag management (add, remove, get)
9. Level and handler can be changed after creation

**Commit:**

```bash
git commit -m "✨ Add Logger class for browser-logs-next"
```

---

### Task 7: browser-logs-next — Rate limiter

**Files:**

- Create: `packages/browser-logs-next/src/domain/rateLimiter.ts`
- Create: `packages/browser-logs-next/src/domain/rateLimiter.spec.ts`

**Implementation:**

Per-status rate limiter. Allows N events per status per minute. Returns `true` if the event should be sent, `false` if rate-limited.

```ts
function createRateLimiter(limit: number = 200): {
  isLimitReached(status: string): boolean
}
```

Reference: `packages/core/src/tools/eventRateLimiter.ts`

**Tests:**

1. Allows events under the limit
2. Blocks events over the limit for the same status
3. Different statuses have independent limits
4. Limit resets after the time window

**Commit:**

```bash
git commit -m "✨ Add rate limiter for browser-logs-next"
```

---

### Task 8: browser-logs-next — Assembly

**Files:**

- Create: `packages/browser-logs-next/src/domain/assembly.ts`
- Create: `packages/browser-logs-next/src/domain/assembly.spec.ts`

**Implementation:**

The assembly transforms raw resources and logger calls into log observations. It:

1. Subscribes to `resource:console`, `resource:runtime_error`, `resource:network_request`, `resource:report` (based on config)
2. Subscribes to `action:log` (from the Logger)
3. Enriches each event with: view URL, session ID, global context, user context
4. Applies `beforeSend` callback (can modify or discard)
5. Applies rate limiting
6. Publishes `observation:log`

```ts
interface LogEvent {
  date: number
  message: string
  status: string
  origin: string
  session_id?: string
  view: { url: string }
  error?: { kind?: string; stack?: string; message?: string }
  http?: { method: string; status_code: number; url: string }
  logger?: { name: string }
  [key: string]: unknown
}
```

**Tests:**

1. Transforms `resource:console` into `observation:log` with origin=console
2. Transforms `resource:runtime_error` into `observation:log` with origin=source
3. Transforms `resource:network_request` (error) into `observation:log` with origin=network
4. Transforms `resource:report` into `observation:log` with origin=report
5. Transforms `action:log` into `observation:log` with origin=logger
6. Enriches with view URL
7. Applies beforeSend — allows modification
8. Applies beforeSend — discards when returning false
9. Rate limits events per status
10. Respects `forwardErrorsToLogs: false` (skips runtime and network errors)
11. Respects `forwardConsoleLogs` filter
12. Respects `forwardReports` filter

**Commit:**

```bash
git commit -m "✨ Add log assembly for browser-logs-next"
```

---

### Task 9: browser-logs-next — Module + Public API

Wire everything together.

**Files:**

- Create: `packages/browser-logs-next/src/module.ts`
- Create: `packages/browser-logs-next/src/publicApi.ts`
- Create: `packages/browser-logs-next/src/module.spec.ts`
- Modify: `packages/browser-logs-next/src/index.ts`

**Module:**

```ts
const logs: Module = {
  name: 'logs',
  extension: logsExtension,
  init(context: ModuleContext): LogsPublicApi {
    const config = context.config.logs as LogsConfig
    const globalContext = new ContextManager()
    const userContext = new ContextManager()
    const defaultLogger = new Logger(handleLog, 'default')

    // Wire logger to pipeline
    function handleLog(message: LogsMessage, logger: Logger) {
      context.pipeline.publish('action:log', { ...message, logger: logger.getName() })
    }

    // Start assembly (subscribes to resources, publishes observations)
    startAssembly(context.pipeline, config, globalContext, userContext, context.session)

    // Subscribe observations to batch (SDK already does this for observation:*)
    // Return public API
    return {
      logger: defaultLogger,
      createLogger, getLogger,
      setGlobalContext, getGlobalContext, ...
      setUser, getUser, ...
    }
  },
}
```

**Public API:**

```ts
interface LogsPublicApi {
  logger: Logger
  createLogger(name: string, config?: LoggerConfiguration): Logger
  getLogger(name: string): Logger | undefined
  setGlobalContext(context: object): void
  getGlobalContext(): object
  setGlobalContextProperty(key: string, value: unknown): void
  removeGlobalContextProperty(key: string): void
  clearGlobalContext(): void
  setUser(user: object): void
  getUser(): object
  setUserProperty(key: string, value: unknown): void
  removeUserProperty(key: string): void
  clearUser(): void
}
```

**Tests:**

1. Module init returns a public API with logger
2. `logger.info()` produces an `observation:log` event in the pipeline
3. `createLogger` creates a named logger
4. `getLogger` retrieves a named logger
5. Global context is included in log events
6. User context is included in log events
7. Full pipeline integration: `console.error()` → `resource:console` → assembly → `observation:log`

**Commit:**

```bash
git commit -m "✨ Add logs module and public API"
```

---

### Task 10: SDK wiring update

Update `createSdk` to subscribe to `observation:*` events and add them to the batch.

**Files:**

- Modify: `packages/browser-sdk/src/domain/sdk.ts`
- Modify: `packages/browser-sdk/src/domain/sdk.spec.ts`

Currently the SDK creates a batch but nothing connects pipeline observations to the batch. Add a pipeline subscription that serializes observations and adds them to the batch:

```ts
// Subscribe to all observation events
pipeline.subscribe('observation:log', (event) => {
  batch.add(JSON.stringify(event))
})
```

For now, subscribe explicitly to known observation types. In the future, this could be a wildcard/pattern subscription.

**Tests:**

1. Observation events published to the pipeline are added to the batch
2. Batch flushes observations to transport

**Commit:**

```bash
git commit -m "✨ Wire pipeline observations to batch in createSdk"
```

---

### Task 11: End-to-end integration test

Create an integration test that validates the full chain: SDK + collectors + logs module.

**Files:**

- Create: `packages/browser-sdk/src/integration/logs.spec.ts`

**Tests:**

1. Full flow: `createSdk` with console + errors + network + logs modules → `sdk.logs.logger.info('test')` → observation reaches batch
2. Console forwarding: `console.error('oops')` → observation:log with origin=console
3. Runtime error: `throw new Error('oops')` → observation:log with origin=source
4. beforeSend filtering: return false → event not in batch
5. Rate limiting: burst of errors → some events dropped

**Verification:**

```bash
yarn test:unit --spec packages/browser-sdk/src/integration/logs.spec.ts
```

**Commit:**

```bash
git commit -m "✅ Add end-to-end integration test for logs"
```

---

## Execution Order

Tasks are ordered by dependency:

1. **Pipeline event types** — shared types in core-next (prerequisite for all)
2. **browser-console-next** — simplest collector
3. **browser-errors-next** — runtime + reports
4. **browser-network-next** — XHR + fetch
5. **browser-logs-next scaffold + config** — package + Extension
6. **Logger class** — the core API
7. **Rate limiter** — used by assembly
8. **Assembly** — transforms resources → observations
9. **Module + Public API** — wires everything, returns public API
10. **SDK wiring** — connects observations to batch
11. **Integration test** — end-to-end validation

Tasks 2-4 (collectors) are independent and could be parallelized. Tasks 5-9 (logs module) are sequential.
