# Profiling Quota Check — Design Spec

**Ticket**: PROF-13798  
**Date**: 2026-04-21  
**Status**: Approved

## Problem

The browser profiler has no mechanism to enforce per-org profiling quotas. Any session that passes sampling will profile indefinitely, regardless of the organisation's quota limit. This spec describes a quota admission check that gates profiling data transmission without delaying profiler startup.

## Goals

- Call the quota admission API for every session that passes sampling.
- Optimistic: profiler starts recording immediately; only sending is blocked while quota is being checked.
- Fail-open: on timeout (5 s) or network error, treat quota as OK.
- Re-check quota on every new or renewed session.
- All new code lives inside the lazy-loaded profiler chunk (`packages/rum/src/domain/profiling/`). No changes to the shared/core chunk.

## Non-Goals

- Updating the auto-generated `rumEvent.types.ts` schema (deferred to a follow-up PR in `rum-events-format`).
- Server-side quota enforcement (handled by the backend service).

---

## Quota Admission API

**Endpoint**: `GET /api/unstable/profiling/admission`  
**Host**: `api.<site>` (e.g. `api.datadoghq.com` for US1)  
**Auth**: client token via `dd-api-key` query parameter  
**Input**: `session_id` query parameter (the RUM session ID; org ID is resolved server-side from auth)  
**Server-side timeout**: 5 s (enforced independently)

### Response contract

| HTTP status | `admitted` | `reason`                   | SDK action   |
|-------------|------------|----------------------------|--------------|
| 200         | `true`     | `quota_ok`                 | proceed      |
| 200         | `true`     | `backend_unavailable`      | proceed (fail-open) |
| 200         | `true`     | `backend_client_not_initialized` | proceed (fail-open) |
| 429         | `false`    | `quota_exceeded`           | stop profiler |
| 429         | `false`    | `org_disabled`             | stop profiler |

---

## Architecture

### Flow

```
profilerApi.ts  (boot, eagerly loaded — unchanged)
  └── isSampled? → yes
  └── lazyLoadProfiler()
  └── profiler.start()
        ├── startNextProfilerInstance()   ← profiler starts recording immediately
        └── checkProfilingQuota()         ← launched in parallel (new, profiler chunk)
              ├── 200 / timeout / error   → nothing to do, profiler keeps running
              └── 429                     → stopProfiling('quota-exceeded')
                                             profilingContextManager.set({
                                               status: 'stopped',
                                               error_reason: 'quota-exceeded'  // type assertion, see Types section
                                             })
```

### File layout (changes)

| File | Change |
|------|--------|
| `packages/rum/src/domain/profiling/quotaCheck.ts` | **New** — quota API call |
| `packages/rum/src/domain/profiling/profiler.ts` | Call `checkProfilingQuota` in `start()`, handle result, update `SESSION_RENEWED` guard |
| `packages/rum/src/domain/profiling/types/rumProfiler.types.ts` | Add `'quota-exceeded'` to `stateReason` |

`profilerApi.ts`, `lazyLoadProfiler.ts`, and all shared packages are **not modified**.

---

## New module: `quotaCheck.ts`

```typescript
// packages/rum/src/domain/profiling/quotaCheck.ts

export function checkProfilingQuota(
  configuration: RumConfiguration,
  sessionId: string,
  timeoutMs = 5000
): Promise<'quota-ok' | 'quota-exceeded'>
```

### Behaviour

1. Builds URL: `https://api.${configuration.site}/api/unstable/profiling/admission?session_id=${sessionId}&dd-api-key=${configuration.clientToken}`
   - The client token in the query parameter is consistent with how the RUM SDK authenticates all intake requests (see `endpointBuilder.ts`: `dd-api-key=${clientToken}`). This is an established pattern for public-facing browser SDK endpoints.
2. Creates an `AbortController`; schedules `abort()` after `timeoutMs`.
3. `fetch`es the URL.
4. Returns `'quota-exceeded'` only on HTTP 429.
5. Returns `'quota-ok'` in all other cases: HTTP 200, timeout (`AbortError`), any network error. The function cannot distinguish confirmed-OK from fail-open — this is intentional; callers treat both identically.

---

## Changes to `profiler.ts`

### `start()` — launch quota check in parallel

```typescript
function start(): void {
  if (instance.state === 'running') return

  // ... existing view/listener setup ...
  startNextProfilerInstance()

  // Quota check — optimistic: profiler already running, only gates sending.
  // A generation counter guards against results from previous sessions (SESSION_RENEWED).
  const checkGeneration = ++quotaCheckGeneration
  const sessionId = session.findTrackedSession()?.id
  if (sessionId) {
    checkProfilingQuota(configuration, sessionId).then((result) => {
      // Discard result if a new session has started since this check was launched
      if (checkGeneration !== quotaCheckGeneration) return
      // Discard result if the profiler is no longer active (stopped for any reason)
      if (instance.state !== 'running' && instance.state !== 'paused') return
      if (result === 'quota-exceeded') {
        stopProfiling('quota-exceeded')
      }
    }).catch(monitorError) // defensive: checkProfilingQuota does not reject, but guarded for safety
  }
  // If sessionId is undefined at start time, proceed optimistically (no quota check).
  // profilerApi.ts already verified a session exists before reaching this code; this is a safety net.
}
```

`quotaCheckGeneration` is a counter (number) in the `createRumProfiler` closure, initialised to `0`. It is incremented each time `start()` is called, invalidating results from a prior session.

