# Custom Vitals and Resource Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add custom vitals API, response header collection, GraphQL metadata extraction, and manual resource tracking to the Browser RUM SDK.

**Architecture:** Four independent features wired into the existing Pipeline pub/sub system. Each feature follows the same pattern: add types to `SdkEventMap`, write a processor function that subscribes to action events and publishes observation events, wire into the RUM module init, and expose on the public API bridge.

**Tech Stack:** TypeScript, Jasmine/Karma unit tests, `@datadog/core-next` Pipeline, `packages/browser-rum-next`, `packages/browser-sdk`

---

## Task 1: Add vital and resource pipeline event types

**Files:**
- Modify: `packages/core-next/src/domain/pipeline/events.ts`

**Step 1: Add the new event types to `SdkEventMap`**

Open `packages/core-next/src/domain/pipeline/events.ts`. The current `SdkEventMap` ends at line 72. Add these entries inside the interface (before the `[key: string]: unknown` index signature):

```typescript
  'action:start_vital': { name: string; description?: string; context?: object; vitalKey?: string }
  'action:stop_vital': { name?: string; vitalKey?: string; context?: object }
  'action:add_vital': { name: string; duration: number; startTime?: number; context?: object; description?: string }
  'observation:vital': unknown
  'action:start_resource': { url: string; type?: string; method?: string; resourceKey?: string }
  'action:stop_resource': { url?: string; statusCode?: number; size?: number; context?: object; resourceKey?: string }
```

Also add `responseHeaders` to `NetworkRequestResource`:

```typescript
interface NetworkRequestResource {
  // existing fields unchanged
  responseHeaders?: Array<{ name: string; value: string }>
}
```

**Step 2: Run typecheck to verify no breakage**

```bash
yarn typecheck
```

Expected: no errors related to the new fields.

**Step 3: Commit**

```bash
git add packages/core-next/src/domain/pipeline/events.ts
git commit -m "🏷️ Add vital pipeline event types"
```

---

## Task 2: Custom vitals processor (TDD)

**Files:**
- Create: `packages/browser-rum-next/src/domain/vitals.ts`
- Create: `packages/browser-rum-next/src/domain/vitals.spec.ts`

**Step 1: Write the spec file first**

Create `packages/browser-rum-next/src/domain/vitals.spec.ts`:

```typescript
import { Pipeline } from '@datadog/core-next'
import { startVitalProcessor } from './vitals'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startVitalProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
  })

  it('start + stop publishes observation:vital with a duration', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_vital', { name: 'checkout' })
    pipeline.publish('action:stop_vital', { name: 'checkout' })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('vital')
    const vital = obs.vital as Record<string, unknown>
    expect(vital.name).toBe('checkout')
    expect(vital.type).toBe('duration')
    expect(typeof vital.duration).toBe('number')
    expect((vital.duration as number)).toBeGreaterThanOrEqual(0)
  })

  it('stop without matching start is ignored', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:stop_vital', { name: 'nonexistent' })
    await tick()

    expect(observations.length).toBe(0)
  })

  it('addVital publishes immediately with the given duration', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:add_vital', { name: 'render', duration: 150 })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    const vital = obs.vital as Record<string, unknown>
    expect(vital.name).toBe('render')
    expect(vital.duration).toBe(150)
  })

  it('vital includes name, type, and description', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:add_vital', { name: 'lcp', duration: 200, description: 'Largest Contentful Paint' })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    const vital = obs.vital as Record<string, unknown>
    expect(vital.name).toBe('lcp')
    expect(vital.type).toBe('duration')
    expect(vital.description).toBe('Largest Contentful Paint')
  })

  it('context is included when provided in stop_vital', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_vital', { name: 'api-call' })
    pipeline.publish('action:stop_vital', { name: 'api-call', context: { endpoint: '/users' } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ endpoint: '/users' })
  })

  it('context is included when provided in add_vital', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:add_vital', { name: 'render', duration: 50, context: { page: 'home' } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ page: 'home' })
  })

  it('vitalKey is used as the lookup key instead of name', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_vital', { name: 'checkout', vitalKey: 'ck-1' })
    pipeline.publish('action:stop_vital', { vitalKey: 'ck-1' })
    await tick()

    expect(observations.length).toBe(1)
    const vital = (observations[0] as Record<string, unknown>).vital as Record<string, unknown>
    expect(vital.name).toBe('checkout')
  })

  it('vital includes a unique id', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))

    startVitalProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:add_vital', { name: 'test', duration: 10 })
    await tick()

    const vital = (observations[0] as Record<string, unknown>).vital as Record<string, unknown>
    expect(typeof vital.id).toBe('string')
    expect((vital.id as string).length).toBeGreaterThan(0)
  })
})
```

