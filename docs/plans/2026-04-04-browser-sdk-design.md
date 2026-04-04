# browser-sdk Design

**Goal:** Create the unified browser SDK package that orchestrates module loading, owns the data pipeline, and provides the public API surface for customers.

**Architecture:** `browser-sdk` is the top-level orchestrator. It wires `core-next` (pipeline, config, session, batch) with `browser-core-next` (transport, session stores, encoders). Product modules (RUM, Logs) are plugins that register via a `Module` interface — they produce and transform events through the pipeline but never touch transport directly.

```
@datadog/core-next                      (pipeline, config, session, batch, registry)
└─ @datadog/browser-core-next           (transport, session stores, encoders)
   └─ @datadog/browser-sdk              (orchestrator: init, module loading, public API)
      ├─ @datadog/browser-rum           (RUM module + public API)
      └─ @datadog/browser-logs          (Logs module + public API)
```

## Module Interface

Modules are plugins that the SDK calls during initialization. They interact only with the pipeline — no direct access to transport, batch, or session stores.

```ts
interface Module {
  name: string
  extension: Extension<string, unknown, unknown, unknown>
  init(context: ModuleContext): void
}

interface ModuleContext {
  config: Configuration
  pipeline: Pipeline
  session: Session
}
```

- `name` — unique identifier (e.g. `'rum'`, `'logs'`)
- `extension` — config validation and optional derived values via the `Extension` interface from `core-next`
- `init` — called by the SDK after configuration is resolved. Registers enrichers, subscribes to pipeline events, sets up event collection.

## Module Loading

Two paths, supporting both bundler and CDN users:

### Explicit (npm / bundler)

Static imports, tree-shakeable. The customer passes modules directly:

```ts
import { createSdk } from '@datadog/browser-sdk'
import { rum } from '@datadog/browser-rum/module'
import { logs } from '@datadog/browser-logs/module'

const sdk = createSdk({
  clientToken: 'abc',
  site: 'datadoghq.com',
  modules: [rum, logs],
  rum: { applicationId: 'xyz' },
  logs: { forwardErrorsToLogs: true },
})
```

### Auto-detection (CDN / dynamic)

Config keys trigger dynamic `import()` of the corresponding module. The SDK detects which modules to load based on the presence of config keys:

```ts
// CDN
DD_SDK.init({
  clientToken: 'abc',
  site: 'datadoghq.com',
  rum: { applicationId: 'xyz' },
})
// SDK sees "rum" key → dynamically loads @datadog/browser-rum/module
```

For npm users who prefer auto-detection, `createSdk` returns a Promise:

```ts
const sdk = await createSdk({
  rum: { applicationId: 'xyz' },
})
```

The dynamic import requires the module package to be installed even if not explicitly imported.

## Public API

### npm users

`createSdk()` returns the SDK object with module APIs attached:

```ts
const sdk = createSdk({ modules: [rum, logs], ... })
sdk.rum.addAction('click', { target: 'button' })
sdk.logs.logger.info('checkout started')
```

### CDN users

The SDK registers on a global. All module APIs are accessible from the same global:

```ts
DD_SDK.rum.addAction('click', { target: 'button' })
DD_SDK.logs.logger.info('checkout started')
```

### Module package entrypoints

Each module package exports two entrypoints:

- `@datadog/browser-rum/module` — the `Module` object (for the SDK to call during init)
- `@datadog/browser-rum` — the public API facade (finds the SDK via the registry and delegates calls)

## SDK Registry

Lives in `core-next` as a module-level `Map<string, SdkInstance>`. Both `browser-sdk` and module packages import from the same `core-next`, so bundlers share the same `Map`.

```ts
// core-next/src/registry.ts
const instances = new Map<string, SdkInstance>()

function registerSdk(id: string, sdk: SdkInstance): void
function getSdk(id?: string): SdkInstance | undefined
```

- Default instance ID: `'default'`
- npm users don't need the registry — they hold a direct reference from `createSdk()`
- CDN builds use the registry to connect the global with the module APIs

## Global Registration

One global for the whole SDK, not per module.

- **Default:** `window.DD_SDK`
- **CDN customizable:** `?target=MY_SDK` query string on the script tag URL
- **npm:** no global needed, direct reference from `createSdk()`

The CDN entry reads `document.currentScript.src` to parse the target:

```ts
function getTargetGlobal(): string {
  const script = document.currentScript as HTMLScriptElement | null
  if (script?.src) {
    const url = new URL(script.src)
    return url.searchParams.get('target') ?? 'DD_SDK'
  }
  return 'DD_SDK'
}
```

This enables multiple SDK instances on the same page (e.g. staging + production) by loading the script twice with different `?target=` values.

## Init Flow

1. `createSdk(config)` called
2. Resolve modules — explicit `modules` array, or auto-detect from config keys via dynamic import
3. Build configuration — base config + each module's `Extension` (validate + optional build)
4. Create session — auto-select store (cookie → localStorage → memory)
5. Create pipeline
6. Create batch + transport (HttpRequest with retry, encoder)
7. Wire pipeline to batch — pipeline events flow into `batch.add()`
8. Wire page exit — `visibilitychange` / `beforeunload` → `batch.flush()`
9. Wire session expire — `session.on('expired')` → `batch.flush()`
10. For each module: call `module.init({ config, pipeline, session })`
11. Register SDK — on global (CDN) or return reference (npm)

## Package Structure

```
packages/browser-sdk/
├── src/
│   ├── domain/
│   │   ├── sdk.ts              — createSdk(), module orchestration, wiring
│   │   ├── moduleLoader.ts     — dynamic import logic for auto-detection
│   │   └── registry.ts         — re-exports from core-next registry
│   ├── boot/
│   │   └── cdn.ts              — CDN entry, global registration, query string parsing
│   └── index.ts                — public exports
├── package.json
└── tsconfig.json
```

## Dependencies

- `@datadog/core-next` (peer) — Pipeline, Configuration, Session, Batch, EventEmitter, registry
- `@datadog/browser-core-next` (peer) — createHttpRequest, selectStore, encoders, event bridge

Module packages (`browser-rum`, `browser-logs`) are NOT dependencies of `browser-sdk`. They're loaded explicitly by the customer or dynamically via `import()`.

## Future Improvements

- **Remote configuration** — fetch module config from a remote endpoint, enabling feature flags and A/B testing without code changes
- **Module hot-loading** — load additional modules after SDK init (e.g. load Session Replay only when needed)
- **Buffered commands** — public API buffers commands before SDK init, replays them after (like the current v6 async snippet pattern)
