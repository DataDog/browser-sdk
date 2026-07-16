# Remote Config Logs Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support `logs.forwardErrorsToLogs`, `logs.forwardConsoleLogs`, and `logs.forwardReports` in the remote configuration by moving the shared fetch/cache infrastructure from `browser-rum-core` to `browser-core`, then wiring `browser-logs` to use it.

**Architecture:** The remote config fetch and cache are extracted into `browser-core` as generic, SDK-agnostic utilities. `browser-rum-core` and `browser-logs` each import these shared primitives and implement their own `applyRemoteConfiguration` function for their respective fields. The generated types file moves to `browser-core` as the single source of truth for `RemoteConfiguration`.

**Tech Stack:** TypeScript, Jasmine/Karma unit tests, Playwright E2E tests, `yarn json-schemas:generate` for type generation.

---

## File Map

### New files
- `packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationCache.ts` — cache read/write (moved from `browser-rum-core`)
- `packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationFetch.ts` — generic `fetchRemoteConfiguration` + `buildEndpoint` + `getRemoteConfigurationId`
- `packages/browser-core/src/domain/remoteConfiguration/remoteConfiguration.types.ts` — generated types (moved from `browser-rum-core`, regenerated)
- `packages/browser-core/src/domain/remoteConfiguration/index.ts` — barrel export
- `packages/browser-logs/src/domain/remoteConfiguration.ts` — logs-specific `applyLogsRemoteConfiguration` + `SUPPORTED_LOGS_FIELDS`