**Step 2: Run the spec to verify it fails**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/vitals.spec.ts
```

Expected: compilation error — `vitals.ts` does not exist yet.

**Step 3: Write the implementation**

Create `packages/browser-rum-next/src/domain/vitals.ts`:

```typescript
import type { Pipeline } from '@datadog/core-next'

function startVitalProcessor(pipeline: Pipeline<Record<string, unknown>>): void {
  const activeVitals = new Map<string, { name: string; startTime: number; startDate: number; description?: string }>()

  pipeline.subscribe('action:start_vital', (data) => {
    const vital = data as { name: string; description?: string; vitalKey?: string }
    const key = vital.vitalKey || vital.name
    activeVitals.set(key, {
      name: vital.name,
      startTime: performance.now(),
      startDate: Date.now(),
      description: vital.description,
    })
  })

  pipeline.subscribe('action:stop_vital', (data) => {
    const stop = data as { name?: string; vitalKey?: string; context?: object }
    const key = stop.vitalKey || stop.name || ''
    const active = activeVitals.get(key)
    if (!active) return
    activeVitals.delete(key)

    pipeline.publish('observation:vital', {
      type: 'vital',
      date: active.startDate,
      vital: {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `vital-${Date.now()}`,
        name: active.name,
        type: 'duration',
        duration: performance.now() - active.startTime,
        description: active.description,
      },
      ...(stop.context && { context: stop.context }),
    })
  })

  pipeline.subscribe('action:add_vital', (data) => {
    const vital = data as { name: string; duration: number; startTime?: number; context?: object; description?: string }
    pipeline.publish('observation:vital', {
      type: 'vital',
      date: Date.now(),
      vital: {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `vital-${Date.now()}`,
        name: vital.name,
        type: 'duration',
        duration: vital.duration,
        description: vital.description,
      },
      ...(vital.context && { context: vital.context }),
    })
  })
}

export { startVitalProcessor }
```

**Step 4: Run the spec to verify it passes**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/vitals.spec.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add packages/browser-rum-next/src/domain/vitals.ts packages/browser-rum-next/src/domain/vitals.spec.ts
git commit -m "✨ Add custom vitals processor"
```

---

## Task 3: Wire vitals into RUM module and public API

**Files:**
- Modify: `packages/browser-rum-next/src/processor/index.ts`
- Modify: `packages/browser-rum-next/src/index.ts`

**Step 1: Wire processor into RUM module init**

In `packages/browser-rum-next/src/processor/index.ts`:

1. Add import at the top (after existing imports):
   ```typescript
   import { startVitalProcessor } from '../domain/vitals'
   ```

2. Inside `init()`, after `startActionProcessor(context.pipeline)` (line 43), add:
   ```typescript
   // Start vital processor (action:start_vital, action:stop_vital, action:add_vital → observation:vital)
   startVitalProcessor(context.pipeline)
   ```

3. Add route after existing routes (after line 63):
   ```typescript
   context.transport.route('observation:vital', 'rum')
   ```

**Step 2: Update public API bridge**

In `packages/browser-rum-next/src/index.ts`, add to the `datadogRum` object:

```typescript
  startDurationVital(name: string, options?: { description?: string; context?: object; vitalKey?: string }) {
    publish('action:start_vital', { name, ...options })
  },
  stopDurationVital(name?: string, options?: { vitalKey?: string; context?: object }) {
    publish('action:stop_vital', { name, ...options })
  },
  addDurationVital(vital: { name: string; duration: number; startTime?: number; context?: object; description?: string }) {
    publish('action:add_vital', vital)
  },
```

**Step 3: Run specs to verify**

```bash
yarn test:unit --spec packages/browser-rum-next/src/processor/index.spec.ts --spec packages/browser-rum-next/src/index.spec.ts
```

Expected: all existing tests still pass. (New vitals tests should pass too — run them all together.)

**Step 4: Add tests for vital wiring in processor/index.spec.ts**

In `packages/browser-rum-next/src/processor/index.spec.ts`, add these tests inside the `describe('rumProcessor')` block:

```typescript
it('registers route for observation:vital during init', () => {
  const context = createTestContext()
  init(context)

  expect(context.transport.route).toHaveBeenCalledWith('observation:vital', 'rum')
})

it('action:start_vital + action:stop_vital publishes observation:vital', async () => {
  const context = createTestContext()
  const { pipeline } = context
  const observations: unknown[] = []

  pipeline.subscribe('observation:vital', (data) => observations.push(data))

  init(context)
  pipeline.seal()

  pipeline.publish('action:start_vital', { name: 'test-vital' })
  pipeline.publish('action:stop_vital', { name: 'test-vital' })
  await tick()

  expect(observations.length).toBe(1)
  const obs = observations[0] as Record<string, unknown>
  expect(obs.type).toBe('vital')
})
```

In `packages/browser-rum-next/src/index.spec.ts`, add tests for new API methods:

```typescript
it('datadogRum exposes startDurationVital, stopDurationVital, addDurationVital', () => {
  expect(typeof (datadogRum as any).startDurationVital).toBe('function')
  expect(typeof (datadogRum as any).stopDurationVital).toBe('function')
  expect(typeof (datadogRum as any).addDurationVital).toBe('function')
})

it('startDurationVital publishes action:start_vital to the pipeline', async () => {
  const pipeline = new Pipeline<Record<string, unknown>>()
  const received: unknown[] = []

  pipeline.subscribe('action:start_vital', (event) => {
    received.push(event)
  })

  connectBridges(pipeline)
  pipeline.seal()

  ;(datadogRum as any).startDurationVital('checkout', { description: 'checkout flow' })
  await waitMicrotask()

  const event = received.find((e: any) => e.name === 'checkout') as any
  expect(event).toBeDefined()
  expect(event.description).toBe('checkout flow')
})

it('addDurationVital publishes action:add_vital to the pipeline', async () => {
  const pipeline = new Pipeline<Record<string, unknown>>()
  const received: unknown[] = []

  pipeline.subscribe('action:add_vital', (event) => {
    received.push(event)
  })

  connectBridges(pipeline)
  pipeline.seal()

  ;(datadogRum as any).addDurationVital({ name: 'render', duration: 150 })
  await waitMicrotask()

  const event = received.find((e: any) => e.name === 'render') as any
  expect(event).toBeDefined()
  expect(event.duration).toBe(150)
})
```

**Step 5: Run all vitals-related specs**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/vitals.spec.ts --spec packages/browser-rum-next/src/processor/index.spec.ts --spec packages/browser-rum-next/src/index.spec.ts
```

Expected: all pass.

**Step 6: Commit**

```bash
git add packages/browser-rum-next/src/processor/index.ts packages/browser-rum-next/src/index.ts packages/browser-rum-next/src/processor/index.spec.ts packages/browser-rum-next/src/index.spec.ts
git commit -m "🔌 Wire vitals into RUM module and public API"
```

---

## Task 4: Response header collection in fetch and XHR collectors

**Files:**
- Modify: `packages/browser-sdk/src/collectors/fetchCollector.ts`
- Modify: `packages/browser-sdk/src/collectors/xhrCollector.ts`
- Modify: `packages/browser-sdk/src/collectors/fetchCollector.spec.ts`
- Modify: `packages/browser-sdk/src/collectors/xhrCollector.spec.ts`

**Context:** `NetworkRequestResource` already has `responseHeaders?: Array<{ name: string; value: string }>` added in Task 1. Now we implement the collection.

### Shared security utility

The sensitive header blocklist will be needed in both collectors. Add a small utility inline in `fetchCollector.ts` and import it in `xhrCollector.ts`.

**Step 1: Add tests to fetchCollector.spec.ts**

Add a new `describe` block inside the existing `describe('startFetchCollection')`:

```typescript
describe('response header collection', () => {
  const headerConfig = { allowedResponseHeaders: ['content-type', 'x-request-id', 'x-custom'] }

  it('includes allowed response headers when configured', (done) => {
    window.fetch = () => {
      const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': 'abc' })
      return Promise.resolve(new Response(null, { status: 200, headers }))
    }
    stop = startFetchCollection(pipeline, undefined, headerConfig)

    window.fetch('/api').then(() => {
      setTimeout(() => {
        const headers = collected[0].responseHeaders
        expect(headers).toBeDefined()
        expect(headers!.find((h) => h.name === 'content-type')?.value).toBe('application/json')
        expect(headers!.find((h) => h.name === 'x-request-id')?.value).toBe('abc')
        done()
      }, 0)
    })
  })

  it('does not include response headers when not configured', (done) => {
    window.fetch = () => Promise.resolve(new Response(null, { status: 200 }))
    stop = startFetchCollection(pipeline)

    window.fetch('/api').then(() => {
      setTimeout(() => {
        expect(collected[0].responseHeaders).toBeUndefined()
        done()
      }, 0)
    })
  })

  it('blocks sensitive headers (authorization)', (done) => {
    window.fetch = () => {
      const headers = new Headers({ authorization: 'Bearer secret', 'content-type': 'text/plain' })
      return Promise.resolve(new Response(null, { status: 200, headers }))
    }
    stop = startFetchCollection(pipeline, undefined, { allowedResponseHeaders: ['authorization', 'content-type'] })

    window.fetch('/api').then(() => {
      setTimeout(() => {
        const headers = collected[0].responseHeaders
        expect(headers!.find((h) => h.name === 'authorization')).toBeUndefined()
        expect(headers!.find((h) => h.name === 'content-type')).toBeDefined()
        done()
      }, 0)
    })
  })

  it('truncates header values longer than 128 characters', (done) => {
    const longValue = 'a'.repeat(200)
    window.fetch = () => {
      const headers = new Headers({ 'x-custom': longValue })
      return Promise.resolve(new Response(null, { status: 200, headers }))
    }
    stop = startFetchCollection(pipeline, undefined, { allowedResponseHeaders: ['x-custom'] })

    window.fetch('/api').then(() => {
      setTimeout(() => {
        const header = collected[0].responseHeaders!.find((h) => h.name === 'x-custom')
        expect(header).toBeDefined()
        expect(header!.value.length).toBe(128)
        done()
      }, 0)
    })
  })
})
```

**Step 2: Run fetch spec to verify new tests fail**

```bash
yarn test:unit --spec packages/browser-sdk/src/collectors/fetchCollector.spec.ts
```

Expected: new tests fail (function signature mismatch).

**Step 3: Update fetchCollector.ts**

Add a `HeaderCollectionConfig` interface and `collectResponseHeaders` utility, then update `startFetchCollection`:

```typescript
// Add after existing CollectorTracingConfig interface:

