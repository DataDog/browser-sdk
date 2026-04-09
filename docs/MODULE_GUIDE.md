# Building SDK Modules

Guide for building new product modules (like RUM) for the v8 SDK architecture. Based on learnings from building `browser-logs-next`.

## Architecture Overview

```
collector modules (publish resources)
  → pipeline (enrichers transform data)
    → product module processor (transforms resources → observations)
      → pipeline enrichers (session, tags, metadata, rate limit)
        → batch subscriber (beforeSend gate → JSON serialize → batch.add)
          → batch flush → transport → Datadog intake
```

Modules never touch the transport. They interact only with the pipeline.

## The Module Interface

Every module implements `Module` from `core-next`:

```ts
interface Module {
  name: string
  extension: Extension<TKey, TInit, TConfig, TDerived>
  init(context: ModuleContext): Record<string, unknown>
}

interface ModuleContext {
  config: Configuration & Record<string, unknown>
  pipeline: Pipeline<Record<string, unknown>>
  session: Session
}
```

- `name` — unique identifier, matches the config key (e.g. `'logs'`, `'rum'`)
- `extension` — validates and transforms the module's config slice
- `init` — called by the SDK after configuration is built. Returns the public API.

## Pipeline Event Categories

Events flow through the pipeline in four categories:

| Category        | Published by      | Consumed by          | Example                                                                  |
| --------------- | ----------------- | -------------------- | ------------------------------------------------------------------------ |
| `resource:*`    | Collector modules | Product modules      | `resource:console`, `resource:runtime_error`, `resource:network_request` |
| `action:*`      | Public API calls  | Product modules      | `action:log` (from `logger.info()`)                                      |
| `signal:*`      | Any module        | Any module           | `signal:session_expired`, `signal:view_created`                          |
| `observation:*` | Product modules   | SDK batch subscriber | `observation:log`, `observation:rum_view`                                |

Resources and signals are shared. Observations are what gets sent to Datadog.

## Collector Modules

Collectors are modules without a public API. They monkey-patch browser APIs, capture data, and publish resources.

**Pattern:**

```ts
const consoleModule: Module = {
  name: 'console',
  extension: { key: 'console', validate: () => ({}) },
  init(context) {
    const stop = startConsoleCollection(context.pipeline)
    return { stop }
  },
}
```

**Key rules:**

- Save original references before patching (avoid infinite loops)
- Publish raw data — let enrichers normalize it (e.g. stack traces)
- Return a `stop()` function that restores originals
- Don't import from product modules — collectors are independent

**Existing collectors:**

- `browser-console-next` — `resource:console`
- `browser-errors-next` — `resource:runtime_error`, `resource:report`
- `browser-network-next` — `resource:network_request`

## Product Module Structure

```
packages/browser-logs-next/
├── src/
│   ├── module.ts               — Module implementation (init, extension, public API)
│   ├── domain/
│   │   ├── configuration.ts    — Extension (validate + build)
│   │   ├── processor.ts        — Subscribes to resources, publishes observations
│   │   ├── logger.ts           — Domain-specific class (Logger for logs, ViewTracker for RUM, etc.)
│   │   ├── rateLimitEnricher.ts — Module-specific pipeline enricher
│   │   └── beforeSendEnricher.ts
│   └── index.ts
```

## The Processor

The processor is the core of a product module. It subscribes to resources and actions, transforms them into observations, and publishes them.

**What it does:**

- Subscribes to `resource:*` events based on config (e.g. `forwardConsoleLogs`)
- Subscribes to `action:*` events from the public API
- Merges context (global, user, account)
- Publishes `observation:{type}` events

**What it does NOT do:**

- `beforeSend` — handled at the batch boundary by the SDK
- Rate limiting — a separate enricher on `observation:*`
- Stack trace parsing — an enricher on `resource:*`
- Session/tags/metadata — enrichers registered by the SDK

## Enricher Registration Order

The SDK registers enrichers in this order on `observation:*`:

1. **`metadataEnricher`** — `date`, `source`, `service`
2. **`sessionEnricher`** — `session: { id }` (discards if expired)
3. **`internalContextEnricher`** — `_dd: { format_version: 2, browser_sdk_version }`
4. **`tagsEnricher`** — `ddtags: "sdk_version:...,env:...,service:...,version:..."`
5. **`anonymousUser`** — `usr.anonymous_id` from device ID (if `trackAnonymousUser`)

Modules register their own enrichers AFTER the SDK's core enrichers:

6. **Module-specific enrichers** — e.g. `rateLimitEnricher` on `observation:log`

On `resource:*`, the SDK registers:

1. **`stackTraceEnricher`** — normalizes `error.stack` on `resource:console` and `resource:runtime_error`

## Where Things Live

