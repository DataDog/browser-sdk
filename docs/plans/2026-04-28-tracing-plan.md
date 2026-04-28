# Distributed Tracing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement distributed tracing for v8: ID generation, 4 propagation formats, header injection in fetch/XHR collectors, trace context on resource events, document trace extraction, and tracing-specific sampling.

**Architecture:** ID generation and header generators are pure functions in `core-next`. The collectors in `browser-sdk` gain tracing config awareness and inject headers before requests. The RUM resource processor attaches trace/span IDs to observation events. Document trace is extracted once at RUM init.

**Tech Stack:** TypeScript, `crypto.getRandomValues`, Jasmine/Karma tests.

---

## Prerequisites

- Design doc: `docs/plans/2026-04-28-tracing-design.md`
- Test command: `yarn test:unit --spec <path>`
- ID generation: `packages/core-next/src/domain/tracing/`
- Collectors: `packages/browser-sdk/src/collectors/`
- RUM processor: `packages/browser-rum-next/src/domain/processor.ts`

---

### Task 1: Implement identifier generation

**Files:**
- Create: `packages/core-next/src/domain/tracing/identifier.ts`
- Create: `packages/core-next/src/domain/tracing/identifier.spec.ts`

**Implementation:**

```typescript
interface Identifier {
  toString(radix?: number): string
}

function createIdentifier(bits: 63 | 64): Identifier {
  const buffer = crypto.getRandomValues(new Uint32Array(2))
  if (bits === 63) {
    buffer[1] >>>= 1 // clear MSB for 63-bit
  }

  return {
    toString(radix = 10): string {
      // Custom conversion supporting full 64-bit range
      // Use two 32-bit halves: high * 2^32 + low
      const high = buffer[1]
      const low = buffer[0]
      if (radix === 16) {
        return (high >>> 0).toString(16) + (low >>> 0).toString(16).padStart(8, '0')
      }
      // Decimal: use BigInt if available, fallback to manual division
      if (typeof BigInt !== 'undefined') {
        return (BigInt(high) * BigInt(0x100000000) + BigInt(low >>> 0)).toString(10)
      }
      // Fallback for environments without BigInt
      return fallbackToDecimal(high, low)
    },
  }
}

function toPaddedHexadecimalString(id: Identifier): string {
  return id.toString(16).padStart(16, '0')
}
```

The `fallbackToDecimal` function handles manual decimal conversion for environments without BigInt. Use the same approach as v6: divide the 64-bit value represented as two 32-bit halves by 10 repeatedly.

**Tests:**
- `createIdentifier(64)` returns an identifier with toString(10) producing a decimal string
- `createIdentifier(64)` returns an identifier with toString(16) producing a hex string
- `createIdentifier(63)` produces values within 63-bit range (hex string length <= 15 chars or high bit is 0)
- `toPaddedHexadecimalString` pads to 16 characters
- Two calls produce different IDs (randomness check)
- Default `toString()` (no arg) returns decimal

**Export:** from `packages/core-next/src/domain/tracing/index.ts` and `packages/core-next/src/index.ts`.

**Commit:** `✨ Add generic identifier generation for tracing`

---

### Task 2: Implement propagation header generators

**Files:**
- Create: `packages/core-next/src/domain/tracing/propagation.ts`
- Create: `packages/core-next/src/domain/tracing/propagation.spec.ts`

**Implementation:**

Four generator functions + a combiner:

```typescript
type PropagatorType = 'datadog' | 'tracecontext' | 'b3' | 'b3multi'

function datadogHeaders(traceId: Identifier, spanId: Identifier, sampled: boolean): Record<string, string> {
  return {
    'x-datadog-trace-id': traceId.toString(10),
    'x-datadog-parent-id': spanId.toString(10),
    'x-datadog-sampling-priority': sampled ? '1' : '0',
    'x-datadog-origin': 'rum',
  }
}

function tracecontextHeaders(traceId: Identifier, spanId: Identifier, sampled: boolean): Record<string, string> {
  const hexTrace = toPaddedHexadecimalString(traceId)
  const hexSpan = toPaddedHexadecimalString(spanId)
  return {
    traceparent: `00-0000000000000000${hexTrace}-${hexSpan}-0${sampled ? '1' : '0'}`,
    tracestate: `dd=s:${sampled ? '1' : '0'};o:rum`,
  }
}

function b3Headers(traceId: Identifier, spanId: Identifier, sampled: boolean): Record<string, string> {
  return {
    b3: `${toPaddedHexadecimalString(traceId)}-${toPaddedHexadecimalString(spanId)}-${sampled ? '1' : '0'}`,
  }
}

function b3multiHeaders(traceId: Identifier, spanId: Identifier, sampled: boolean): Record<string, string> {
  return {
    'X-B3-TraceId': toPaddedHexadecimalString(traceId),
    'X-B3-SpanId': toPaddedHexadecimalString(spanId),
    'X-B3-Sampled': sampled ? '1' : '0',
  }
}

function makeTracingHeaders(
  traceId: Identifier,
  spanId: Identifier,
  sampled: boolean,
  propagatorTypes: PropagatorType[]
): Record<string, string> {
  const generators: Record<PropagatorType, typeof datadogHeaders> = {
    datadog: datadogHeaders,
    tracecontext: tracecontextHeaders,
    b3: b3Headers,
    b3multi: b3multiHeaders,
  }
  let headers: Record<string, string> = {}
  for (const type of propagatorTypes) {
    headers = { ...headers, ...generators[type](traceId, spanId, sampled) }
  }
  return headers
}
```

**Tests:**
- `datadogHeaders` produces 4 correct headers with decimal IDs
- `tracecontextHeaders` produces correct `traceparent` format (00-{32 hex}-{16 hex}-{flag})
- `tracecontextHeaders` produces correct `tracestate` format
- `b3Headers` produces single `b3` header
- `b3multiHeaders` produces 3 headers with hex IDs
- `makeTracingHeaders` merges headers from multiple propagator types
- `makeTracingHeaders` with `['tracecontext', 'datadog']` produces 6 headers total
- Sampled=false sets correct flags (0) in all formats

**Export:** from `packages/core-next/src/domain/tracing/index.ts` and `packages/core-next/src/index.ts`.

**Commit:** `✨ Add propagation header generators (datadog, W3C, b3, b3multi)`

---

### Task 3: Add URL matching utility for allowed tracing origins

**Files:**
- Create: `packages/core-next/src/domain/tracing/matchUrl.ts`
- Create: `packages/core-next/src/domain/tracing/matchUrl.spec.ts`

**Implementation:**

```typescript
type MatchOption = string | RegExp | ((url: string) => boolean)

interface TracingOption {
  match: MatchOption
  propagatorTypes: PropagatorType[]
}

const DEFAULT_PROPAGATOR_TYPES: PropagatorType[] = ['tracecontext', 'datadog']

function normalizeTracingOptions(
  urls: Array<string | RegExp | MatchOption | { match: MatchOption; propagatorTypes?: PropagatorType[] }>
): TracingOption[] {
  return urls.map((url) => {
    if (typeof url === 'string' || url instanceof RegExp || typeof url === 'function') {
      return { match: url, propagatorTypes: DEFAULT_PROPAGATOR_TYPES }
    }
    return { match: url.match, propagatorTypes: url.propagatorTypes || DEFAULT_PROPAGATOR_TYPES }
  })
}

function findTracingOption(url: string, options: TracingOption[]): TracingOption | undefined {
  return options.find((option) => {
    const match = option.match
    if (typeof match === 'string') return url.startsWith(match)
    if (match instanceof RegExp) return match.test(url)
    if (typeof match === 'function') return match(url)
    return false
  })
}
```

**Tests:**
- String match (prefix): `'https://api.example.com'` matches `'https://api.example.com/users'`
- RegExp match: `/^https:\/\/.*\.example\.com/` matches `'https://api.example.com/data'`
- Function match: `(url) => url.includes('api')` matches correctly
- Returns undefined for non-matching URL
- Normalize: plain string gets default propagator types
- Normalize: object with explicit propagatorTypes preserves them

**Export** from tracing index.

**Commit:** `✨ Add URL matching for allowed tracing origins`

---

### Task 4: Add tracing config to RUM extension