interface HeaderCollectionConfig {
  allowedResponseHeaders?: string[]
}

const SENSITIVE_HEADER_PATTERN = /(token|cookie|secret|authorization|api.key)/i

function collectResponseHeaders(
  headers: Headers,
  allowList: string[]
): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = []
  for (const name of allowList) {
    if (SENSITIVE_HEADER_PATTERN.test(name)) continue
    const value = headers.get(name)
    if (value !== null) {
      result.push({ name, value: value.length > 128 ? value.slice(0, 128) : value })
    }
  }
  return result
}
```

Update the function signature:
```typescript
function startFetchCollection(
  pipeline: Pipeline<Record<string, unknown>>,
  tracingConfig?: CollectorTracingConfig,
  headerConfig?: HeaderCollectionConfig
): () => void {
```

Update the success handler inside `originalFetch.call(this, input, init).then(...)` to collect headers:
```typescript
(response: Response) => {
  const responseHeaders =
    headerConfig?.allowedResponseHeaders
      ? collectResponseHeaders(response.headers, headerConfig.allowedResponseHeaders)
      : undefined

  const resource: NetworkRequestResource = {
    method,
    url,
    status: response.status,
    isAborted: false,
    startTime,
    startDate,
    duration: performance.now() - startTime,
    traceId,
    spanId,
    ...(responseHeaders && responseHeaders.length > 0 && { responseHeaders }),
  }
  pipeline.publish('resource:network_request', resource)
  return response
},
```

Export `HeaderCollectionConfig` and `collectResponseHeaders`:
```typescript
export { startFetchCollection, collectResponseHeaders }
export type { CollectorTracingConfig, HeaderCollectionConfig }
```

**Step 4: Run fetch spec to verify all tests pass**

```bash
yarn test:unit --spec packages/browser-sdk/src/collectors/fetchCollector.spec.ts
```

Expected: all pass.

**Step 5: Add tests to xhrCollector.spec.ts**

Add a new `describe` block at the end of the existing `describe('startXhrCollection')`:

```typescript
describe('response header collection', () => {
  it('includes allowed response headers when configured', (done) => {
    stop()
    stop = startXhrCollection(pipeline, undefined, { allowedResponseHeaders: ['content-type'] })

    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        // content-type should be present from the server response
        const headers = collected[0].responseHeaders
        // Note: karma serves /base/karma.js with a content-type header
        // We only check it's defined and is an array
        expect(Array.isArray(headers)).toBe(true)
        done()
      }, 0)
    })
  })

  it('blocks sensitive headers (authorization)', (done) => {
    stop()
    stop = startXhrCollection(pipeline, undefined, { allowedResponseHeaders: ['authorization', 'content-type'] })

    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        const headers = collected[0].responseHeaders || []
        expect(headers.find((h) => h.name === 'authorization')).toBeUndefined()
        done()
      }, 0)
    })
  })

  it('does not include response headers when not configured', (done) => {
    // stop() is NOT called here - using default setup (no headerConfig)
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        expect(collected[0].responseHeaders).toBeUndefined()
        done()
      }, 0)
    })
  })
})
```

**Step 6: Update xhrCollector.ts**

Import `collectResponseHeaders` and `HeaderCollectionConfig` from fetchCollector, then update `startXhrCollection`:

```typescript
import type { CollectorTracingConfig, HeaderCollectionConfig } from './fetchCollector'
import { collectResponseHeaders } from './fetchCollector'
```

Update function signature:
```typescript
function startXhrCollection(
  pipeline: Pipeline<Record<string, unknown>>,
  tracingConfig?: CollectorTracingConfig,
  headerConfig?: HeaderCollectionConfig
): () => void {
```

In the `onComplete` handler, collect response headers using `xhr.getAllResponseHeaders()`:

```typescript
const onComplete = () => {
  if (!isIntakeUrl(url)) {
    const startTime: number = (xhr as any)._dd_startTime ?? performance.now()
    const startDate: number = (xhr as any)._dd_startDate ?? Date.now()
    const duration = performance.now() - startTime

    let responseHeaders: Array<{ name: string; value: string }> | undefined
    if (headerConfig?.allowedResponseHeaders) {
      // Parse getAllResponseHeaders() which returns "name: value\r\n" lines
      const rawHeaders = xhr.getAllResponseHeaders()
      const responseHeadersMap = new Headers()
      for (const line of rawHeaders.split('\r\n')) {
        const colonIdx = line.indexOf(':')
        if (colonIdx !== -1) {
          responseHeadersMap.append(line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim())
        }
      }
      const collected = collectResponseHeaders(responseHeadersMap, headerConfig.allowedResponseHeaders)
      if (collected.length > 0) responseHeaders = collected
    }

    const resource: NetworkRequestResource = {
      method,
      url,
      status: xhr.status,
      isAborted: xhr.status === 0 && xhr.readyState !== 4,
      startTime,
      startDate,
      duration,
      traceId: (xhr as any)._dd_traceId,
      spanId: (xhr as any)._dd_spanId,
      ...(responseHeaders && { responseHeaders }),
    }
    pipeline.publish('resource:network_request', resource)
  }
  xhr.removeEventListener('loadend', onComplete)
}
```

**Step 7: Run both collector specs**

```bash
yarn test:unit --spec packages/browser-sdk/src/collectors/fetchCollector.spec.ts --spec packages/browser-sdk/src/collectors/xhrCollector.spec.ts
```

Expected: all pass.

**Step 8: Commit**

```bash
git add packages/browser-sdk/src/collectors/fetchCollector.ts packages/browser-sdk/src/collectors/xhrCollector.ts packages/browser-sdk/src/collectors/fetchCollector.spec.ts packages/browser-sdk/src/collectors/xhrCollector.spec.ts packages/core-next/src/domain/pipeline/events.ts
git commit -m "✨ Add response header collection to network collectors"
```

---

## Task 5: GraphQL metadata extraction (TDD)

**Files:**
- Create: `packages/browser-rum-next/src/domain/graphql.ts`
- Create: `packages/browser-rum-next/src/domain/graphql.spec.ts`

**Step 1: Write the spec first**

Create `packages/browser-rum-next/src/domain/graphql.spec.ts`:

```typescript
import { extractGraphQLMetadata } from './graphql'

describe('extractGraphQLMetadata', () => {
  it('returns undefined for non-GraphQL URLs', () => {
    expect(extractGraphQLMetadata('https://api.example.com/users')).toBeUndefined()
  })

  it('returns undefined for a GraphQL URL with no query param and no body', () => {
    expect(extractGraphQLMetadata('https://api.example.com/graphql')).toBeUndefined()
  })

  it('extracts operation type from URL query param', () => {
    const url = 'https://api.example.com/graphql?query=query+GetUser+%7B+user+%7D'
    const result = extractGraphQLMetadata(url)
    expect(result).toBeDefined()
    expect(result!.operationType).toBe('query')
  })

  it('extracts operation name from URL query param', () => {
    const url = `https://api.example.com/graphql?query=${encodeURIComponent('query GetUser { user { id } }')}`
    const result = extractGraphQLMetadata(url)
    expect(result!.operationName).toBe('GetUser')
  })

  it('extracts mutation type from URL query param', () => {
    const url = `https://api.example.com/graphql?query=${encodeURIComponent('mutation CreateUser { createUser { id } }')}`
    const result = extractGraphQLMetadata(url)
    expect(result!.operationType).toBe('mutation')
    expect(result!.operationName).toBe('CreateUser')
  })

  it('extracts subscription type from URL query param', () => {
    const url = `https://api.example.com/graphql?query=${encodeURIComponent('subscription OnMessage { message { text } }')}`
    const result = extractGraphQLMetadata(url)
    expect(result!.operationType).toBe('subscription')
  })

  it('handles query without operation name', () => {
    const url = `https://api.example.com/graphql?query=${encodeURIComponent('query { users { id } }')}`
    const result = extractGraphQLMetadata(url)
    expect(result!.operationType).toBe('query')
    expect(result!.operationName).toBeUndefined()
  })

  it('extracts from JSON body for POST requests', () => {
    const body = JSON.stringify({ query: 'query GetUser { user { id } }', operationName: 'GetUser' })
    const result = extractGraphQLMetadata('https://api.example.com/graphql', body)
    expect(result!.operationType).toBe('query')
    expect(result!.operationName).toBe('GetUser')
  })

  it('returns undefined when body is not valid JSON', () => {
    const result = extractGraphQLMetadata('https://api.example.com/graphql', 'not-json')
    expect(result).toBeUndefined()
  })

  it('URL query param takes precedence over body', () => {
    const url = `https://api.example.com/graphql?query=${encodeURIComponent('query FromUrl { a }')}`
    const body = JSON.stringify({ query: 'mutation FromBody { b }' })
    const result = extractGraphQLMetadata(url, body)
    expect(result!.operationType).toBe('query')
  })
})
```

**Step 2: Run spec to verify it fails**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/graphql.spec.ts
```

Expected: compilation error.

**Step 3: Write the implementation**

Create `packages/browser-rum-next/src/domain/graphql.ts`:

```typescript
interface GraphQLMetadata {
  operationType?: 'query' | 'mutation' | 'subscription'
  operationName?: string
}

function extractGraphQLMetadata(url: string, body?: string): GraphQLMetadata | undefined {
  // Try URL query params first (GET requests)
  try {
    const urlParams = new URL(url, 'http://localhost').searchParams
    const queryParam = urlParams.get('query')
    if (queryParam) return parseGraphQLOperation(queryParam)
  } catch {
    // invalid URL
  }

  // Try request body (POST requests)
  if (!body) return undefined
  try {
    const parsed = JSON.parse(body)
    if (parsed.query) return parseGraphQLOperation(parsed.query, parsed.operationName)
  } catch {
    // not JSON
  }

  return undefined
}

function parseGraphQLOperation(query: string, operationName?: string): GraphQLMetadata {
  const match = query.match(/^\s*(query|mutation|subscription)\s+(\w+)?/)
  return {
    operationType: match?.[1] as GraphQLMetadata['operationType'],
    operationName: operationName || match?.[2],
  }
}

export { extractGraphQLMetadata }
export type { GraphQLMetadata }
```

**Step 4: Run spec to verify it passes**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/graphql.spec.ts
```

Expected: all tests pass.

**Step 5: Wire GraphQL extraction into the resource processor**

In `packages/browser-rum-next/src/domain/processor.ts`, add the import at top:

```typescript
import { extractGraphQLMetadata } from './graphql'
```

After building the `resource` object inside the `resource:performance_entry` handler (after the `resource` variable is defined, before `pipeline.publish`), add:

```typescript
// GraphQL metadata extraction (GET requests via URL params only for now)
const urlStr = entry.name as string
if (urlStr.includes('graphql')) {
  const graphqlMeta = extractGraphQLMetadata(urlStr)
  if (graphqlMeta) {
    ;(resource.resource as Record<string, unknown>).graphql = graphqlMeta
  }
}
```

**Step 6: Commit**

```bash
git add packages/browser-rum-next/src/domain/graphql.ts packages/browser-rum-next/src/domain/graphql.spec.ts packages/browser-rum-next/src/domain/processor.ts
git commit -m "✨ Add GraphQL metadata extraction"
```

---

## Task 6: Manual resource tracking (TDD)

**Files:**
- Create: `packages/browser-rum-next/src/domain/manualResource.ts`
- Create: `packages/browser-rum-next/src/domain/manualResource.spec.ts`
- Modify: `packages/browser-rum-next/src/processor/index.ts`
- Modify: `packages/browser-rum-next/src/index.ts`

**Step 1: Write the spec first**

Create `packages/browser-rum-next/src/domain/manualResource.spec.ts`:

```typescript
import { Pipeline } from '@datadog/core-next'
import { startManualResourceProcessor } from './manualResource'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startManualResourceProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
  })

  it('start + stop publishes observation:resource with a duration', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startManualResourceProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_resource', { url: 'https://api.example.com/data' })
    pipeline.publish('action:stop_resource', { url: 'https://api.example.com/data' })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('resource')
    const resource = obs.resource as Record<string, unknown>
    expect(resource.url).toBe('https://api.example.com/data')
    expect(typeof resource.duration).toBe('number')
    expect((resource.duration as number)).toBeGreaterThanOrEqual(0)
  })

  it('stop without matching start is ignored', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startManualResourceProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:stop_resource', { url: 'https://api.example.com/nonexistent' })
    await tick()

    expect(observations.length).toBe(0)
  })

  it('includes type, method, statusCode, and size', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startManualResourceProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_resource', { url: '/api/users', type: 'fetch', method: 'POST' })
    pipeline.publish('action:stop_resource', { url: '/api/users', statusCode: 201, size: 512 })
    await tick()

    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.type).toBe('fetch')
    expect(resource.method).toBe('POST')
    expect(resource.status_code).toBe(201)
    expect(resource.size).toBe(512)
  })

  it('defaults type to "other" when not provided', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startManualResourceProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_resource', { url: '/api/data' })
    pipeline.publish('action:stop_resource', { url: '/api/data' })
    await tick()

    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.type).toBe('other')
  })

  it('context is included when provided', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startManualResourceProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_resource', { url: '/api/data' })
    pipeline.publish('action:stop_resource', { url: '/api/data', context: { team: 'frontend' } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ team: 'frontend' })
  })

  it('resourceKey is used as the lookup key instead of url', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startManualResourceProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_resource', { url: '/api/data', resourceKey: 'my-key' })
    pipeline.publish('action:stop_resource', { resourceKey: 'my-key', statusCode: 200 })
    await tick()

    expect(observations.length).toBe(1)
    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.url).toBe('/api/data')
  })

  it('marks manual resources with _dd.is_manual: true', async () => {
    const observations: unknown[] = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))

    startManualResourceProcessor(pipeline)
    pipeline.seal()

    pipeline.publish('action:start_resource', { url: '/api/data' })
    pipeline.publish('action:stop_resource', { url: '/api/data' })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    const dd = obs._dd as Record<string, unknown>
    expect(dd?.is_manual).toBe(true)
  })
})
```

**Step 2: Run spec to verify it fails**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/manualResource.spec.ts
```

