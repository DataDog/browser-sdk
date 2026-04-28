# Distributed Tracing Design

## Scope

Distributed tracing for v8: trace/span ID generation, header injection into outgoing fetch/XHR requests (4 propagation formats), trace context on RUM resource events, document trace extraction from server-rendered HTML, and tracing-specific sampling.

## Identifier generation (core-next)

A generic `createIdentifier(bits)` function in `core-next/src/domain/tracing/`. Returns an `Identifier` object with `toString(radix)` supporting decimal and hexadecimal output.

```typescript
interface Identifier {
  toString(radix?: number): string
}

function createIdentifier(bits: 63 | 64): Identifier
function toPaddedHexadecimalString(id: Identifier): string  // 16-char hex, zero-padded
```

Uses `crypto.getRandomValues(new Uint32Array(2))` for 64-bit randomness. For 63-bit, clears the MSB. Custom `toString` handles the full 64-bit range since JavaScript numbers lose precision above 2^53.

Usage:
```typescript
const traceId = createIdentifier(64)
const spanId = createIdentifier(63)
traceId.toString(10)  // decimal for Datadog headers
traceId.toString(16)  // hex for W3C/B3 headers
```

## Propagation header generators (core-next)

Four pure functions, each returning `Record<string, string>`:

**datadog:**
```
x-datadog-trace-id: <decimal>
x-datadog-parent-id: <decimal>
x-datadog-sampling-priority: 0 | 1
x-datadog-origin: rum
```

**tracecontext (W3C):**
```
traceparent: 00-0000000000000000<hex-trace-id>-<hex-span-id>-0<sampling-bit>
tracestate: dd=s:<sampling-bit>;o:rum
```

**b3 (single):**
```
b3: <hex-trace-id>-<hex-span-id>-<sampling-bit>
```

**b3multi:**
```
X-B3-TraceId: <hex-trace-id>
X-B3-SpanId: <hex-span-id>
X-B3-Sampled: 0 | 1
```

A `makeTracingHeaders(traceId, spanId, sampled, propagatorTypes)` function calls the relevant generators and merges all headers into one object.

Default propagator types: `['tracecontext', 'datadog']`.

## Collector changes for header injection (browser-sdk)

The fetch and XHR collectors in `browser-sdk/src/collectors/` gain tracing awareness. They receive tracing config from the merged SDK configuration at start time.

```typescript
interface CollectorTracingConfig {
  allowedTracingUrls: Array<{
    match: string | RegExp | ((url: string) => boolean)
    propagatorTypes: string[]
  }>
  traceSampleRate: number
  traceContextInjection: 'sampled' | 'all'
  sessionId: string
}
```

Before each request, the collector:
1. Checks if the URL matches any `allowedTracingUrls` entry
2. If yes, computes sampling: `isSampled(sessionId, traceSampleRate)` (deterministic, Knuth hash)
3. If sampled (or `traceContextInjection === 'all'`): generates trace ID and span ID
4. Calls `makeTracingHeaders()` to get headers for the matched URL's propagator types
5. Injects headers (fetch: merge into `init.headers`, XHR: `setRequestHeader`)
6. Attaches `traceId` and `spanId` to the published `resource:network_request` event

The tracing config is optional. If not provided (no RUM, or tracing not configured), collectors behave exactly as today.

### NetworkRequestResource type update

```typescript
interface NetworkRequestResource {
  // existing fields
  method: string
  url: string
  status: number
  isAborted: boolean
  startTime: number
  startDate: number
  duration: number
  // new
  traceId?: Identifier
  spanId?: Identifier
}
```

## Resource event enrichment (browser-rum-next)

The RUM resource processor already correlates `resource:performance_entry` with `resource:network_request`. When the matched network request has `traceId` and `spanId`, they're included on the observation:

```typescript
{
  type: 'resource',
  resource: { url, duration, ... },
  _dd: {
    trace_id: networkMatch.traceId?.toString(10),
    span_id: networkMatch.spanId?.toString(10),
    rule_psr: traceSampleRate / 100,
  }
}
```

Only fetch/XHR requests that matched `allowedTracingUrls` carry trace context. Performance entries without a network match (images, stylesheets, etc.) don't get trace IDs.

## Document trace extraction (browser-rum-next)

A standalone function that reads server-side trace context from the initial HTML document.

Two extraction methods:

**Meta tags (preferred):**
```html
<meta name="dd-trace-id" content="123456789">
<meta name="dd-trace-time" content="1234567890000">
```

**HTML comment (fallback):**
```html
<!-- DATADOG;trace-id=123456789,trace-time=1234567890000 -->
```

Validation: trace time must be within 2 minutes of now. Returns `traceId` string or undefined.

The RUM processor calls this once at init. The initial document's `observation:resource` (from the `navigation` performance entry) gets the document trace ID with a freshly generated span ID.

## Tracing configuration

Lives in the RUM module's extension. Validated by `rumExtension` and merged into the SDK config. Collectors read it from the merged config.

```typescript
interface RumInitConfiguration {
  // existing
  trackResources?: boolean
  trackLongTasks?: boolean
  trackErrors?: boolean
  // new
  allowedTracingUrls?: Array<
    | string
    | RegExp
    | { match: string | RegExp | ((url: string) => boolean); propagatorTypes?: PropagatorType[] }
  >
  traceSampleRate?: number              // 0-100, default 100
  traceContextInjection?: 'sampled' | 'all'  // default 'sampled'
}

type PropagatorType = 'datadog' | 'tracecontext' | 'b3' | 'b3multi'
```

When `allowedTracingUrls` is not configured, tracing is disabled. No headers are injected.

When a URL entry is a plain string or RegExp (no explicit `propagatorTypes`), the default `['tracecontext', 'datadog']` is used.

## Tracing sampling

Independent from RUM session sampling. Uses the same deterministic Knuth hash mechanism from the session sampler, seeded with the session ID.

```typescript
const sampled = isSampled(sessionId, traceSampleRate)
```

Same session always gets the same tracing decision for a given rate. The `isSampled` function already exists in `core-next` for session sampling. Reuse it for tracing.

With `traceContextInjection: 'all'`, headers are always injected regardless of sampling. The `x-datadog-sampling-priority` / `traceparent` sampling bit is set to 0, letting the backend decide.

## Out of scope

- Baggage header propagation (`propagateTraceBaggage` config)
- OpenTelemetry propagation format
- Trace context propagation from incoming requests (server-side only concern)