### Modified files
- `remote-configuration/rum-sdk-config.json` — add `logs` section
- `scripts/lib/generatedSchemaTypes.ts` — point types output to `browser-core`
- `packages/browser-core/src/domain/configuration/configuration.ts` — no changes needed (rc fields stay on each SDK's init config)
- `packages/browser-core/src/index.ts` — export from new `remoteConfiguration/` barrel
- `packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.ts` — delete, re-export from `browser-core`
- `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts` — delete, re-export from `browser-core`
- `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.ts` — remove moved code, import from `browser-core`
- `packages/browser-logs/src/domain/configuration.ts` — add `remoteConfigurationId`, `remoteConfiguration`, `remoteConfigurationProxy` to `LogsInitConfiguration`
- `packages/browser-logs/src/boot/preStartLogs.ts` — wire async remote config loading (same cache-first pattern as RUM)

---

## Task 1: Add `logs` to the schema and regenerate types

**Files:**
- Modify: `remote-configuration/rum-sdk-config.json`
- Modify: `scripts/lib/generatedSchemaTypes.ts`
- Auto-generated: `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts`

- [ ] **Step 1: Add `logs` section to the schema**

In `remote-configuration/rum-sdk-config.json`, add the `logs` object after `profiling`:

```json
"logs": {
  "type": "object",
  "description": "Logs feature Remote Configuration properties",
  "additionalProperties": false,
  "properties": {
    "forwardErrorsToLogs": {
      "type": "boolean",
      "description": "Whether to forward console.error calls as Datadog log events"
    },
    "forwardConsoleLogs": {
      "description": "Console methods to forward as Datadog log events",
      "oneOf": [
        { "type": "string", "const": "all" },
        {
          "type": "array",
          "items": { "type": "string", "enum": ["log", "debug", "info", "warn", "error"] }
        }
      ]
    },
    "forwardReports": {
      "description": "Reporting API types to forward as Datadog log events",
      "oneOf": [
        { "type": "string", "const": "all" },
        {
          "type": "array",
          "items": { "type": "string", "enum": ["intervention", "deprecation", "csp_violation"] }
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Regenerate types**

```bash
yarn json-schemas:generate
```

Expected: `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts` updated with `logs?: { forwardErrorsToLogs?: boolean; forwardConsoleLogs?: ...; forwardReports?: ... }` in `RumSdkConfig`.

- [ ] **Step 3: Verify types compile**

```bash
yarn typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add remote-configuration/rum-sdk-config.json packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts
git commit -m "✨ Add logs section to remote config schema"
```

---

## Task 2: Move the cache to `browser-core`

**Files:**
- Create: `packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationCache.ts`
- Create: `packages/browser-core/src/domain/remoteConfiguration/index.ts`
- Modify: `packages/browser-core/src/index.ts`
- Modify: `packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.ts`

- [ ] **Step 1: Create the cache in `browser-core`**

The new file is a copy of `packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.ts` with one import path change (`RemoteConfiguration` will be re-imported once types move in Task 3; for now keep a forward import).

Create `packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationCache.ts`:

```typescript
import { timeStampNow } from '@datadog/js-core/time'
import { tryJsonParse } from '../..'
import type { TimeStamp } from '@datadog/js-core/time'
import type { RemoteConfiguration } from './remoteConfiguration.types'

export const CACHE_VERSION = 2
export const CACHE_KEY_PREFIX = 'dd_rc_'

interface CachedRemoteConfiguration {
  version: number
  config: RemoteConfiguration
  fetchedAt: TimeStamp
}

export type CacheReadStatus = 'hit' | 'miss' | 'stale' | 'invalid'

export type CacheReadResult =
  | {
      status: Exclude<CacheReadStatus, 'hit'>
    }
  | { status: Extract<CacheReadStatus, 'hit'>; config: RemoteConfiguration }

export const CACHE_STATUS_TO_METRIC_MAP: Record<CacheReadStatus, 'success' | 'missing' | 'failure'> = {
  hit: 'success',
  miss: 'missing',
  stale: 'failure',
  invalid: 'failure',
}

export function buildCacheKey(remoteConfigurationId: string) {
  return `${CACHE_KEY_PREFIX}${remoteConfigurationId}`
}

export function createConfigurationCache({ remoteConfigurationId }: { remoteConfigurationId: string }) {
  const CACHE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
  const key = buildCacheKey(remoteConfigurationId)

  return {
    read(): CacheReadResult {
      const raw = localStorage.getItem(key)
      if (!raw) {
        return { status: 'miss' }
      }
      const parsed = tryJsonParse(raw) as CachedRemoteConfiguration | null
      if (!parsed || typeof parsed !== 'object' || parsed.version !== CACHE_VERSION) {
        return { status: 'invalid' }
      }
      const age = timeStampNow() - parsed.fetchedAt
      if (age > CACHE_EXPIRY_MS) {
        return { status: 'stale' }
      }
      return { status: 'hit', config: parsed.config }
    },
    write(config: RemoteConfiguration) {
      const entry: CachedRemoteConfiguration = {
        version: CACHE_VERSION,
        config,
        fetchedAt: timeStampNow(),
      }
      try {
        localStorage.setItem(key, JSON.stringify(entry))
      } catch {
        // Ignore
      }
    },
  }
}
```

> **Note:** `tryJsonParse` is imported from `browser-core`'s own index. Check the exact import path by searching for `tryJsonParse` in `packages/browser-core/src/index.ts` or its barrel exports.

- [ ] **Step 2: Verify the existing cache file exports**

Read the current `packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.ts` to confirm all exports are captured in the new file, especially the exact expiry logic and `CacheReadStatus` values.

```bash
cat packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.ts
```

Adjust the new file if anything differs.

- [ ] **Step 3: Create barrel**

Create `packages/browser-core/src/domain/remoteConfiguration/index.ts`:

```typescript
export * from './remoteConfigurationCache'
```

(Will expand in later tasks.)

- [ ] **Step 4: Export from `browser-core` index**

Find the export block in `packages/browser-core/src/index.ts` and add:

```typescript
export * from './domain/remoteConfiguration'
```

- [ ] **Step 5: Update `browser-rum-core` cache file to re-export from `browser-core`**

Replace the contents of `packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.ts` with:

```typescript
// Re-exported from browser-core. Keep this file for backward compatibility with existing imports in this package.
export {
  CACHE_VERSION,
  CACHE_KEY_PREFIX,
  CACHE_STATUS_TO_METRIC_MAP,
  buildCacheKey,
  createConfigurationCache,
} from '@datadog/browser-core'
export type { CacheReadResult, CacheReadStatus } from '@datadog/browser-core'
```

- [ ] **Step 6: Verify types compile**

```bash
yarn typecheck
```

Expected: no errors.

- [ ] **Step 7: Run cache unit tests**

```bash
yarn test:unit --spec packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.spec.ts
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/browser-core/src/domain/remoteConfiguration/ packages/browser-core/src/index.ts packages/browser-rum-core/src/domain/configuration/remoteConfigurationCache.ts
git commit -m "♻️ Move remote config cache to browser-core"
```

---

## Task 3: Move the generated types to `browser-core`

**Files:**
- Modify: `scripts/lib/generatedSchemaTypes.ts`
- Create: `packages/browser-core/src/domain/remoteConfiguration/remoteConfiguration.types.ts` (generated)
- Modify: `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts`

- [ ] **Step 1: Update the codegen target**

In `scripts/lib/generatedSchemaTypes.ts`, change the `typesPath` for `rum-sdk-config.json`:

```typescript
// Before:
{
  typesPath: 'packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts',
  schemaPath: path.join(rootDir, 'remote-configuration/rum-sdk-config.json'),
},

// After:
{
  typesPath: 'packages/browser-core/src/domain/remoteConfiguration/remoteConfiguration.types.ts',
  schemaPath: path.join(rootDir, 'remote-configuration/rum-sdk-config.json'),
},
```

- [ ] **Step 2: Regenerate**

```bash
yarn json-schemas:generate
```

Expected: `packages/browser-core/src/domain/remoteConfiguration/remoteConfiguration.types.ts` created (or overwritten) with `RumSdkConfig`, `DynamicOption`, etc.

- [ ] **Step 3: Export types from barrel**

Update `packages/browser-core/src/domain/remoteConfiguration/index.ts`:

```typescript
export * from './remoteConfigurationCache'
export * from './remoteConfiguration.types'
```

- [ ] **Step 4: Replace the old types file in `browser-rum-core` with re-exports**

Replace `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts` with:

```typescript
// Re-exported from browser-core. Keep this file for backward compatibility.
export type { RumSdkConfig, DynamicOption, ContextItem } from '@datadog/browser-core'
```

> Check what the old file exported and make sure all names are re-exported here.

- [ ] **Step 5: Verify types compile**

```bash
yarn typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/generatedSchemaTypes.ts packages/browser-core/src/domain/remoteConfiguration/remoteConfiguration.types.ts packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts packages/browser-core/src/domain/remoteConfiguration/index.ts
git commit -m "♻️ Move remote config generated types to browser-core"
```

---

## Task 4: Move the generic fetch to `browser-core`

**Files:**
- Create: `packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationFetch.ts`
- Modify: `packages/browser-core/src/domain/remoteConfiguration/index.ts`
- Modify: `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.ts`

The fetch needs a generic endpoint config. Define a minimal interface:

```typescript
export interface RemoteConfigurationEndpointOptions {
  site: string
  remoteConfigurationId?: string | undefined
  remoteConfigurationProxy?: string | undefined
  remoteConfiguration?: { id?: string } | undefined
}
```

Both `RumInitConfiguration` and `LogsInitConfiguration` will satisfy this interface.

- [ ] **Step 1: Write the failing test**

Create `packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationFetch.spec.ts`:

```typescript
import { interceptRequests } from '../../test'

describe('fetchRemoteConfiguration', () => {
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
  })

  it('should return the full remote configuration on success', async () => {
    interceptor.withFetch(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ rum: { applicationId: 'xxx' } }) })
    )
    const { fetchRemoteConfiguration } = await import('./remoteConfigurationFetch')
    const result = await fetchRemoteConfiguration({ site: 'datadoghq.com', remoteConfigurationId: 'rc-id' })
    expect(result).toEqual({ ok: true, value: { rum: { applicationId: 'xxx' } } })
  })

  it('should return an error when the fetch fails', async () => {
    interceptor.withFetch(() => Promise.resolve({ ok: false }))
    const { fetchRemoteConfiguration } = await import('./remoteConfigurationFetch')
    const result = await fetchRemoteConfiguration({ site: 'datadoghq.com', remoteConfigurationId: 'rc-id' })
    expect(result.ok).toBeFalse()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
yarn test:unit --spec packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationFetch.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create the fetch module**

Create `packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationFetch.ts`:

```typescript
import { buildEndpointUrl } from '../configuration/endpointBuilder'
import type { RemoteConfiguration } from './remoteConfiguration.types'

const REMOTE_CONFIGURATION_VERSION = 'v1'

export interface RemoteConfigurationEndpointOptions {
  site: string
  remoteConfigurationId?: string | undefined
  remoteConfigurationProxy?: string | undefined
  remoteConfiguration?: { id?: string } | undefined
}

type FetchResult = { ok: true; value: RemoteConfiguration } | { ok: false; error: Error }

export function getRemoteConfigurationId(options: RemoteConfigurationEndpointOptions): string | undefined {
  return options.remoteConfiguration?.id ?? options.remoteConfigurationId
}

export function buildEndpoint(options: RemoteConfigurationEndpointOptions): string {
  if (options.remoteConfigurationProxy) {
    return options.remoteConfigurationProxy
  }
  const id = getRemoteConfigurationId(options)!
  return buildEndpointUrl({
    site: options.site,
    path: `/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(id)}.json`,
    subdomain: 'sdk-configuration',
  })
}

export async function fetchRemoteConfiguration(options: RemoteConfigurationEndpointOptions): Promise<FetchResult> {
  let response: Response | undefined
  try {
    response = await fetch(buildEndpoint(options))
  } catch {
    response = undefined
  }
  if (!response?.ok) {
    return { ok: false, error: new Error('Error fetching the remote configuration.') }
  }
  const value: RemoteConfiguration = await response.json()
  return { ok: true, value }
}
```

> **Note:** Check that `buildEndpointUrl` exists in `packages/browser-core/src/domain/configuration/endpointBuilder.ts` and has the same signature. If the import path differs, adjust it.

- [ ] **Step 4: Export from barrel**

Update `packages/browser-core/src/domain/remoteConfiguration/index.ts`:

```typescript
export * from './remoteConfigurationCache'
export * from './remoteConfiguration.types'
export * from './remoteConfigurationFetch'
```

- [ ] **Step 5: Run tests**

```bash
yarn test:unit --spec packages/browser-core/src/domain/remoteConfiguration/remoteConfigurationFetch.spec.ts
```

Expected: all pass.

- [ ] **Step 6: Update `browser-rum-core` to use the shared fetch**

In `packages/browser-rum-core/src/domain/configuration/remoteConfiguration.ts`:

1. Remove `buildEndpoint`, `getRemoteConfigurationId`, and `fetchRemoteConfiguration` implementations.
2. Import them from `@datadog/browser-core`:

```typescript
import {
  type RemoteConfiguration,
  fetchRemoteConfiguration as fetchRemoteConfigurationCore,
  getRemoteConfigurationId,
  buildEndpoint,
} from '@datadog/browser-core'
```

3. Replace the local `fetchRemoteConfiguration` with a RUM-aware wrapper that adds the `rum || profiling` guard:

```typescript
type FetchRemoteConfigurationResult = { ok: true; value: RemoteConfiguration } | { ok: false; error: Error }

export async function fetchRemoteConfiguration(
  configuration: RumInitConfiguration
): Promise<FetchRemoteConfigurationResult> {
  const result = await fetchRemoteConfigurationCore(configuration)
  if (!result.ok) {
    return result
  }
  if (result.value.rum || result.value.profiling) {
    return result
  }
  return { ok: false, error: new Error('No remote configuration for RUM.') }
}
```

4. Remove the old `REMOTE_CONFIGURATION_VERSION` constant and `FetchRemoteConfigurationResult` type (now defined locally above).

- [ ] **Step 7: Verify types compile**

```bash
yarn typecheck
```

Expected: no errors.

- [ ] **Step 8: Run RUM remote config tests**

```bash
yarn test:unit --spec packages/browser-rum-core/src/domain/configuration/remoteConfiguration.spec.ts
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/browser-core/src/domain/remoteConfiguration/ packages/browser-rum-core/src/domain/configuration/remoteConfiguration.ts
git commit -m "♻️ Move remote config fetch to browser-core"
```

---

## Task 5: Add remote config fields to `LogsInitConfiguration`

**Files:**
- Modify: `packages/browser-logs/src/domain/configuration.ts`

- [ ] **Step 1: Write the failing test**

In `packages/browser-logs/src/domain/configuration.spec.ts`, find the section that tests `validateAndBuildLogsConfiguration` and add:

```typescript
it('should accept remoteConfigurationId', () => {
  const result = validateAndBuildLogsConfiguration({
    clientToken: 'xxx',
    remoteConfigurationId: 'rc-test-id',
  })
  expect(result).toBeDefined()
  expect(result!.remoteConfigurationId).toBe('rc-test-id')
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
yarn test:unit --spec packages/browser-logs/src/domain/configuration.spec.ts
```

Expected: FAIL (property does not exist on type).

- [ ] **Step 3: Add fields to `LogsInitConfiguration`**

In `packages/browser-logs/src/domain/configuration.ts`, add to `LogsInitConfiguration`:

```typescript
/**
 * The ID of the remote configuration to apply. Use this for the non-blocking cache-and-reload path.
 *
 * @category Remote Configuration
 */
remoteConfigurationId?: string | undefined

/**
 * Remote configuration options.
 *
 * @category Remote Configuration
 */
remoteConfiguration?: { id: string; sync?: boolean; required?: boolean } | undefined

/**
 * Proxy URL for fetching the remote configuration.
 *
 * @category Remote Configuration
 */
remoteConfigurationProxy?: string | undefined
```

Also add `remoteConfigurationId: string | undefined` to `LogsConfiguration` (the built config), and populate it in `validateAndBuildLogsConfiguration`:

```typescript
import { getRemoteConfigurationId } from '@datadog/browser-core'

// Inside validateAndBuildLogsConfiguration return value:
remoteConfigurationId: getRemoteConfigurationId(initConfiguration),
```

- [ ] **Step 4: Run tests**

```bash
yarn test:unit --spec packages/browser-logs/src/domain/configuration.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Verify types**

```bash
yarn typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/browser-logs/src/domain/configuration.ts packages/browser-logs/src/domain/configuration.spec.ts
git commit -m "✨ Add remoteConfigurationId to LogsInitConfiguration"
```

---

## Task 6: Add logs-specific apply logic

**Files:**
- Create: `packages/browser-logs/src/domain/remoteConfiguration.ts`
- Create: `packages/browser-logs/src/domain/remoteConfiguration.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/browser-logs/src/domain/remoteConfiguration.spec.ts`:

```typescript
import type { LogsInitConfiguration } from './configuration'
import { applyLogsRemoteConfiguration } from './remoteConfiguration'

const DEFAULT_LOGS_INIT: LogsInitConfiguration = {
  clientToken: 'xxx',
}

describe('applyLogsRemoteConfiguration', () => {
  it('should apply forwardErrorsToLogs when present', () => {
    const result = applyLogsRemoteConfiguration(DEFAULT_LOGS_INIT, {
      logs: { forwardErrorsToLogs: false },
    })
    expect(result.forwardErrorsToLogs).toBeFalse()
  })

  it('should apply forwardConsoleLogs when present', () => {
    const result = applyLogsRemoteConfiguration(DEFAULT_LOGS_INIT, {
      logs: { forwardConsoleLogs: ['warn', 'error'] },
    })
    expect(result.forwardConsoleLogs).toEqual(['warn', 'error'])
  })

  it('should apply forwardReports when present', () => {
    const result = applyLogsRemoteConfiguration(DEFAULT_LOGS_INIT, {
      logs: { forwardReports: 'all' },
    })
    expect(result.forwardReports).toBe('all')
  })

  it('should not overwrite fields absent from the remote config', () => {
    const initWithReports: LogsInitConfiguration = {
      clientToken: 'xxx',
      forwardReports: ['deprecation'],
    }
    const result = applyLogsRemoteConfiguration(initWithReports, { logs: {} })
    expect(result.forwardReports).toEqual(['deprecation'])
  })

  it('should skip logs fields when the logs section is absent', () => {
    const initWithErrors: LogsInitConfiguration = {
      clientToken: 'xxx',
      forwardErrorsToLogs: true,
    }
    const result = applyLogsRemoteConfiguration(initWithErrors, { profiling: { sampleRate: 10 } })
    expect(result.forwardErrorsToLogs).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
yarn test:unit --spec packages/browser-logs/src/domain/remoteConfiguration.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `packages/browser-logs/src/domain/remoteConfiguration.ts`:

```typescript
import type { RemoteConfiguration } from '@datadog/browser-core'
import type { LogsInitConfiguration } from './configuration'

const SUPPORTED_LOGS_FIELDS: Array<keyof LogsInitConfiguration> = [
  'forwardErrorsToLogs',
  'forwardConsoleLogs',
  'forwardReports',
]

export function applyLogsRemoteConfiguration(
  initConfiguration: LogsInitConfiguration,
  remoteConfiguration: RemoteConfiguration
): LogsInitConfiguration {
  if (!remoteConfiguration.logs) {
    return initConfiguration
  }
  const logsRemoteConfiguration = remoteConfiguration.logs as Record<string, unknown>
  const appliedConfiguration = { ...initConfiguration } as LogsInitConfiguration & Record<string, unknown>
  SUPPORTED_LOGS_FIELDS.forEach((field: string) => {
    if (field in logsRemoteConfiguration) {
      appliedConfiguration[field] = logsRemoteConfiguration[field]
    }
  })
  return appliedConfiguration
}
```

- [ ] **Step 4: Run tests**

```bash
yarn test:unit --spec packages/browser-logs/src/domain/remoteConfiguration.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/browser-logs/src/domain/remoteConfiguration.ts packages/browser-logs/src/domain/remoteConfiguration.spec.ts
git commit -m "✨ Add logs remote config apply logic"
```

---

## Task 7: Wire remote config into `preStartLogs`

**Files:**
- Modify: `packages/browser-logs/src/boot/preStartLogs.ts`
- Modify: `packages/browser-logs/src/boot/preStartLogs.spec.ts`

The pattern mirrors `preStartRum.ts`: check for a `remoteConfigurationId`, use the cache-first path (`getRemoteConfigurationId` → cache read → background sync), and defer SDK start if `required` is set and cache misses.

- [ ] **Step 1: Write the failing test**

In `packages/browser-logs/src/boot/preStartLogs.spec.ts`, add a describe block for remote config:

```typescript
import { CACHE_KEY_PREFIX, CACHE_VERSION } from '@datadog/browser-core'
import { buildCacheKey } from '@datadog/browser-core'

// At the top of the file or in a helper:
const RC_ID = 'rc-logs-test'
const CACHE_KEY = buildCacheKey(RC_ID)

describe('preStartLogs remote configuration', () => {
  it('should start with cached logs configuration on cache hit', async () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version: CACHE_VERSION, config: { logs: { forwardErrorsToLogs: false } }, fetchedAt: Date.now() })
    )

    const { strategy } = createPreStartStrategy(/* ... existing helper ... */)
    strategy.init({ clientToken: 'xxx', remoteConfigurationId: RC_ID })

    // Should have started with the cached forwardErrorsToLogs value applied
    // Assert doStartLogs was called with forwardErrorsToLogs: false
    expect(doStartLogsSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ forwardErrorsToLogs: false }),
      jasmine.anything(),
      jasmine.anything()
    )
  })
})
```

> **Note:** Adapt to use the same test helpers already present in `preStartLogs.spec.ts` (look for `createPreStartStrategy` or similar). Check the existing spec for how `doStartLogs` is spied on.

- [ ] **Step 2: Run to verify it fails**

```bash
yarn test:unit --spec packages/browser-logs/src/boot/preStartLogs.spec.ts
```

Expected: new test FAIL.

- [ ] **Step 3: Implement remote config in `preStartLogs`**

In `packages/browser-logs/src/boot/preStartLogs.ts`, mirror the `preStartRum` pattern:

```typescript
import {
  createConfigurationCache,
  fetchRemoteConfiguration,
  getRemoteConfigurationId,
  CACHE_STATUS_TO_METRIC_MAP,
} from '@datadog/browser-core'
import { applyLogsRemoteConfiguration } from '../domain/remoteConfiguration'

// Inside createPreStartStrategy, in the init path, after validation:
const remoteConfigId = getRemoteConfigurationId(initConfiguration)

if (remoteConfigId) {
  const cache = createConfigurationCache({ remoteConfigurationId: remoteConfigId })
  const cacheResult = cache.read()

  // Background sync
  fetchRemoteConfiguration(initConfiguration)
    .then((fetchResult) => {
      if (fetchResult.ok) {
        cache.write(fetchResult.value)
      }
    })
    .catch(monitorError)

  if (cacheResult.status === 'hit') {
    const resolvedConfig = applyLogsRemoteConfiguration(initConfiguration, cacheResult.config)
    doStartLogs(validateAndBuildLogsConfiguration(resolvedConfig)!, sessionManager, hooks)
    return
  }

  if (initConfiguration.remoteConfiguration?.required) {
    // Wait for the async fetch before starting
    fetchRemoteConfiguration(initConfiguration)
      .then((fetchResult) => {
        const configToApply = fetchResult.ok
          ? applyLogsRemoteConfiguration(initConfiguration, fetchResult.value)
          : initConfiguration
        doStartLogs(validateAndBuildLogsConfiguration(configToApply)!, sessionManager, hooks)
      })
      .catch(monitorError)
    return
  }
}

// Default: start immediately without remote config
doStartLogs(logsConfiguration, sessionManager, hooks)
```

> **Note:** Look at the existing `preStartRum.ts` implementation of `fetchAndApplyRemoteConfiguration` and `getRemoteConfiguration` for the exact pattern. The logs version is simpler (no context managers, no metrics telemetry initially).

- [ ] **Step 4: Run tests**

```bash
yarn test:unit --spec packages/browser-logs/src/boot/preStartLogs.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Run full unit test suite**

```bash
yarn test:unit
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/browser-logs/src/boot/preStartLogs.ts packages/browser-logs/src/boot/preStartLogs.spec.ts
git commit -m "✨ Wire remote configuration into browser-logs init"
```

---

## Task 8: E2E test for logs remote config

**Files:**
- Modify: `test/e2e/scenario/rum/remoteConfiguration.scenario.ts` (or create `test/e2e/scenario/logs/remoteConfiguration.scenario.ts`)

- [ ] **Step 1: Write an E2E test for `forwardErrorsToLogs`**

Find the existing remote configuration E2E scenario and add a case for logs. Use `seedCache` to seed a `logs` config:

```typescript
createTest('should apply forwardErrorsToLogs from remote config')
  .withSetup(({ seed }) => {
    seed(
      seedCache({
        logs: { forwardErrorsToLogs: false },
      })
    )
  })
  .withLogs()
  .run(async ({ serverEvents, page }) => {
    await page.evaluate(() => {
      console.error('this should NOT be forwarded')
    })
    // No log event should be collected
    expect(serverEvents.logs).toHaveSize(0)
  })
```

> **Note:** Check `test/e2e/scenario/rum/remoteConfiguration.scenario.ts` for the `seedCache` helper signature and `createTest` API. Logs E2E tests may need a different `withLogs()` builder — check `test/e2e/lib/framework/` for available builders.

- [ ] **Step 2: Run E2E tests**

```bash
yarn test:e2e -g "logs remote config"
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/scenario/
git commit -m "🧪 Add E2E test for logs remote configuration"
```

---

## Self-Review Checklist

- [x] **Schema:** `logs` section added to `rum-sdk-config.json` (Task 1)
- [x] **Types:** Generated types regenerated and moved to `browser-core` (Tasks 1, 3)
- [x] **Cache:** Moved to `browser-core`, re-exported from `browser-rum-core` (Task 2)
- [x] **Fetch:** Generic `fetchRemoteConfiguration` in `browser-core`, RUM wrapper guards `rum || profiling` (Task 4)
- [x] **Logs init config:** `remoteConfigurationId`, `remoteConfiguration`, `remoteConfigurationProxy` added (Task 5)
- [x] **Logs apply:** `applyLogsRemoteConfiguration` with `SUPPORTED_LOGS_FIELDS` allowlist (Task 6)
- [x] **Logs boot:** Cache-first async loading wired into `preStartLogs` (Task 7)
- [x] **E2E:** End-to-end test for at least one logs field (Task 8)
- [x] **No double fetch:** Both RUM and Logs use the same `createConfigurationCache` key (`dd_rc_<id>`), so the second SDK reads from cache written by the first
- [x] **Backward compat:** `browser-rum-core` re-exports the moved symbols — no public API breakage