Expected: compilation error.

**Step 3: Write the implementation**

Create `packages/browser-rum-next/src/domain/manualResource.ts`:

```typescript
import type { Pipeline } from '@datadog/core-next'

function startManualResourceProcessor(pipeline: Pipeline<Record<string, unknown>>): void {
  const active = new Map<string, { url: string; startTime: number; startDate: number; type?: string; method?: string }>()

  pipeline.subscribe('action:start_resource', (data) => {
    const resource = data as { url: string; type?: string; method?: string; resourceKey?: string }
    const key = resource.resourceKey || resource.url
    active.set(key, {
      url: resource.url,
      startTime: performance.now(),
      startDate: Date.now(),
      type: resource.type,
      method: resource.method,
    })
  })

  pipeline.subscribe('action:stop_resource', (data) => {
    const stop = data as { url?: string; statusCode?: number; size?: number; context?: object; resourceKey?: string }
    const key = stop.resourceKey || stop.url || ''
    const entry = active.get(key)
    if (!entry) return
    active.delete(key)

    pipeline.publish('observation:resource', {
      type: 'resource',
      date: entry.startDate,
      resource: {
        url: entry.url,
        type: entry.type || 'other',
        method: entry.method,
        status_code: stop.statusCode,
        duration: performance.now() - entry.startTime,
        size: stop.size,
      },
      _dd: { is_manual: true },
      ...(stop.context && { context: stop.context }),
    })
  })
}

export { startManualResourceProcessor }
```

