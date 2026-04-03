# browser-core-next Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the `browser-core-next` package with browser-specific transport (fetch + beacon + retry + deflate + event bridge) and session store implementations (cookie, localStorage, memory) that plug into `core-next`'s interfaces.

**Architecture:** Port the transport and session layers from `packages/core` to a new `packages/browser-core-next` package, adapting them to use `core-next`'s `Transport`, `SessionStore`, and `Batch` interfaces. The old core uses factory functions and observables — the new code uses classes and `EventEmitter`.

**Tech Stack:** TypeScript, Karma/Jasmine unit tests, pako (deflate)

**Reference files (old core):**

- `packages/core/src/transport/httpRequest.ts` — fetch + beacon strategies
- `packages/core/src/transport/sendWithRetryStrategy.ts` — retry state machine
- `packages/core/src/transport/batch.ts` — message batching with encoder
- `packages/core/src/transport/flushController.ts` — flush trigger logic
- `packages/core/src/transport/eventBridge.ts` — native bridge
- `packages/core/src/domain/session/storeStrategies/sessionInCookie.ts`
- `packages/core/src/domain/session/storeStrategies/sessionInLocalStorage.ts`
- `packages/core/src/domain/session/storeStrategies/sessionInMemory.ts`
- `packages/core/src/browser/cookie.ts` — cookie utilities

---

### Task 1: Package scaffold

**Files:**

- Create: `packages/browser-core-next/package.json`
- Create: `packages/browser-core-next/tsconfig.json`
- Create: `packages/browser-core-next/src/index.ts`

**Step 1: Create `package.json`**

```json
{
  "name": "@datadog/browser-core-next",
  "version": "0.0.0",
  "private": true,
  "license": "Apache-2.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@datadog/core-next": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.8.2"
  }
}
```

**Step 2: Create `tsconfig.json`**

Model it after `packages/core-next/tsconfig.json`. Reference `core-next` as a project reference.

**Step 3: Create `src/index.ts`**

Empty barrel file — will be populated as we add modules.

**Step 4: Add workspace to root `package.json`**

Ensure `packages/browser-core-next` is recognized by the workspace. Run `yarn install`.

**Step 5: Verify**

```bash
yarn typecheck
```

Expected: no new errors.

**Step 6: Commit**

```bash
git add packages/browser-core-next/ package.json yarn.lock
git commit -m "📦 Scaffold browser-core-next package"
```

---

### Task 2: Session stores — memory store

Start with the simplest store. All stores implement `core-next`'s async `SessionStore` interface:

```ts
interface SessionStore {
  get(): Promise<SessionState | undefined>
  set(state: SessionState): Promise<void>
  clear(): Promise<void>
  onExternalChange(callback: () => void): () => void
}
```

**Files:**

- Create: `packages/browser-core-next/src/domain/session/memoryStore.ts`
- Create: `packages/browser-core-next/src/domain/session/memoryStore.spec.ts`

**Step 1: Write tests**

Test that:

- `get()` returns `undefined` when empty
- `set()` persists state, `get()` returns it
- `clear()` removes state
- `set()` stores on a global (`window._DD_SESSION`) so multiple SDK instances share session
- `onExternalChange` returns a no-op unsubscribe (memory store has no cross-tab sync)

**Step 2: Run tests, verify they fail**

```bash
yarn test:unit --spec packages/browser-core-next/src/domain/session/memoryStore.spec.ts
```

**Step 3: Implement `memoryStore.ts`**

Reference: `packages/core/src/domain/session/storeStrategies/sessionInMemory.ts`

Key differences from old core:

- Returns Promises (async interface)
- Stores `SessionState` (not the old `SessionState` with different shape)
- `onExternalChange` returns `() => void` (no-op)

**Step 4: Run tests, verify they pass**

**Step 5: Commit**

```bash
git commit -m "✨ Add memory session store for browser-core-next"
```

---

### Task 3: Session stores — cookie utilities

Before the cookie store, we need low-level cookie helpers.

**Files:**

- Create: `packages/browser-core-next/src/browser/cookie.ts`
- Create: `packages/browser-core-next/src/browser/cookie.spec.ts`

**Step 1: Write tests**

Test:

- `getCookie(name)` reads a cookie by name
- `setCookie(name, value, expiry, options)` writes a cookie
- `deleteCookie(name, options)` removes a cookie
- `areCookiesAuthorized()` returns whether cookies can be read/written

**Step 2: Implement**

