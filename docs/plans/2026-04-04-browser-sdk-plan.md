# browser-sdk Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the `browser-sdk` package — the top-level orchestrator that wires `core-next` and `browser-core-next` together, handles module loading, and provides the unified SDK entry point.

**Architecture:** `createSdk()` builds configuration, creates session/pipeline/batch/transport, wires lifecycle hooks, initializes modules, and returns an SDK object with module APIs attached. Modules are plugins conforming to a `Module` interface. A registry in `core-next` enables CDN builds to share state across script tags.

**Tech Stack:** TypeScript, Karma/Jasmine unit tests

**Reference files:**

- `packages/core-next/src/index.ts` — Pipeline, Configuration, Session, Batch, Extension
- `packages/browser-core-next/src/index.ts` — createHttpRequest, selectStore, encoders
- `docs/plans/2026-04-04-browser-sdk-design.md` — full design doc

---

### Task 1: SDK registry in core-next

The registry is a module-level `Map` in `core-next` that allows the SDK and module packages to find each other without globals.

**Files:**

- Create: `packages/core-next/src/domain/registry/index.ts`
- Create: `packages/core-next/src/domain/registry/index.spec.ts`
- Modify: `packages/core-next/src/index.ts`

**Implementation:**

```ts
// registry/index.ts
const instances = new Map<string, unknown>()

function registerSdk(id: string, sdk: unknown): void {
  instances.set(id, sdk)
}

function getSdk<T = unknown>(id: string = 'default'): T | undefined {
  return instances.get(id) as T | undefined
}

function unregisterSdk(id: string = 'default'): void {
  instances.delete(id)
}

export { registerSdk, getSdk, unregisterSdk }
```

**Tests:**

1. `registerSdk` + `getSdk` round-trip
2. `getSdk` returns `undefined` when not registered
3. `getSdk` defaults to `'default'` id
4. `unregisterSdk` removes the instance
5. Multiple instances with different ids

**Verification:**

```bash
yarn test:unit --spec packages/core-next/src/domain/registry/index.spec.ts
```

**Commit:**

```bash
git commit -m "✨ Add SDK registry to core-next"
```

---

### Task 2: Module interface in core-next

Define the `Module` and `ModuleContext` interfaces that product modules (RUM, Logs) implement.

**Files:**

- Create: `packages/core-next/src/domain/module/index.ts`
- Modify: `packages/core-next/src/index.ts`

**Implementation:**

```ts
// module/index.ts
import type { Configuration } from '../configuration'
import type { Extension } from '../configuration'
import type { Pipeline } from '../pipeline/pipeline'
import type { Session } from '../session/session'

interface ModuleContext {
  config: Configuration & Record<string, unknown>
  pipeline: Pipeline<Record<string, unknown>>
  session: Session
}

interface Module<TKey extends string = string, TInit = unknown, TConfig = unknown, TDerived = object> {
  name: TKey
  extension: Extension<TKey, TInit, TConfig, TDerived>
  init(context: ModuleContext): Record<string, unknown>
}

export type { Module, ModuleContext }
```

`init` returns a `Record<string, unknown>` — the module's public API (e.g. `{ addAction, setUser }` for RUM). The SDK attaches this under `sdk[module.name]`.

No tests needed — pure types. Add exports to `packages/core-next/src/index.ts`.

**Commit:**

```bash
git commit -m "✨ Add Module and ModuleContext interfaces"
```

---

### Task 3: Package scaffold

**Files:**

- Create: `packages/browser-sdk/package.json`
- Create: `packages/browser-sdk/src/index.ts`

Model `package.json` after `packages/browser-core-next/package.json`. Peer dependencies on both `@datadog/core-next` and `@datadog/browser-core-next`.

Empty `src/index.ts` with `export {}`.

Run `yarn install` to register the workspace.

**Commit:**

```bash
git commit -m "📦 Scaffold browser-sdk package"
```

---

### Task 4: createSdk — core orchestrator

The main function that wires everything together.

**Files:**

- Create: `packages/browser-sdk/src/domain/sdk.ts`
- Create: `packages/browser-sdk/src/domain/sdk.spec.ts`