**Step 4: Run spec to verify it passes**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/manualResource.spec.ts
```

Expected: all tests pass.

**Step 5: Wire into RUM module and public API**

In `packages/browser-rum-next/src/processor/index.ts`:

1. Add import:
   ```typescript
   import { startManualResourceProcessor } from '../domain/manualResource'
   ```

2. Inside `init()`, after `startVitalProcessor(context.pipeline)`:
   ```typescript
   // Start manual resource processor
   startManualResourceProcessor(context.pipeline)
   ```

In `packages/browser-rum-next/src/index.ts`, add to `datadogRum`:

```typescript
  startResource(url: string, options?: { type?: string; method?: string; resourceKey?: string }) {
    publish('action:start_resource', { url, ...options })
  },
  stopResource(url?: string, options?: { statusCode?: number; size?: number; context?: object; resourceKey?: string }) {
    publish('action:stop_resource', { url, ...options })
  },
```

**Step 6: Add tests for manual resource wiring**

In `packages/browser-rum-next/src/processor/index.spec.ts`, add:

```typescript
it('action:start_resource + action:stop_resource publishes observation:resource', async () => {
  const context = createTestContext()
  const { pipeline } = context
  const observations: unknown[] = []

  pipeline.subscribe('observation:resource', (data) => observations.push(data))

  init(context)
  pipeline.seal()

  pipeline.publish('action:start_resource', { url: 'https://api.example.com/data' })
  pipeline.publish('action:stop_resource', { url: 'https://api.example.com/data' })
  await tick()

  expect(observations.length).toBeGreaterThanOrEqual(1)
  const manualObs = (observations as Record<string, unknown>[]).find((o) => {
    const dd = o._dd as Record<string, unknown> | undefined
    return dd?.is_manual === true
  })
  expect(manualObs).toBeDefined()
})
```

In `packages/browser-rum-next/src/index.spec.ts`, add:

```typescript
it('datadogRum exposes startResource and stopResource', () => {
  expect(typeof (datadogRum as any).startResource).toBe('function')
  expect(typeof (datadogRum as any).stopResource).toBe('function')
})