**Files:**
- Modify: `packages/browser-rum-next/src/domain/configuration.ts`

Add tracing fields to `RumInitConfiguration` and `RumConfig`:

```typescript
interface RumInitConfiguration {
  trackResources?: boolean
  trackLongTasks?: boolean
  trackErrors?: boolean
  // new
  allowedTracingUrls?: Array<string | RegExp | { match: string | RegExp | ((url: string) => boolean); propagatorTypes?: PropagatorType[] }>
  traceSampleRate?: number
  traceContextInjection?: 'sampled' | 'all'
}

interface RumConfig {
  trackResources: boolean
  trackLongTasks: boolean
  trackErrors: boolean
  // new
  tracingOptions: TracingOption[]  // normalized from allowedTracingUrls
  traceSampleRate: number          // default 100
  traceContextInjection: 'sampled' | 'all'  // default 'sampled'
}
```

In `validate()`:
- Normalize `allowedTracingUrls` using `normalizeTracingOptions`
- Default `traceSampleRate` to 100
- Default `traceContextInjection` to `'sampled'`
- Validate `traceSampleRate` is 0-100

**Tests:** Update `packages/browser-rum-next/src/domain/configuration.spec.ts` if it exists, or test via integration.

**Commit:** `✨ Add tracing configuration to RUM extension`

---

### Task 5: Update collectors with tracing header injection

**Files:**
- Modify: `packages/browser-sdk/src/collectors/fetchCollector.ts`
- Modify: `packages/browser-sdk/src/collectors/fetchCollector.spec.ts`
- Modify: `packages/browser-sdk/src/collectors/xhrCollector.ts`
- Modify: `packages/browser-sdk/src/collectors/xhrCollector.spec.ts`

**Changes to collector start functions:**

Both collectors gain an optional `tracingConfig` parameter:

```typescript
interface CollectorTracingConfig {
  tracingOptions: TracingOption[]
  traceSampleRate: number
  traceContextInjection: 'sampled' | 'all'
  sessionId: string
}

function startFetchCollection(
  pipeline: Pipeline<Record<string, unknown>>,
  tracingConfig?: CollectorTracingConfig
): () => void
```

**Fetch collector changes:**

Before `originalFetch.apply()`:
1. Call `findTracingOption(url, tracingConfig.tracingOptions)`
2. If match found:
   - `sampled = isSampled(tracingConfig.sessionId, tracingConfig.traceSampleRate)`
   - If sampled OR `traceContextInjection === 'all'`:
     - `traceId = createIdentifier(64)`, `spanId = createIdentifier(63)`
     - `headers = makeTracingHeaders(traceId, spanId, sampled, option.propagatorTypes)`
     - Merge headers into `init.headers` (create new Headers object if needed)
   - Store `traceId`, `spanId` for the published event
3. Include `traceId` and `spanId` on the `resource:network_request` publish

**XHR collector changes:**

In the `open()` override, store url/method as today. In `send()` override:
1. Same matching + sampling logic
2. If traced: call `xhr.setRequestHeader(name, value)` for each tracing header
3. Store traceId/spanId on `(xhr as any)._dd_traceId` / `_dd_spanId`
4. Include in published event

**Tests for each collector:**
- Injects headers when URL matches allowedTracingUrls
- Does not inject headers when URL doesn't match
- Does not inject headers when tracingConfig is undefined
- Includes traceId/spanId in published resource:network_request
- Respects traceContextInjection: 'all' (injects even when not sampled)
- Sets correct sampling priority based on traceSampleRate

Note: for testing the sampling decision, use a fixed sessionId and a traceSampleRate of 100 (always sampled) or 0 (never sampled) to get deterministic results.

**Commit:** `✨ Add tracing header injection to fetch and XHR collectors`

---

### Task 6: Update sdk.ts to pass tracing config to collectors

**Files:**
- Modify: `packages/browser-sdk/src/domain/sdk.ts`

After config is built (including RUM extension validation), extract the tracing config and pass it to collectors:

```typescript
const rumConfig = (config as any).rum as RumConfig | undefined
const tracingConfig = rumConfig && rumConfig.tracingOptions.length > 0
  ? {
      tracingOptions: rumConfig.tracingOptions,
      traceSampleRate: rumConfig.traceSampleRate,
      traceContextInjection: rumConfig.traceContextInjection,
      sessionId: session.getId(),
    }
  : undefined

const stopFetch = startFetchCollection(pipeline, tracingConfig)
const stopXhr = startXhrCollection(pipeline, tracingConfig)
```

If RUM is not configured or has no `allowedTracingUrls`, `tracingConfig` is undefined and collectors behave as before.

**Tests:** Existing integration tests should still pass. Add one test verifying that tracing config is passed through.

**Commit:** `🔌 Wire tracing config from RUM extension to collectors`

---

### Task 7: Update NetworkRequestResource type

**Files:**
- Modify: `packages/core-next/src/domain/pipeline/events.ts`

Add optional `traceId` and `spanId` to `NetworkRequestResource`:

```typescript
interface NetworkRequestResource {
  method: string
  url: string
  status: number
  isAborted: boolean
  startTime: number
  startDate: number
  duration: number
  responseBody?: string
  error?: string
  traceId?: unknown  // Identifier from core-next/tracing
  spanId?: unknown
}
```

Use `unknown` to avoid importing `Identifier` type into events.ts (keep it simple).

**Commit:** `🏷️ Add traceId/spanId to NetworkRequestResource`

---

### Task 8: Update RUM resource processor with trace context

**Files:**
- Modify: `packages/browser-rum-next/src/domain/processor.ts`
- Modify: `packages/browser-rum-next/src/domain/processor.spec.ts`

In the `resource:performance_entry` handler, when a network match is found with traceId/spanId:

```typescript
const resource: Record<string, unknown> = {
  type: 'resource',
  resource: { ... },
  // existing fields
}

if (networkMatch?.traceId && networkMatch?.spanId) {
  resource._dd = {
    trace_id: String(networkMatch.traceId),
    span_id: String(networkMatch.spanId),
    rule_psr: rumConfig?.traceSampleRate ? rumConfig.traceSampleRate / 100 : undefined,
  }
}
```

**Tests:**
- Resource observation includes _dd.trace_id when network match has traceId
- Resource observation does not include _dd when network match has no traceId
- _dd.rule_psr is traceSampleRate / 100

**Commit:** `✨ Add trace context to RUM resource observations`

---

### Task 9: Implement document trace extraction

**Files:**
- Create: `packages/browser-rum-next/src/domain/getDocumentTraceId.ts`
- Create: `packages/browser-rum-next/src/domain/getDocumentTraceId.spec.ts`

**Implementation:**

```typescript
const OUTDATED_THRESHOLD = 2 * 60 * 1000 // 2 minutes

function getDocumentTraceId(document: Document): string | undefined {
  const data = getFromMeta(document) || getFromComment(document)
  if (!data) return undefined
  if (data.traceTime <= Date.now() - OUTDATED_THRESHOLD) return undefined
  return data.traceId
}

function getFromMeta(doc: Document): { traceId: string; traceTime: number } | undefined {
  const traceId = doc.querySelector('meta[name="dd-trace-id"]')?.getAttribute('content')
  const traceTime = doc.querySelector('meta[name="dd-trace-time"]')?.getAttribute('content')
  if (!traceId || !traceTime) return undefined
  return { traceId, traceTime: Number(traceTime) }
}

function getFromComment(doc: Document): { traceId: string; traceTime: number } | undefined {
  // Walk child nodes of <html>, look for comment matching DATADOG;trace-id=X,trace-time=Y
  const root = doc.documentElement
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i]
    if (node.nodeType === Node.COMMENT_NODE) {
      const match = node.textContent?.match(/DATADOG;trace-id=(\d+),trace-time=(\d+)/)
      if (match) return { traceId: match[1], traceTime: Number(match[2]) }
    }
  }
  return undefined
}
```

**Tests:**
- Extracts trace ID from meta tags
- Extracts trace ID from HTML comments
- Returns undefined when no trace data
- Returns undefined when trace is older than 2 minutes
- Prefers meta tags over comments

**Commit:** `✨ Add document trace extraction`

---

### Task 10: Wire document trace into initial resource

**Files:**
- Modify: `packages/browser-rum-next/src/processor/index.ts`

