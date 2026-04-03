# browser-core-next Design

**Goal:** Provide browser-specific bindings that make `core-next` work in a browser environment. Achieves feature parity with the existing `packages/core` transport and session store layers.

**Architecture:** `browser-core-next` sits between `core-next` (environment-agnostic) and the product bundles (RUM, Logs). It implements the `Transport` and `SessionStore` interfaces from `core-next` using browser APIs.

```
@datadog/core-next                      (environment-agnostic infrastructure)
└─ @datadog/browser-core-next           (browser I/O: fetch, beacon, storage)
   └─ @datadog/browser-sdk              (product bundle)
```

## Scope

Two domains: **transport** and **session stores**.

## Transport

### httpRequest

Sends serialized event data to the Datadog intake over HTTP.

**Strategies:**

- `fetch` — primary strategy for regular sends. POST with no Content-Type to avoid CORS preflight.
- `sendBeacon` — fire-and-forget for page exit. Falls back to fetch if beacon queue is full or payload exceeds 16 KiB.

**Retry and backoff (inline):**

- Retries on: network error (offline), 408, 429, 5xx.
- Exponential backoff: 1s → 2s → 4s → ... → 60s max.
- Bandwidth monitoring: max 80 KiB in-flight, max 32 concurrent requests.
- Queue cap: 20 MiB. Reports error once when full.
- State machine: UP → FAILURE_DETECTED → DOWN.

**Two send paths:**

- `send()` — fetch with retry strategy.
- `sendOnExit()` — beacon first, fetch fallback. No retry.

### encoder

Compresses payloads before sending.

**Two modes:**

- Identity — plain text passthrough.
- Deflate — compression via pako. Async encoding with `finishSync()` fallback for page exit.

### eventBridge

Communication channel for the browser SDK running inside a native iOS/Android webview.

- Detects `window.DatadogEventBridge`.
- Checks if current domain is in the bridge's allowed hosts.
- Sends events via `bridge.send()` instead of HTTP when available.
- Queries bridge capabilities (e.g. session recording support).

### Page exit and session expire

Not a separate module. Browser lifecycle hooks wired during initialization:

- `visibilitychange` / `beforeunload` / `pagehide` → `batch.flush()`
- `session.on('expired')` → `batch.flush()`

These call `batch.flush()` from `core-next`, which emits the buffered messages. The transport listener then calls `httpRequest.sendOnExit()` or `httpRequest.send()` depending on the flush reason.

## Session Stores

Three implementations of `core-next`'s async `SessionStore` interface:

```ts
interface SessionStore {
  get(): Promise<SessionState | undefined>
  set(state: SessionState): Promise<void>
  clear(): Promise<void>
  onExternalChange(callback: () => void): () => void
}
```

### cookieStore

- Reads/writes `document.cookie`.
- Uses Web Locks API for cross-tab concurrency control.
- No fallback lock mechanism (accepts browser support gap: Safari < 16.4).
- `onExternalChange` uses `CookieStore` API where available, polling fallback otherwise.

### localStorageStore

- Reads/writes `localStorage`.
- `onExternalChange` uses the `storage` event for cross-tab sync.

### memoryStore

- Stores state on a global object (`window._DD_SESSION`).
- Allows RUM and Logs SDKs to share session in the same page.
- No cross-tab sync (`onExternalChange` is a no-op).

### selectStore

Auto-selects the best available store:

1. Cookie store (if cookies are authorized and available).
2. LocalStorage store (if localStorage is available).
3. Memory store (fallback).

## Package Structure

```
packages/browser-core-next/
├── src/
│   ├── domain/
│   │   ├── transport/
│   │   │   ├── httpRequest.ts
│   │   │   ├── encoder.ts
│   │   │   ├── eventBridge.ts
│   │   │   └── index.ts
│   │   └── session/
│   │       ├── cookieStore.ts
│   │       ├── localStorageStore.ts
│   │       ├── memoryStore.ts
│   │       ├── selectStore.ts
│   │       └── index.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@datadog/core-next` — peer dependency (Transport, SessionStore, Batch, Session interfaces).
- `pako` — deflate compression library (existing dependency in the monorepo).

## Constants (carried from old core)

| Constant                | Value   | Purpose                    |
| ----------------------- | ------- | -------------------------- |
| Request bytes limit     | 16 KiB  | Max payload for sendBeacon |
| Message bytes limit     | 256 KiB | Max single message size    |
| Max in-flight bytes     | 80 KiB  | Bandwidth cap              |
| Max concurrent requests | 32      | Request cap                |
| Max queue size          | 20 MiB  | Queue cap                  |
| Initial backoff         | 1s      | First retry delay          |
| Max backoff             | 60s     | Max retry delay            |

## Future Improvements

- **Extract retry/backoff to `core-next`** — the state machine (UP/FAILURE_DETECTED/DOWN), exponential backoff, bandwidth monitoring, and queue management are pure logic with no browser dependencies. Other SDKs (Node, React Native) would reuse the same retry behavior. The browser-specific part is only `navigator.onLine` for offline detection, which could be injected as a callback.
- **Extract flush triggers from Batch** — time/size/count flush logic in `core-next`'s `Batch` could be split into a standalone flush controller, keeping `Batch` as a pure buffer. Page exit triggers would remain in `browser-core-next`.