**Implementation:**

```ts
import { build, validate, Pipeline, Batch, Session } from '@datadog/core-next'
import type { InitConfiguration, Configuration, Module } from '@datadog/core-next'
import { registerSdk } from '@datadog/core-next'
import { selectStore, createHttpRequest, createIdentityEncoder } from '@datadog/browser-core-next'
import type { HttpRequestOptions } from '@datadog/browser-core-next'

interface SdkOptions {
  modules?: Module[]
  instanceId?: string
  transport?: HttpRequestOptions
}

type SdkInitConfiguration = InitConfiguration & SdkOptions & Record<string, unknown>

interface Sdk {
  [key: string]: unknown
}

async function createSdk(init: SdkInitConfiguration): Promise<Sdk | null> {
  // 1. Collect extensions from modules
  const modules = init.modules ?? []
  const extensions = modules.map((m) => m.extension)

  // 2. Build configuration
  const config = build(init, extensions)
  if (!config) {
    return null
  }

  // 3. Create session
  const store = selectStore()
  const session = await Session.create({
    store,
    generateId: () => crypto.randomUUID(),
    now: () => Date.now(),
  })

  // 4. Create pipeline
  const pipeline = new Pipeline<Record<string, unknown>>()

  // 5. Create transport + batch
  const transport = createHttpRequest({
    endpointUrl: init.transport?.endpointUrl ?? `https://${config.site}/api/v2/rum`,
    ...init.transport,
  })
  const batch = new Batch({
    maxSizeBytes: 16 * 1024,
    maxCount: 50,
    flushTimeoutMs: 30_000,
  })

  // 6. Wire batch flush → transport
  batch.on('flush', (messages) => {
    const data = messages.join('\n')
    transport.send({ data, bytesCount: data.length })
  })

  // 7. Wire page exit → batch flush
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        batch.flush()
      }
    })
    window.addEventListener('beforeunload', () => {
      batch.flush()
    })
  }

  // 8. Wire session expire → batch flush
  session.on('expired', () => {
    batch.flush()
  })

  // 9. Initialize modules
  const sdk: Sdk = {}
  const context = { config, pipeline, session }
  for (const mod of modules) {
    const api = mod.init(context)
    sdk[mod.name] = api
  }

  // 10. Seal pipeline (enricher registration is done)
  pipeline.seal()

  // 11. Register in registry
  const instanceId = init.instanceId ?? 'default'
  registerSdk(instanceId, sdk)

  return sdk
}

export { createSdk }
export type { Sdk, SdkOptions, SdkInitConfiguration }
```

**Tests:**

1. `createSdk` returns an SDK object when config is valid
2. `createSdk` returns null when config is invalid (missing clientToken)
3. `createSdk` calls `module.init` with config, pipeline, and session
4. `createSdk` attaches module API return value under `sdk[module.name]`
5. `createSdk` registers the SDK in the registry
6. `createSdk` registers with custom instanceId
7. `createSdk` seals the pipeline after module init
8. `createSdk` validates module extensions (returns null if extension validation fails)

For tests, create a stub module:

```ts
function stubModule(name: string, api: Record<string, unknown> = {}): Module {
  return {
    name,
    extension: {
      key: name,
      validate: (init) => init ?? null,
    },
    init: jasmine.createSpy('init').and.returnValue(api),
  }
}
```

**Verification:**

```bash
yarn test:unit --spec packages/browser-sdk/src/domain/sdk.spec.ts
```

**Commit:**

```bash
git commit -m "✨ Add createSdk orchestrator"
```

---

### Task 5: Module loader (dynamic import)

Auto-detect modules from config keys and load them dynamically.

**Files:**

- Create: `packages/browser-sdk/src/domain/moduleLoader.ts`
- Create: `packages/browser-sdk/src/domain/moduleLoader.spec.ts`

**Implementation:**

A module map that maps config keys to dynamic import paths:

```ts
const MODULE_MAP: Record<string, string> = {
  rum: '@datadog/browser-rum/module',
  logs: '@datadog/browser-logs/module',
}

