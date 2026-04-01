# Transport Design

## Context

`core-next` is environment-agnostic. The transport layer must be pluggable so that `browser-core`, Node.js, or React Native can each provide their own implementation while sharing the same batching logic.

## Design

### `Transport` interface

Defined in `core-next`. Every implementation provides both methods — non-batching implementations provide a no-op `flush`.

```ts
interface Transport {
  send(data: string): void
  flush(): void
}
```

### `BatchOptions`

Configurable limits for the batching layer.

```ts
interface BatchOptions {
  maxSizeBytes: number
  maxCount: number
  flushTimeoutMs: number
  messageSeparator?: string // default: '\n'
  getMessageSize?: (msg: string) => number // default: msg.length
}
```

`getMessageSize` is injected so environments can use accurate byte counting (`TextEncoder` in browser, `Buffer.byteLength` in Node).

### Batching module

Lives in `core-next/domain/transport`. Accumulates messages and calls `transport.send()` when any limit is hit (size, count, or timeout). `flush()` drains the buffer immediately.

The pipeline calls `transport.send()` — it has no knowledge of batching.

### Responsibility split

| Layer          | Responsibility                                                                            |
| -------------- | ----------------------------------------------------------------------------------------- |
| `core-next`    | `Transport` interface, `BatchOptions`, batch accumulation logic                           |
| `browser-core` | `HttpTransport` (fetch + beacon + retry), flush triggers (visibilitychange, beforeunload) |

## Data flow

```
pipeline.subscribe → serialize(event) → transport.send(data)
                                              ↓
                                     batch accumulates
                                              ↓
                               limit hit or flush() called
                                              ↓
                                  base transport.send(joined)
```

## What is not in scope

- Serialization format (owned by the product layer)
- Retry logic (internal to each `Transport` implementation)
- Flush triggers (owned by `browser-core`)