In RUM's `init()`, call `getDocumentTraceId(document)` once. If a trace ID is found, attach it to the first `observation:resource` that corresponds to the initial navigation (the document resource).

The simplest approach: register an enricher on `observation:resource` that checks if the resource URL matches `window.location.href` (the document URL) and the trace hasn't been applied yet:

```typescript
let documentTraceApplied = false
const documentTraceId = getDocumentTraceId(document)

if (documentTraceId) {
  pipeline.enrich('observation:resource', enricher({
    name: 'documentTrace',
    transform: (data: Record<string, unknown>) => {
      if (documentTraceApplied) return data
      const resource = data.resource as Record<string, unknown>
      if (resource?.url === window.location.href || resource?.type === 'document') {
        documentTraceApplied = true
        return {
          ...data,
          _dd: {
            ...((data._dd as Record<string, unknown>) || {}),
            trace_id: documentTraceId,
            span_id: createIdentifier(63).toString(10),
          },
        }
      }
      return data
    },
  }))
}
```

**Tests:** Add to integration tests — verify initial resource has document trace ID when meta tag is present. (Hard to test in Karma since we can't control the document's meta tags easily. May need to test the `getDocumentTraceId` function in isolation and trust the enricher wiring.)

**Commit:** `🔌 Wire document trace into initial resource observation`

---

### Task 11: Add integration test

**Files:**
- Modify: `packages/browser-sdk/src/integration/rum.spec.ts`

Add:
- Manual addAction with tracing not configured → resource events have no _dd.trace_id (verify no regression)
- If possible: verify collector publishes traceId/spanId on network request when tracing is configured. This requires passing `allowedTracingUrls` in the init config.

```typescript
it('resource observation includes trace context when tracing is configured', async () => {
  currentSdk = await createSdk({
    clientToken: 'test-token',
    site: 'datadoghq.com',
    modules: [rumProcessor],
    rum: {
      allowedTracingUrls: [{ match: /.*/, propagatorTypes: ['datadog'] }],
      traceSampleRate: 100,
    },
  })
  // Trigger a fetch that matches
  // The fetch spy intercepts — check if tracing headers were set
  // Check if the resource event includes _dd
})
```

Note: testing header injection in integration tests is tricky because the fetch spy replaces fetch. The collector's patched fetch won't see the spy's fetch. Consider testing at the unit level (collector spec) and keeping the integration test light.

**Commit:** `✅ Add tracing integration tests`

---

## Task dependency graph

```
Task 1 (identifiers) ──────────────────────┐
Task 2 (propagation headers) ◄─────────────┤
Task 3 (URL matching) ─────────────────────┤
                                            │
Task 4 (RUM config) ◄──────────────────────┤
Task 7 (NetworkRequestResource type) ───────┤
                                            │
Task 5 (collector header injection) ◄───────┤ depends on 1, 2, 3, 7
Task 6 (sdk.ts wiring) ◄───────────────────┤ depends on 4, 5
Task 8 (resource processor enrichment) ◄────┘ depends on 7
Task 9 (document trace) ───────────────────┐
Task 10 (wire document trace) ◄────────────┘
Task 11 (integration test) ◄─── depends on all
```

Tasks 1, 2, 3 are independent pure functions. Task 4 is independent config. Tasks 5-6 wire collectors. Tasks 8-10 wire the resource side. Task 11 verifies end-to-end.

## Verification

After all tasks:
```
yarn test:unit --spec packages/core-next/src/domain/tracing/identifier.spec.ts --spec packages/core-next/src/domain/tracing/propagation.spec.ts --spec packages/core-next/src/domain/tracing/matchUrl.spec.ts --spec packages/browser-sdk/src/collectors/fetchCollector.spec.ts --spec packages/browser-sdk/src/collectors/xhrCollector.spec.ts --spec packages/browser-sdk/src/domain/sdk.spec.ts --spec packages/browser-rum-next/src/domain/processor.spec.ts --spec packages/browser-rum-next/src/domain/getDocumentTraceId.spec.ts --spec packages/browser-rum-next/src/processor/index.spec.ts --spec packages/browser-sdk/src/integration/rum.spec.ts
```