| Concern                     | Location                                                 | Why                                                          |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Stack trace parsing         | Enricher on `resource:console`, `resource:runtime_error` | Centralized, collectors stay simple                          |
| beforeSend                  | SDK batch subscriber                                     | Last gate before sending, doesn't affect pipeline event flow |
| Rate limiting               | Enricher on `observation:{type}` per module              | Module-specific limits                                       |
| Session context             | Enricher on `observation:*`                              | Cross-cutting, all products need it                          |
| Global/user/account context | Processor merges into observation                        | Module owns its context managers                             |
| Error fingerprint/causes    | Resource types + processor passthrough                   | Collectors extract, processor includes in observation        |

## Configuration Extension

Each module defines a config `Extension` that validates its init options:

```ts
const logsExtension: Extension<'logs', LogsInitConfig, LogsConfig> = {
  key: 'logs',
  validate(init) {
    if (!init) return null
    return {
      forwardErrorsToLogs: init.forwardErrorsToLogs ?? true,
      forwardConsoleLogs: expandAll(init.forwardConsoleLogs),
      // ...
    }
  },
}
```

The customer's config uses the module name as the key:

```ts
createSdk({
  clientToken: '...',
  site: 'datadoghq.com',
  modules: [logs],
  logs: { forwardErrorsToLogs: true }, // ← validated by logsExtension
})
```

The `build` function in `core-next` calls each extension's `validate` and merges the result into the resolved config under `config.logs`.

## Public API Pattern

`init()` returns a `Record<string, unknown>` — the module's public API. The SDK attaches it to the SDK object under `sdk[module.name]`.

```ts
init(context): LogsPublicApi {
  const globalContext = new ContextManager()
  const userContext = new ContextManager()
  const accountContext = new ContextManager()

  // Wire processor
  startProcessor({ pipeline: context.pipeline, config, globalContext, userContext, accountContext })

  return {
    logger: defaultLogger,
    createLogger, getLogger,
    setGlobalContext, getGlobalContext, ...
    setUser, getUser, ...
    setAccount, getAccount, ...
  }
}
```

Context managers from `core-next` handle get/set/property/remove/clear. They emit `change` events and support generics for type-safe access.

## Testing Patterns

### Unit testing a processor

```ts
const pipeline = new Pipeline<Record<string, unknown>>()
const observations: LogEvent[] = []
pipeline.subscribe('observation:log', (event) => observations.push(event as LogEvent))

startProcessor({ pipeline, config, globalContext, userContext, accountContext })
pipeline.seal()

pipeline.publish('resource:console', { api: 'error', message: 'test', error: new Error('test') })
await new Promise((resolve) => setTimeout(resolve, 0)) // pipeline is async

expect(observations.length).toBe(1)
```

### Unit testing a collector

```ts
const pipeline = new Pipeline<Record<string, unknown>>()
const collected: ConsoleResource[] = []
pipeline.subscribe('resource:console', (event) => collected.push(event as ConsoleResource))
pipeline.seal()

const stop = startConsoleCollection(pipeline)

console.error('test')
await new Promise((resolve) => setTimeout(resolve, 0))

expect(collected.length).toBe(1)
stop()
```

### Integration testing (full stack)

```ts
const sdk = await createSdk({
  clientToken: 'test',
  site: 'datadoghq.com',
  modules: [consoleModule, errorsModule, logsModule],
  logs: { forwardConsoleLogs: 'all' },
})

sdk.logs.logger.info('test')
await tick()
flushBatch()

expect(fetchSpy).toHaveBeenCalled()
const body = JSON.parse((fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string)
expect(body.session.id).toBeDefined()
```

### Cookie test isolation

When testing cookie-based functionality across multiple spec files, use `beforeEach` cleanup and `Document.prototype` for cookie overrides (not `document`):

```ts
// Correct: override on prototype
const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
Object.defineProperty(Document.prototype, 'cookie', { ... })
// Restore in finally block
Object.defineProperty(Document.prototype, 'cookie', original)
```

### Pipeline async behavior

The pipeline processes events asynchronously. After publishing, await a microtask before asserting:

```ts
pipeline.publish('resource:console', data)
await new Promise((resolve) => setTimeout(resolve, 0))
expect(observations.length).toBe(1)
```

## Checklist for New Modules

1. **Create the package** — `packages/browser-{name}-next/`
2. **Define the Extension** — `domain/configuration.ts` with `validate` + optional `build`
3. **Create the processor** — `domain/processor.ts` subscribing to resources, publishing observations
4. **Create domain classes** — e.g. `Logger`, `ViewTracker`, whatever the module needs
5. **Register module-specific enrichers** — rate limiter, etc. on `observation:{name}`
6. **Return the public API** from `init()`
7. **Tests** — unit tests for processor + domain classes, integration test with `createSdk`
8. **Barrel exports** — `index.ts` with module, types, and domain classes

## Size Budget

The v8 logs stack (core-next + browser-core-next + browser-sdk + 3 collectors + logs module) is **23.6 KB minified / 8.4 KB gzip** — 60% smaller than v6's equivalent 58.5 KB / 21.9 KB.

Keep modules lean. The modular architecture means customers only ship what they use.