**Scope of the generation counter**: it guards against SESSION_RENEWED (which calls `start()` again). It does NOT guard pause/resume cycles — `handleVisibilityChange` calls `startNextProfilerInstance()` directly, bypassing `start()`, so the generation is unchanged across a pause/resume. This is correct: quota applies to the session, not the profiler instance. A quota check that was in-flight before a pause should still apply when it resolves after a resume. The `instance.state` guard above handles all remaining cases: if the profiler is not `running` or `paused` at resolution time (user stopped it, session expired, etc.), the result is silently discarded.

### `stopProfiling()` — set context on quota-exceeded

The existing `stopProfiling` function sets `profilingContextManager.set({ status: 'stopped', error_reason: undefined })` unconditionally. It must be changed to set `error_reason: 'quota-exceeded'` when the reason is `'quota-exceeded'`:

```typescript
// Illustrative diff — the actual cleanup logic (stopProfilerInstance, globalCleanupTasks)
// is unchanged; only the profilingContextManager.set call changes:

if (reason === 'quota-exceeded') {
  // TODO: remove type assertion once rum-events-format schema is updated (PROF-13798 follow-up)
  profilingContextManager.set({ status: 'stopped', error_reason: 'quota-exceeded' as any })
} else {
  profilingContextManager.set({ status: 'stopped', error_reason: undefined })
}
```

The `instance.state` guard in the `start()` callback prevents `stopProfiling('quota-exceeded')` from ever being called on an already-stopped instance, so there is no risk of overwriting a `stopped-by-user` or `session-expired` context with `quota-exceeded`.

If `stopProfiling('session-expired')` fires while the profiler is already stopped with `quota-exceeded` (edge case: session expiry on the same session), it hits the `else` branch and clears `error_reason` to `undefined`. This is correct — `session-expired` supersedes `quota-exceeded`.

### `SESSION_RENEWED` — also restart on quota-exceeded (re-checks quota for new session)

```typescript
lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
  if (
    instance.state === 'stopped' &&
    (instance.stateReason === 'session-expired' || instance.stateReason === 'quota-exceeded')
  ) {
    start()
  }
})
```

**`stopped-by-user` on renewal**: intentionally not restarted. A user who explicitly stopped the profiler on the previous session should not have profiling automatically restarted on session renewal. Their intent persists across sessions.

---

## Type changes

### `rumProfiler.types.ts`

```typescript
export interface RumProfilerStoppedInstance {
  readonly state: 'stopped'
  readonly stateReason: 'session-expired' | 'stopped-by-user' | 'initializing' | 'quota-exceeded'
}
```

### `rumEvent.types.ts` (auto-generated — deferred)

Adding `'quota-exceeded'` to `ProfilingInternalContextSchema.error_reason` requires a PR in the upstream `rum-events-format` schema repository followed by `yarn json-schemas:sync`. This is tracked as a follow-up to this ticket.

Until then, the value is passed with a type assertion (`as any`) and a TODO comment.

---

## Profiling context status table

| Scenario | `_dd.profiling.status` | `_dd.profiling.error_reason` |
|----------|------------------------|------------------------------|
| Profiler started, quota check in-flight | `running` | — |
| Quota OK or timeout | `running` | — |
| Quota exceeded (running or paused) | `stopped` | `quota-exceeded` |
| Session expired (existing) | `stopped` | — |
| Stopped by user (existing) | `stopped` | — |

**Paused state**: if the profiler is in `paused` state (tab hidden) when the quota check resolves as exceeded, `stopProfiling('quota-exceeded')` transitions it to `stopped/quota-exceeded`. The visibility-change handler only resumes from `paused` — since the instance is now `stopped`, it will not resume when the tab becomes visible again. This is the correct behaviour.

---

## Testing

### `quotaCheck.spec.ts` (new)

- Returns `'quota-ok'` on HTTP 200.
- Returns `'quota-exceeded'` on HTTP 429 with reason `quota_exceeded`.
- Returns `'quota-exceeded'` on HTTP 429 with reason `org_disabled`.
- Returns `'quota-ok'` on network error (fail-open) — asserts return value directly.
- Returns `'quota-ok'` when fetch times out after `timeoutMs` — asserts return value directly (not just profiler side-effects).

### `profiler.spec.ts` additions

- When quota check returns `'quota-exceeded'` while running: profiler stops, `profilingContextManager` receives `{ status: 'stopped', error_reason: 'quota-exceeded' }`, no data is sent via transport.
- When quota check returns `'quota-ok'`: profiler continues running, data is sent normally at next collection interval.
- When quota times out: profiler continues running (verified via `checkProfilingQuota` return value contract, not just profiler state).
- When `session.findTrackedSession()` returns `undefined` at `start()` time: profiler starts and runs without a quota check (optimistic proceed).
- When quota check resolves as `'quota-exceeded'` while profiler is paused (tab hidden): profiler transitions to `stopped/quota-exceeded`; tab-visible event does not resume it.
- When quota check resolves after profiler was stopped by user (`stopped-by-user`): result is discarded — `profilingContextManager` is not updated.
- When quota check resolves after `SESSION_EXPIRED` has already stopped the profiler: result is discarded.
- On `SESSION_RENEWED` after quota-exceeded stop: profiler restarts and re-calls quota API.
- On `SESSION_RENEWED` after `stopped-by-user` stop: profiler does NOT restart.
- Stale quota check: if `SESSION_RENEWED` fires and `start()` is called before a previous quota check resolves, the previous check's result is discarded when it eventually resolves.

---

## Open items / follow-ups

1. **Schema PR** (`rum-events-format`): add `'quota-exceeded'` to `error_reason` in `_profiling-internal-context-schema.json`, then run `yarn json-schemas:sync` and remove the `as any` assertion.
2. **URL confirmation**: verify that `api.<site>` is the correct host for the quota admission endpoint in all supported regions.
