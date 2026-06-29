# Plan: Move `createBatch` and dependencies to `@datadog/js-core/transport`

## Goal

Move the batching transport stack from `packages/browser-core/src/transport/` to
`packages/js-core/src/transport/` so it becomes available to all SDK consumers
(including non-browser environments) via `@datadog/js-core/transport`.

---

## Dependency Analysis

### Direct dependencies of `createBatch` (batch.ts)

| Import                                            | Location                                         | Browser-specific?       | Status                |
| ------------------------------------------------- | ------------------------------------------------ | ----------------------- | --------------------- |
| `EndpointBuilder`                                 | `@datadog/js-core/transport`                     | No                      | ✅ Already in js-core |
| `Encoder`, `createIdentityEncoder`                | `browser-core/tools/encoder`                     | No                      | Needs move            |
| `createHttpRequest`, `Payload`                    | `browser-core/transport/httpRequest`             | Yes (fetch, sendBeacon) | Needs design decision |
| `createFlushController`, `FlushEvent`, …          | `browser-core/transport/flushController`         | Partially               | Needs move            |
| `isPageExitReason`, `createPageMayExitObservable` | `browser-core/browser/pageMayExitObservable`     | Yes                     | Needs design decision |
| `Observable`                                      | `browser-core/tools/observable`                  | No                      | Needs move            |
| `display`, `DOCS_TROUBLESHOOTING`, …              | `browser-core/tools/display`                     | No (wraps js-core/util) | Can stay / re-export  |
| `jsonStringify`                                   | `browser-core/tools/serialisation/jsonStringify` | No                      | Needs move            |
| `Context`                                         | `browser-core/tools/serialisation/context`       | No (pure types)         | Needs move            |
| `objectValues`                                    | `browser-core/tools/utils/polyfills`             | No                      | Needs move            |
| `computeBytesCount`, `ONE_KIBI_BYTE`              | `browser-core/tools/utils/byteUtils`             | No                      | Needs move            |
| `mockable`                                        | `browser-core/tools/mockable`                    | No                      | Needs move            |

### Transitive dependencies

**`flushController.ts`** needs:

- `Observable` (browser-core)
- `setTimeout` / `clearTimeout` from `timer.ts` (browser-core, wraps globalObject for ZoneJS)
- `pageMayExitObservable` types — already injected as **parameter** ✓
- `RECOMMENDED_REQUEST_BYTES_LIMIT` from `httpRequest.ts` (circular if we move both)

**`httpRequest.ts`** needs:

- `Observable` (browser-core)
- `fetch.ts` (browser-core, uses `globalObject.fetch` + ZoneJS patching)
- `sendWithRetryStrategy.ts` (browser-core)
- `byteUtils` (browser-core)

**`sendWithRetryStrategy.ts`** needs:

- `Observable` (browser-core)
- `timer.ts` (`setTimeout`) (browser-core)
- `byteUtils`, `responseUtils` (browser-core)

**`observable.ts`** needs:

- `queueMicrotask.ts` (browser-core) → needs `monitor` + `globalObject`

**`timer.ts`** needs:

- `globalObject` (`js-core/util` ✓)
- `getZoneJsOriginalValue` (browser-core)
- `monitor` (browser-core wrapper around `js-core/monitor`)

---

## Design Decisions Required

### 1. How to handle `pageMayExitObservable` (browser-specific)

`flushController` already takes it as a **parameter** — it doesn't import it directly.
`createBatch` currently creates it internally via `mockable(createPageMayExitObservable)()`.

**Decision**: Make `pageMayExitObservable` an explicit parameter of `createBatch`
(consistent with how `encoder` is already injectable). Callers in browser-core
(`startLogsBatch`, `startRumBatch`, `startDebuggerBatch`) will create it and pass it in.

This avoids moving `pageMayExitObservable` to js-core.

### 2. How to handle `httpRequest` (uses fetch + sendBeacon)

Two options:

- **Option A** _(preferred)_: Move `httpRequest` to js-core as well, making fetch/sendBeacon
  strategies injectable via a passed-in `sendStrategy`/`sendOnExitStrategy`. Callers in
  browser-core create the strategies and pass them to `createHttpRequest`.

- **Option B**: Keep `httpRequest` in browser-core and make it an explicit parameter of
  `createBatch`. Simpler short-term but breaks the "full stack in js-core" goal.

### 3. How to handle `timer.ts` (ZoneJS-aware setTimeout)

`flushController` and `sendWithRetryStrategy` both use `timer.ts`.  
`timer.ts` depends on `getZoneJsOriginalValue` and `monitor` (browser-core wrappers).

**Decision**: Move `timer.ts` and `getZoneJsOriginalValue.ts` to js-core. They already use
`globalObject` from js-core and the ZoneJS concern is valid in any environment.
`monitor` in `timer.ts` wraps callbacks — use injected monitor or js-core/monitor directly.

### 4. Where does `Observable` live in js-core?

Include in `@datadog/js-core/util`. It crowds util a bit but avoids a new entry for a single class.

---

## Proposed Commit Sequence

### Commit 1 — Move pure utilities to js-core/util

**Files**: `byteUtils.ts`, `responseUtils.ts`, `objectValues` (from `polyfills.ts`),
`functionUtils.ts` (noop + others), `context.ts` (types), `jsonStringify.ts`

These have **zero browser dependencies** and are used across many modules.
Export via `@datadog/js-core/util` (or a new `@datadog/js-core/serialisation` entry
if preferred to avoid bloating util).

Update all browser-core imports to re-export from js-core.

