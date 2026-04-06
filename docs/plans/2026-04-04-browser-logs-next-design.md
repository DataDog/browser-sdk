# browser-logs-next Design

**Goal:** Create the first product module for the v8 SDK — a full-featured browser logging module with feature parity to `@datadog/browser-logs`. Also introduces three shared collector modules that publish resources into the pipeline.

**Architecture:** The logs module implements the `Module` interface from `core-next`. It subscribes to shared resources (console, errors, network) published by standalone collector modules, transforms them into log observations, and pushes them through the pipeline to the batch. The module also provides a Logger class with 9 log levels, handlers, and context management.

## Collector Modules

Three standalone collector modules publish resources into the pipeline. They have no public API — they just collect and publish. Any product module (logs, RUM) can subscribe to their resources.

### `browser-console-next`

Captures all console output by monkey-patching `console.*` methods.

```
packages/browser-console-next/
├── src/
│   ├── module.ts          — Module (no public API, just init)
│   ├── consoleCollector.ts
│   └── index.ts
```

**Publishes:** `resource:console`

```ts
interface ConsoleResource {
  api: 'log' | 'debug' | 'info' | 'warn' | 'error'
  message: string
  stack?: string
  error?: Error
}
```

### `browser-errors-next`

Captures runtime errors (`window.onerror`, `unhandledrejection`) and Reporting API events.

```
packages/browser-errors-next/
├── src/
│   ├── module.ts
│   ├── runtimeErrorCollector.ts
│   ├── reportCollector.ts
│   └── index.ts
```

**Publishes:** `resource:runtime_error`, `resource:report`

```ts
interface RuntimeErrorResource {
  message: string
  stack?: string
  type?: string
  source: 'source'
  causes?: Array<{ message: string; type?: string; stack?: string }>
}

interface ReportResource {
  type: string // 'deprecation', 'intervention', 'csp-violation'
  message: string
  stack?: string
  subtype?: string
}
```

### `browser-network-next`

Captures XHR and Fetch request lifecycle by proxying `XMLHttpRequest` and `fetch`.

```
packages/browser-network-next/
├── src/
│   ├── module.ts
│   ├── xhrCollector.ts
│   ├── fetchCollector.ts
│   └── index.ts
```

**Publishes:** `resource:network_request`

```ts
interface NetworkRequestResource {
  method: string
  url: string
  status: number
  isAborted: boolean
  duration: number
  responseBody?: string // truncated, for error reporting
  error?: string
}
```

## Pipeline Event Types

The SDK pipeline uses a shared event map with four categories:

```ts
type SdkEventMap = {
  // Resources — published by collectors
  'resource:console': ConsoleResource
  'resource:runtime_error': RuntimeErrorResource
  'resource:report': ReportResource
  'resource:network_request': NetworkRequestResource

  // Signals — internal coordination between modules
  'signal:session_expired': void
  'signal:session_renewed': void
  'signal:view_created': { id: string; url: string }

  // Actions — from public API calls
  'action:log': { message: string; status: string; context?: object; error?: Error }

  // Observations — final events for intake
  'observation:log': LogEvent
}
```

Modules subscribe to resources/actions/signals and publish observations. The batch subscriber consumes all `observation:*` events.

## Logs Module

### Module interface

```ts
const logs: Module = {
  name: 'logs',
  extension: {
    key: 'logs',
    validate(init: LogsInitConfig | undefined): LogsConfig | null,
    build(config: LogsConfig): LogsDerived,
  },
  init(context: ModuleContext): LogsPublicApi,
}
```

### Configuration

```ts
interface LogsInitConfig {
  beforeSend?: (event: LogEvent) => boolean | void
  forwardErrorsToLogs?: boolean // default: true
  forwardConsoleLogs?: ConsoleApi[] | 'all'
  forwardReports?: ReportType[] | 'all'
}
```

`forwardErrorsToLogs` controls whether the logs module subscribes to `resource:runtime_error` and `resource:network_request` (error responses only). `forwardConsoleLogs` controls which `resource:console` events are forwarded. `forwardReports` controls which `resource:report` events are forwarded.

### Logger class

Same API as old `@datadog/browser-logs`:

**Log levels (StatusType):** ok, debug, info, notice, warn, error, critical, alert, emerg

**Handler types:** console, http, silent

**Methods:**

- `log(message, context?, status?, error?)` — generic log
- `ok(message, context?, error?)` through `emerg(message, context?, error?)` — level-specific
- `setContext(context)` / `getContext()` / `setContextProperty(key, value)` / `removeContextProperty(key)` / `clearContext()`
- `addTag(key, value?)` / `removeTagsWithKey(key)` / `getTags()`
- `setHandler(handler)` / `getHandler()` / `setLevel(level)` / `getLevel()`

### Public API (returned by init)

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

  setUser(user: User): void
  getUser(): object
  setUserProperty(key: string, value: unknown): void
  removeUserProperty(key: string): void
  clearUser(): void
}
```

### Assembly flow

All log sources converge through the assembly step before becoming observations:

```
resource:console        ─┐
resource:runtime_error  ─┤
resource:network_request─┤→ assembly → beforeSend → rate limiter → observation:log
resource:report         ─┤
logger.info()           ─┘
```

Assembly enriches each event with:

- View URL and referrer
- Session ID
- Global context
- User context
- Logger context and tags
- Origin (console, source, network, logger, report)

### Rate limiting

Per-status rate limiter. Prevents a burst of errors from flooding the intake. Same behavior as old logs.

### Package structure

```
packages/browser-logs-next/
├── src/
│   ├── module.ts             — Module implementation
│   ├── domain/
│   │   ├── logger.ts         — Logger class
│   │   ├── configuration.ts  — Extension (validate + build)
│   │   ├── assembly.ts       — Resource → log observation transform
│   │   ├── rateLimiter.ts    — Per-status rate limiting
│   │   └── beforeSend.ts     — User callback wrapper
│   ├── publicApi.ts          — Public API returned by init()
│   └── index.ts
├── package.json
└── tsconfig.json
```

### Dependencies

- `@datadog/core-next` (peer) — Module, Pipeline, Extension, ContextManager
- `@datadog/browser-core-next` (peer) — browser utilities if needed

Collector modules are NOT dependencies of logs — they're sibling modules the SDK loads independently. Logs subscribes to their resources via the shared pipeline.

## SDK wiring

```ts
import { createSdk } from '@datadog/browser-sdk'
import { console } from '@datadog/browser-console-next/module'
import { errors } from '@datadog/browser-errors-next/module'
import { network } from '@datadog/browser-network-next/module'
import { logs } from '@datadog/browser-logs-next/module'

const sdk = createSdk({
  clientToken: 'abc',
  site: 'datadoghq.com',
  modules: [console, errors, network, logs],
  logs: {
    forwardErrorsToLogs: true,
    forwardConsoleLogs: 'all',
  },
})

sdk.logs.logger.info('checkout started', { cart_size: 3 })
```

## Future improvements

- **Lazy collector loading** — SDK dynamically imports collector modules only when the consuming module's config requires them (e.g. skip network collector if no module needs network resources)
- **Account context** — `setAccount()` / `getAccount()` API (same as old logs)
- **PCI intake** — `usePciIntake` option for US1 compliance