async function loadModules(configKeys: string[], explicitModules: Module[] = []): Promise<Module[]> {
  const explicitNames = new Set(explicitModules.map((m) => m.name))
  const dynamicModules: Module[] = []

  for (const key of configKeys) {
    if (explicitNames.has(key)) continue
    if (!MODULE_MAP[key]) continue
    try {
      const mod = await import(MODULE_MAP[key])
      dynamicModules.push(mod.default ?? mod[key])
    } catch {
      console.warn(`Failed to load module "${key}"`)
    }
  }

  return [...explicitModules, ...dynamicModules]
}

export { loadModules, MODULE_MAP }
```

**Tests:**

1. Returns explicit modules as-is when no config keys match
2. Skips config keys that already have explicit modules
3. Skips unknown config keys (not in MODULE_MAP)
4. Warns on failed dynamic import (spy on console.warn)
5. Combines explicit and dynamic modules

Note: actual dynamic imports of RUM/Logs won't work in tests (packages don't exist yet). Mock `import()` or test the logic paths only.

**Verification:**

```bash
yarn test:unit --spec packages/browser-sdk/src/domain/moduleLoader.spec.ts
```

**Commit:**

```bash
git commit -m "✨ Add dynamic module loader"
```

---

### Task 6: CDN entry + global registration

The CDN entry point that reads the query string, creates the SDK, and registers on a global.

**Files:**

- Create: `packages/browser-sdk/src/boot/cdn.ts`
- Create: `packages/browser-sdk/src/boot/cdn.spec.ts`

**Implementation:**

```ts
import { createSdk } from '../domain/sdk'
import type { SdkInitConfiguration } from '../domain/sdk'

function getTargetGlobal(): string {
  const script = document.currentScript as HTMLScriptElement | null
  if (script?.src) {
    try {
      const url = new URL(script.src)
      return url.searchParams.get('target') ?? 'DD_SDK'
    } catch {
      return 'DD_SDK'
    }
  }
  return 'DD_SDK'
}

function initCdn(config: SdkInitConfiguration): void {
  const target = getTargetGlobal()
  createSdk(config).then((sdk) => {
    if (sdk) {
      ;(globalThis as any)[target] = sdk
    }
  })
}

export { getTargetGlobal, initCdn }
```

**Tests:**

1. `getTargetGlobal` returns `'DD_SDK'` when no script element
2. `getTargetGlobal` returns `'DD_SDK'` when script has no query string
3. `getTargetGlobal` returns custom target from `?target=MY_SDK`
4. `initCdn` registers SDK on the global

**Verification:**

```bash
yarn test:unit --spec packages/browser-sdk/src/boot/cdn.spec.ts
```

**Commit:**

```bash
git commit -m "✨ Add CDN entry with global registration"
```

---

### Task 7: Package barrel + integration test

Wire up the public exports and run a full integration test.

**Files:**

- Modify: `packages/browser-sdk/src/index.ts`
- Create: `packages/browser-sdk/src/domain/index.ts`

**Implementation:**

```ts
// src/index.ts
export { createSdk } from './domain/sdk'
export type { Sdk, SdkOptions, SdkInitConfiguration } from './domain/sdk'
export { loadModules } from './domain/moduleLoader'
export { getTargetGlobal, initCdn } from './boot/cdn'
```

**Run all tests:**

```bash
yarn test:unit --spec packages/browser-sdk/src/domain/sdk.spec.ts
yarn test:unit --spec packages/browser-sdk/src/domain/moduleLoader.spec.ts
yarn test:unit --spec packages/browser-sdk/src/boot/cdn.spec.ts
```

**Run typecheck:**

```bash
yarn typecheck
```

**Commit:**

```bash
git commit -m "📦 Add barrel exports for browser-sdk"
```

---

## Execution Order

Tasks are ordered by dependency:

1. **SDK registry** — in `core-next`, needed by `createSdk`
2. **Module interface** — in `core-next`, types for the module system
3. **Package scaffold** — prerequisite for everything in `browser-sdk`
4. **createSdk** — the core orchestrator, biggest task
5. **Module loader** — dynamic import logic
6. **CDN entry** — global registration
7. **Barrel exports** — final wiring