Reference: `packages/core/src/browser/cookie.ts`

Port the cookie read/write/delete functions. Simplify where possible — the old code has complex site detection for domain scoping. Port what's needed for session cookies.

**Step 3: Run tests, verify they pass**

**Step 4: Commit**

```bash
git commit -m "✨ Add cookie utilities for browser-core-next"
```

---

### Task 4: Session stores — cookie store

**Files:**

- Create: `packages/browser-core-next/src/domain/session/cookieStore.ts`
- Create: `packages/browser-core-next/src/domain/session/cookieStore.spec.ts`

**Step 1: Write tests**

Test:

- `get()` reads session state from cookie, returns parsed `SessionState`
- `set()` writes session state as serialized cookie
- `clear()` deletes the session cookie
- `get()` returns `undefined` when cookie doesn't exist
- Web Locks: `set()` acquires a lock before writing (test with mock)
- `onExternalChange` fires callback when cookie changes externally

**Step 2: Implement**

Reference: `packages/core/src/domain/session/storeStrategies/sessionInCookie.ts`

Key design:

- Uses `cookie.ts` helpers from Task 3
- Web Locks API (`navigator.locks.request()`) for concurrency — no fallback
- `onExternalChange` uses CookieStore API `addEventListener('change')` if available, otherwise polling
- Serialization: JSON stringify/parse for `SessionState`

**Step 3: Run tests, verify they pass**

**Step 4: Commit**

```bash
git commit -m "✨ Add cookie session store with Web Locks"
```

---

### Task 5: Session stores — localStorage store

**Files:**

- Create: `packages/browser-core-next/src/domain/session/localStorageStore.ts`
- Create: `packages/browser-core-next/src/domain/session/localStorageStore.spec.ts`

**Step 1: Write tests**

Test:

- `get()` reads from `localStorage`, parses JSON
- `set()` writes JSON to `localStorage`
- `clear()` removes the key
- `get()` returns `undefined` when key doesn't exist
- `onExternalChange` subscribes to `window.addEventListener('storage')` and fires callback when the session key changes
- `onExternalChange` returns unsubscribe function that removes the listener

**Step 2: Implement**

Reference: `packages/core/src/domain/session/storeStrategies/sessionInLocalStorage.ts`

**Step 3: Run tests, verify they pass**

**Step 4: Commit**

```bash
git commit -m "✨ Add localStorage session store"
```

---

### Task 6: Session stores — store selection

**Files:**

- Create: `packages/browser-core-next/src/domain/session/selectStore.ts`
- Create: `packages/browser-core-next/src/domain/session/selectStore.spec.ts`
- Create: `packages/browser-core-next/src/domain/session/index.ts`

**Step 1: Write tests**

Test:

- Returns cookie store when cookies are authorized
- Returns localStorage store when cookies unavailable but localStorage works
- Returns memory store as fallback
- Availability checks (cookie test write, localStorage test write)

**Step 2: Implement `selectStore.ts`**

```ts
function selectStore(): SessionStore {
  // 1. Try cookies
  // 2. Try localStorage
  // 3. Fall back to memory
}
```

**Step 3: Create `index.ts` barrel**

Re-export all stores and `selectStore`.

**Step 4: Run tests, verify they pass**

**Step 5: Commit**

```bash
git commit -m "✨ Add session store auto-selection"
```

---

### Task 7: Transport — encoder

**Files:**

- Create: `packages/browser-core-next/src/domain/transport/encoder.ts`
- Create: `packages/browser-core-next/src/domain/transport/encoder.spec.ts`

**Step 1: Write tests**

Test identity encoder:

- `write(data)` appends data
- `finish()` returns accumulated output as string
- `finishSync()` returns same result synchronously
- `isAsync` returns `false`
- Multiple writes accumulate with `\n` separator

Test deflate encoder:

- `write(data)` compresses data
- `finish()` returns compressed `Uint8Array`
- `isAsync` returns `true`
- `encoding` returns `'deflate'`
- `finishSync()` returns partial result + pending data

**Step 2: Implement**

Reference: `packages/core/src/domain/deflate/deflate.types.ts` for the interface shape.

Two implementations:

- `IdentityEncoder` — passthrough, accumulates strings
- `DeflateEncoder` — uses pako for compression

Define the `Encoder` and `EncoderResult` interfaces:

```ts
interface EncoderResult {
  output: string | Uint8Array
  outputBytesCount: number
  encoding?: 'deflate'
  pendingData: string
}

interface Encoder {
  isAsync: boolean
  write(data: string, callback?: () => void): void
  finish(callback: (result: EncoderResult) => void): void
  finishSync(): EncoderResult
}
```

**Step 3: Run tests, verify they pass**

**Step 4: Commit**

```bash
git commit -m "✨ Add identity and deflate encoders"
```

---

### Task 8: Transport — HTTP request

The core transport module. Implements fetch + sendBeacon strategies with retry/backoff.

**Files:**

- Create: `packages/browser-core-next/src/domain/transport/httpRequest.ts`
- Create: `packages/browser-core-next/src/domain/transport/httpRequest.spec.ts`

**Step 1: Write tests**

Test:

- `send()` sends a POST request via fetch
- `send()` does not set Content-Type header
- `sendOnExit()` uses sendBeacon when payload < 16 KiB
- `sendOnExit()` falls back to fetch when sendBeacon fails
- `sendOnExit()` falls back to fetch when payload > 16 KiB
- Retry on 429, 5xx, network error (status 0 + offline)
- No retry on 4xx (except 408, 429)
- No retry on opaque responses
- Exponential backoff: 1s → 2s → 4s → ... → 60s
- Bandwidth limit: refuses when > 80 KiB in-flight or > 32 concurrent
- Queue cap: 20 MiB max, reports error once
- State machine: UP → FAILURE_DETECTED → DOWN → UP
- Multiple endpoints (primary + replica)
- Observable emits success/failure/queue-full events

**Step 2: Implement**

Reference:

- `packages/core/src/transport/httpRequest.ts`
- `packages/core/src/transport/sendWithRetryStrategy.ts`

Combine into a single module. The old core separates these, but since retry is staying in browser-core-next for now, keep them together.

Key types:

```ts
interface Payload {
  data: string | FormData | Blob
  bytesCount: number
  retry?: { count: number; lastFailureStatus: number }
  encoding?: 'deflate'
}

interface HttpRequest {
  send(payload: Payload): void
  sendOnExit(payload: Payload): void
}
```

**Step 3: Run tests, verify they pass**

**Step 4: Commit**

```bash
git commit -m "✨ Add HTTP request with retry and beacon fallback"
```

---

### Task 9: Transport — event bridge

**Files:**

- Create: `packages/browser-core-next/src/domain/transport/eventBridge.ts`
- Create: `packages/browser-core-next/src/domain/transport/eventBridge.spec.ts`

**Step 1: Write tests**

Test:

- `getEventBridge()` returns bridge when `window.DatadogEventBridge` exists
- `getEventBridge()` returns `undefined` when bridge absent
- `canUseEventBridge()` checks current host against allowed hosts
- `bridgeSupports(capability)` checks bridge capabilities
- Bridge `send()` serializes event as JSON

**Step 2: Implement**

Reference: `packages/core/src/transport/eventBridge.ts`

**Step 3: Run tests, verify they pass**

**Step 4: Commit**

```bash
git commit -m "✨ Add event bridge for native webview communication"
```

---

### Task 10: Transport barrel + package index

**Files:**

- Create: `packages/browser-core-next/src/domain/transport/index.ts`
- Modify: `packages/browser-core-next/src/index.ts`

**Step 1: Create transport barrel**

Re-export `HttpRequest`, `Encoder`, `EventBridge` types and factories.

**Step 2: Update package index**

Re-export from both `./domain/transport` and `./domain/session`.

**Step 3: Run full test suite**

```bash
yarn test:unit --spec packages/browser-core-next/src/
```

Expected: all tests pass.

**Step 4: Run typecheck**

```bash
yarn typecheck
```

Expected: no new errors.

**Step 5: Commit**

```bash
git commit -m "📦 Add barrel exports for browser-core-next"
```

---

## Execution Order

Tasks are ordered by dependency:

1. **Package scaffold** — prerequisite for everything
2. **Memory store** — simplest store, no dependencies
3. **Cookie utilities** — prerequisite for cookie store
4. **Cookie store** — depends on cookie utilities
5. **LocalStorage store** — independent
6. **Store selection** — depends on all three stores
7. **Encoder** — prerequisite for transport tests
8. **HTTP request** — the core transport, depends on encoder
9. **Event bridge** — independent
10. **Barrel exports** — final wiring

Tasks 2-5 (session stores) and Tasks 7-9 (transport) are independent groups that could be parallelized, but sequential execution is safer for a single implementer.