it('startResource publishes action:start_resource to the pipeline', async () => {
  const pipeline = new Pipeline<Record<string, unknown>>()
  const received: unknown[] = []

  pipeline.subscribe('action:start_resource', (event) => {
    received.push(event)
  })

  connectBridges(pipeline)
  pipeline.seal()

  ;(datadogRum as any).startResource('/api/data', { type: 'fetch', method: 'GET' })
  await waitMicrotask()

  const event = received.find((e: any) => e.url === '/api/data') as any
  expect(event).toBeDefined()
  expect(event.type).toBe('fetch')
  expect(event.method).toBe('GET')
})
```

**Step 7: Run all specs**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/manualResource.spec.ts --spec packages/browser-rum-next/src/processor/index.spec.ts --spec packages/browser-rum-next/src/index.spec.ts
```

Expected: all pass.

**Step 8: Commit**

```bash
git add packages/browser-rum-next/src/domain/manualResource.ts packages/browser-rum-next/src/domain/manualResource.spec.ts packages/browser-rum-next/src/processor/index.ts packages/browser-rum-next/src/index.ts packages/browser-rum-next/src/processor/index.spec.ts packages/browser-rum-next/src/index.spec.ts
git commit -m "✨ Add manual resource tracking API"
```

---

## Task 7: Full verification

**Step 1: Run all new and related specs together**

```bash
yarn test:unit --spec packages/browser-rum-next/src/domain/vitals.spec.ts --spec packages/browser-rum-next/src/domain/graphql.spec.ts --spec packages/browser-rum-next/src/domain/manualResource.spec.ts --spec packages/browser-rum-next/src/processor/index.spec.ts --spec packages/browser-sdk/src/collectors/fetchCollector.spec.ts --spec packages/browser-sdk/src/collectors/xhrCollector.spec.ts --spec packages/browser-rum-next/src/index.spec.ts
```

Expected: all pass.

**Step 2: Run typecheck**

```bash
yarn typecheck
```

Expected: no errors.

**Step 3: Run linter**

```bash
yarn lint
```

Expected: no errors or warnings.