**Why first**: Smallest, most isolated change. No design decisions needed.
Unblocks Encoder and sendWithRetryStrategy moves.

---

### Commit 2 — Move `mockable` to js-core

**Files**: `mockable.ts`

Standalone utility, only depends on `__BUILD_ENV__SDK_VERSION__`.
Export from `@datadog/js-core/util` or a new `@datadog/js-core/mockable` entry.

**Why separate**: Touches many files (anything using mockable) — easier to review in isolation.

---

### Commit 3 — Move `Observable` to js-core

**Files**: `observable.ts`, `queueMicrotask.ts`

`Observable` is a fundamental building block used by virtually every module being moved.
`queueMicrotask.ts` needs `monitor` — use js-core/monitor's `createMonitor` directly,
or make the monitor injectable in Observable (simplest: just use `Promise.resolve().then`
as the async scheduling mechanism, removing the monitor dependency in queueMicrotask).

Export from `@datadog/js-core/util`.

**Why separate**: High-impact change touching many browser-core imports. Isolated review is valuable.

---

### Commit 4 — Move `Encoder` to js-core/transport

**Files**: `encoder.ts` (Encoder interface, createIdentityEncoder, EncoderResult)

Depends only on `byteUtils` (moved in Commit 1). Pure encoding abstraction.
Export from `@datadog/js-core/transport`.

**Why separate**: Used by batch and by the deflate encoder in browser-worker.
Clean, focused change.

---

### Commit 5 — Move `timer.ts` + `getZoneJsOriginalValue.ts` to js-core/util

**Files**: `timer.ts`, `getZoneJsOriginalValue.ts`

Both already use `globalObject` from js-core. Move them alongside it.
Resolve `monitor` dependency: `timer.ts` uses `monitor(callback)` to wrap setTimeout callbacks.
Move `getZoneJsOriginalValue` to js-core/util, use js-core/monitor for wrapping.

Export `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `TimeoutId` from
`@datadog/js-core/util`.

**Why separate**: ZoneJS patching is subtle — a dedicated diff is easier to audit.

---

### Commit 6 — Move `sendWithRetryStrategy` to js-core/transport

**Files**: `sendWithRetryStrategy.ts`

Depends on: Observable (Commit 3), timer (Commit 5), byteUtils (Commit 1), responseUtils (Commit 1).
Pure retry logic, no browser API calls. Well suited for js-core.

Export from `@datadog/js-core/transport`.

---

### Commit 7 — Move `flushController` to js-core/transport

**Files**: `flushController.ts`

Depends on: Observable (Commit 3), timer (Commit 5).
`pageMayExitObservable` is already injected as a parameter ✓.
Move `RECOMMENDED_REQUEST_BYTES_LIMIT` to js-core/transport (it's a transport constant,
not specific to httpRequest).

Both `flushController` and `sendWithRetryStrategy` are **internal implementation details**
of `createBatch` — neither needs to be publicly exported from `@datadog/js-core/transport`.
They live as internal modules, only imported by `batch.ts`.

`FlushEvent`, `FlushReason`, and `UrgentFlushReason` appear in the `Batch` interface
(via `flushObservable` and `prepareUrgentFlushObservable`) so they do need to be exported
as types. `createFlushController` and `FlushController` do not — they stay internal.
`browser-core/src/index.ts` currently re-exports them; after the move it just re-exports
from `@datadog/js-core/transport` instead, with no change for downstream consumers.

---

### Commit 8 — Move `httpRequest` to js-core/transport (Option A)

**Files**: `httpRequest.ts`, `fetch.ts` (browser-core/browser)

Make `sendStrategy` and `sendOnExitStrategy` injectable in `createHttpRequest` — the
browser-specific fetch + sendBeacon strategies stay in browser-core and are passed in
by callers. `httpRequest.ts` itself becomes generic logic (retry, observable, queue).

Alternatively under Option B: skip this commit and inject `httpRequest` as a parameter
to `createBatch` in the next commit, keeping it in browser-core.

---

### Commit 9 — Move `createBatch` to js-core/transport

**Files**: `batch.ts`

With all dependencies in js-core, this becomes a straightforward move.
`pageMayExitObservable` becomes an explicit parameter (Decision 1).
Under Option A, `createHttpRequest` is imported from js-core.
Under Option B, `httpRequest` is an injectable parameter.

Update `browser-core/transport/index.ts` to re-export from js-core for backward compatibility.
Update all callers (`startLogsBatch`, `startRumBatch`, `startDebuggerBatch`) to pass
`pageMayExitObservable` (and optionally `httpRequest` under Option B).

---

## What Stays in browser-core

| File                                                             | Reason                                              |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `pageMayExitObservable.ts`                                       | Uses DOM events (addEventListener, visibilityState) |
| `fetch.ts`                                                       | Uses globalObject.fetch + ZoneJS patching           |
| `eventBridge.ts`                                                 | Browser-specific                                    |
| `startLogsBatch.ts`, `startRumBatch.ts`, `startDebuggerBatch.ts` | Domain-level wiring                                 |
| `display.ts`                                                     | Thin wrapper, can stay as-is                        |

---

## Notes on Review Strategy

- Commits 1–5 are the most reviewer-friendly: pure moves with no logic changes.
- Commits 6–7 move logic that already has good test coverage (flushController.spec.ts,
  sendWithRetryStrategy.spec.ts) — tests can move with the files.
- The main risk is in Commit 8 (httpRequest refactor) and Commit 9 (batch API change).
  These should each be reviewed carefully against the existing `.spec.ts` files.
- After each commit, run `yarn typecheck && yarn test:unit` to verify no regressions.
