# Profiling Quota Check Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quota admission API check to the browser profiler so that sessions exceeding the org quota stop profiling and surface the reason on RUM events.

**Architecture:** The profiler starts recording immediately (optimistic), then fires a `checkProfilingQuota()` call in parallel. If the API returns 429, `stopProfiling('quota-exceeded')` is called and the profiling context is updated. All new code lives inside the lazy-loaded profiler chunk; no shared code is touched.

**Tech Stack:** TypeScript, Jasmine + Karma (unit tests), `window.fetch` + `AbortController` (quota HTTP call), existing `mockable`/`replaceMockable` test pattern.

**Spec:** `docs/superpowers/specs/2026-04-21-profiling-quota-design.md`

> **Commit policy:** Never commit without asking the user first. The commit commands in each task are shown for reference — always confirm before running them.

---

## Chunk 1: `quotaCheck.ts` module + type update

### Task 1: Add `'quota-exceeded'` to `stateReason`

No test needed — this is a pure type change with no runtime behaviour.

**Files:**
- Modify: `packages/rum/src/domain/profiling/types/rumProfiler.types.ts`

- [ ] **Step 1: Add the new literal to the union**

  In `rumProfiler.types.ts`, find `RumProfilerStoppedInstance` and change:

  ```typescript
  readonly stateReason: 'session-expired' | 'stopped-by-user' | 'initializing'
  ```

  to:

  ```typescript
  readonly stateReason: 'session-expired' | 'stopped-by-user' | 'initializing' | 'quota-exceeded'
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add packages/rum/src/domain/profiling/types/rumProfiler.types.ts
  git commit -m "[PROF-13798] ✨ Add quota-exceeded stateReason to RumProfilerStoppedInstance"
  ```

---

### Task 2: Create `quotaCheck.ts` (TDD)

**Files:**
- Create: `packages/rum/src/domain/profiling/quotaCheck.ts`
- Create: `packages/rum/src/domain/profiling/quotaCheck.spec.ts`

The function signature:
```typescript
export function checkProfilingQuota(
  configuration: RumConfiguration,
  sessionId: string,
  timeoutMs?: number
): Promise<'quota-ok' | 'quota-exceeded'>
```

Behaviour:
- URL: `https://api.${configuration.site}/api/unstable/profiling/admission?session_id=${sessionId}&dd-api-key=${configuration.clientToken}`
- Uses `AbortController` with a `setTimeout` for `timeoutMs` (default 5000 ms).
- Returns `'quota-exceeded'` **only** on HTTP 429.
- Returns `'quota-ok'` on HTTP 200, network error, or timeout (`AbortError`).

The codebase mocks `window.fetch` via `interceptRequests()` from `@datadog/browser-core/test`. Use `interceptor.withFetch(mock, mock, ...)` to queue fetch responses. Use `mockClock()` from the same package to control `setTimeout` for timeout tests.

- [ ] **Step 1: Write the failing tests**

  Create `packages/rum/src/domain/profiling/quotaCheck.spec.ts`:

  ```typescript
  import { mockClock } from '@datadog/browser-core/test'
  import { interceptRequests, DEFAULT_FETCH_MOCK, TOO_MANY_REQUESTS_FETCH_MOCK, NETWORK_ERROR_FETCH_MOCK } from '@datadog/browser-core/test'
  import { mockRumConfiguration } from '../../../../rum-core/test'
  import { checkProfilingQuota } from './quotaCheck'

  describe('checkProfilingQuota', () => {
    let interceptor: ReturnType<typeof interceptRequests>

    beforeEach(() => {
      interceptor = interceptRequests()
    })

    it('returns quota-ok on HTTP 200', async () => {
      interceptor.withFetch(DEFAULT_FETCH_MOCK)
      const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
      expect(result).toBe('quota-ok')
    })

    it('returns quota-exceeded on HTTP 429', async () => {
      // Both quota_exceeded and org_disabled map to HTTP 429 — the SDK only inspects status code,
      // not the response body, so a single 429 test covers both backend reasons.
      interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK)
      const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
      expect(result).toBe('quota-exceeded')
    })

    it('returns quota-ok on network error (fail-open)', async () => {
      interceptor.withFetch(NETWORK_ERROR_FETCH_MOCK)
      const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
      expect(result).toBe('quota-ok')
    })

    it('returns quota-ok when fetch times out', async () => {
      const clock = mockClock() // auto-cleaned via registerCleanupTask — no manual cleanup needed
      // Never-resolving fetch
      interceptor.withFetch(() => new Promise(() => {}))
      const promise = checkProfilingQuota(mockRumConfiguration(), 'session-123', 5000)
      clock.tick(5000)
      const result = await promise
      expect(result).toBe('quota-ok')
    })

    it('builds the URL with site, session_id and dd-api-key', async () => {
      interceptor.withFetch(DEFAULT_FETCH_MOCK)
      await checkProfilingQuota(
        mockRumConfiguration({ site: 'datadoghq.com', clientToken: 'my-token' }),
        'session-abc'
      )
      expect(interceptor.requests[0].url).toBe(
        'https://api.datadoghq.com/api/unstable/profiling/admission?session_id=session-abc&dd-api-key=my-token'
      )
    })
  })
  ```

- [ ] **Step 2: Run the tests to confirm they fail**

  ```bash
  yarn test:unit --spec packages/rum/src/domain/profiling/quotaCheck.spec.ts
  ```

  Expected: compilation error or test failure ("checkProfilingQuota is not a function" or similar).

- [ ] **Step 3: Implement `quotaCheck.ts`**

  Create `packages/rum/src/domain/profiling/quotaCheck.ts`:

  ```typescript
  import { fetch } from '@datadog/browser-core'
  import type { RumConfiguration } from '@datadog/browser-rum-core'

  export function checkProfilingQuota(
    configuration: RumConfiguration,
    sessionId: string,
    timeoutMs = 5000
  ): Promise<'quota-ok' | 'quota-exceeded'> {
    const url = `https://api.${configuration.site}/api/unstable/profiling/admission?session_id=${sessionId}&dd-api-key=${configuration.clientToken}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    return fetch(url, { signal: controller.signal })
      .then((response) => {
        clearTimeout(timeoutId)
        return response.status === 429 ? 'quota-exceeded' : 'quota-ok'
      })
      .catch(() => {
        clearTimeout(timeoutId)
        // Timeout (AbortError) and network errors both fail-open
        return 'quota-ok'
      })
  }
  ```

  Note: `fetch` is imported from `@datadog/browser-core` (not used as a global). This wrapper bypasses Zone.js patching for Angular compatibility — the same pattern used in `httpRequest.ts`.

- [ ] **Step 4: Run the tests to confirm they pass**

  ```bash
  yarn test:unit --spec packages/rum/src/domain/profiling/quotaCheck.spec.ts
  ```

  Expected: all tests GREEN.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/rum/src/domain/profiling/quotaCheck.ts packages/rum/src/domain/profiling/quotaCheck.spec.ts
  git commit -m "[PROF-13798] ✨ Add checkProfilingQuota module with tests"
  ```

---

## Chunk 2: Integrate quota check into `profiler.ts`

> **Depends on Chunk 1**: `quotaCheck.ts` must exist and `'quota-exceeded'` must be in `RumProfilerStoppedInstance.stateReason` before starting this chunk.

### Task 3: Wire quota check into `profiler.ts` (TDD)

**Files:**
- Modify: `packages/rum/src/domain/profiling/profiler.ts`
- Modify: `packages/rum/src/domain/profiling/profiler.spec.ts`

Three changes in `profiler.ts`:
1. Add `quotaCheckGeneration` counter (closure variable) and quota check logic in `start()`.
2. Update `stopProfiling()` to set `error_reason: 'quota-exceeded'` when appropriate.
3. Update `SESSION_RENEWED` subscriber to also restart on `'quota-exceeded'`.

In `profiler.ts`, wrap the call with `mockable()` so tests can replace it:
```typescript
import { mockable } from '@datadog/browser-core'
import { checkProfilingQuota } from './quotaCheck'

// inside createRumProfiler:
let quotaCheckGeneration = 0

// inside start():
const checkGeneration = ++quotaCheckGeneration
const sessionId = session.findTrackedSession()?.id
if (sessionId) {
  mockable(checkProfilingQuota)(configuration, sessionId)
    .then((result) => {
      if (checkGeneration !== quotaCheckGeneration) return
      if (instance.state !== 'running' && instance.state !== 'paused') return
      if (result === 'quota-exceeded') {
        stopProfiling('quota-exceeded')
      }
    })
    .catch(monitorError)
}
```

In tests, use `replaceMockable(checkProfilingQuota, () => Promise.resolve('quota-ok'))` to control the result.

- [ ] **Step 1: Write the failing tests**

  Add to `packages/rum/src/domain/profiling/profiler.spec.ts`.

  **a. Add import** at the top alongside other imports:

  ```typescript
  import { checkProfilingQuota } from './quotaCheck'
  ```

  **b. Add a default stub** inside the top-level `describe('profiler', ...)` `beforeEach`, after `interceptor = interceptRequests()`. Without this, all existing tests that call `profiler.start()` will break because `checkProfilingQuota` will be called but not mocked:

  ```typescript
  beforeEach(() => {
    interceptor = interceptRequests()
    interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)
    replaceMockable(checkProfilingQuota, () => Promise.resolve('quota-ok')) // default: quota always ok
  })
  ```

  **c. Add a new `describe('quota check', ...)` block** before the final `waitForBoolean` helper at the bottom of the file:

  ```typescript
  describe('quota check', () => {
    it('should stop profiler and set quota-exceeded context when quota check returns quota-exceeded', async () => {
      const { profiler, profilingContextManager } = setupProfiler()

      replaceMockable(checkProfilingQuota, () => Promise.resolve('quota-exceeded'))

      profiler.start()
      await waitForBoolean(() => profiler.isStopped())

      expect(profilingContextManager.get()).toEqual({ status: 'stopped', error_reason: 'quota-exceeded' })
      expect(interceptor.requests.length).toBe(0) // no data sent
    })

    it('should keep profiler running when quota check returns quota-ok', async () => {
      const { profiler, profilingContextManager } = setupProfiler()

      replaceMockable(checkProfilingQuota, () => Promise.resolve('quota-ok'))

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      expect(profiler.isRunning()).toBe(true)
      expect(profilingContextManager.get()?.status).toBe('running')
    })

    it('should not call quota check and proceed when sessionId is undefined at start', async () => {
      const quotaSpy = jasmine.createSpy('checkProfilingQuota').and.returnValue(Promise.resolve('quota-ok'))
      replaceMockable(checkProfilingQuota, quotaSpy)

      // Use setupProfiler but override the session to return no tracked session
      const { profiler } = setupProfiler()
      // findTrackedSession is called during start() — returning undefined means no session id
      spyOn(profiler as any, 'findTrackedSession').and.returnValue(undefined)
      // NOTE: since we can't spy on the session directly via profiler,
      // instead create a fresh profiler with a session manager that has no tracked session:
      const hooks = createHooks()
      const profilingContextManager = startProfilingContext(hooks)
      const noSessionManager = createRumSessionManagerMock()
      spyOn(noSessionManager, 'findTrackedSession').and.returnValue(undefined)
      const profilerNoSession = createRumProfiler(
        mockRumConfiguration({ profilingSampleRate: 100 }),
        new LifeCycle(),
        noSessionManager,
        profilingContextManager,
        createIdentityEncoder,
        mockViewHistory(),
        { sampleIntervalMs: 10, collectIntervalMs: 60000, minNumberOfSamples: 0, minProfileDurationMs: 0 }
      )

      profilerNoSession.start()
      await waitForBoolean(() => profilerNoSession.isRunning())

      expect(quotaSpy).not.toHaveBeenCalled()
      expect(profilerNoSession.isRunning()).toBe(true)
    })

    it('should discard quota-exceeded result when profiler was already stopped by user', async () => {
      const { profiler, profilingContextManager } = setupProfiler()

      // Quota check will resolve after user stops
      let resolveQuota!: (result: 'quota-ok' | 'quota-exceeded') => void
      replaceMockable(checkProfilingQuota, () => new Promise((resolve) => { resolveQuota = resolve }))

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      // User stops before quota resolves
      profiler.stop()
      expect(profiler.isStopped()).toBe(true)
      expect(profilingContextManager.get()?.status).toBe('stopped')
      expect(profilingContextManager.get()?.error_reason).toBeUndefined()

      // Quota resolves as exceeded — must be discarded
      resolveQuota('quota-exceeded')
      await waitNextMicrotask()

      expect(profilingContextManager.get()?.error_reason).toBeUndefined()
    })

    it('should discard quota-exceeded result when SESSION_EXPIRED fired before quota resolved', async () => {
      const { profiler, profilingContextManager } = setupProfiler()

      let resolveQuota!: (result: 'quota-ok' | 'quota-exceeded') => void
      replaceMockable(checkProfilingQuota, () => new Promise((resolve) => { resolveQuota = resolve }))

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      // Session expires before quota resolves
      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      expect(profiler.isStopped()).toBe(true)

      resolveQuota('quota-exceeded')
      await waitNextMicrotask()

      // error_reason should not be quota-exceeded — session-expired wins
      expect(profilingContextManager.get()?.error_reason).toBeUndefined()
    })

    it('should stop profiler and not resume when quota-exceeded resolves while paused', async () => {
      const { profiler, profilingContextManager } = setupProfiler()

      let resolveQuota!: (result: 'quota-ok' | 'quota-exceeded') => void
      replaceMockable(checkProfilingQuota, () => new Promise((resolve) => { resolveQuota = resolve }))

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      // Hide tab → profiler pauses
      setVisibilityState('hidden')
      await waitForBoolean(() => profiler.isPaused())

      // Quota resolves as exceeded while paused
      resolveQuota('quota-exceeded')
      await waitNextMicrotask()

      expect(profiler.isStopped()).toBe(true)
      expect(profilingContextManager.get()).toEqual({ status: 'stopped', error_reason: 'quota-exceeded' })

      // Show tab — must NOT resume
      setVisibilityState('visible')
      await waitNextMicrotask()

      expect(profiler.isStopped()).toBe(true)
    })

    it('should discard stale quota result when SESSION_RENEWED restarts the profiler', async () => {
      const { profiler, profilingContextManager } = setupProfiler()

      let resolveOldQuota!: (result: 'quota-ok' | 'quota-exceeded') => void
      let callCount = 0
      replaceMockable(checkProfilingQuota, () => {
        callCount++
        if (callCount === 1) {
          return new Promise((resolve) => { resolveOldQuota = resolve })
        }
        return Promise.resolve('quota-ok')
      })

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      // Session expires then renews → profiler restarts, new quota check fired
      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      await waitForBoolean(() => profiler.isRunning())

      // Old quota check resolves as exceeded — must be discarded
      resolveOldQuota('quota-exceeded')
      await waitNextMicrotask()

      expect(profiler.isRunning()).toBe(true)
      expect(profilingContextManager.get()?.status).toBe('running')
    })

    it('should restart profiler and re-check quota on SESSION_RENEWED after quota-exceeded', async () => {
      const { profiler } = setupProfiler()

      let callCount = 0
      replaceMockable(checkProfilingQuota, () => {
        callCount++
        // First call: quota exceeded, second call: quota ok
        return Promise.resolve(callCount === 1 ? 'quota-exceeded' : 'quota-ok')
      })

      profiler.start()
      await waitForBoolean(() => profiler.isStopped())

      expect(callCount).toBe(1)

      // Session renews → profiler restarts and re-checks quota
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      await waitForBoolean(() => profiler.isRunning())

      expect(callCount).toBe(2)
      expect(profiler.isRunning()).toBe(true)
    })

    it('should NOT restart profiler on SESSION_RENEWED after stopped-by-user', async () => {
      const { profiler } = setupProfiler()

      replaceMockable(checkProfilingQuota, () => Promise.resolve('quota-ok'))

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      profiler.stop()
      expect(profiler.isStopped()).toBe(true)

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      await waitNextMicrotask()

      expect(profiler.isStopped()).toBe(true)
    })
  })
  ```

  Note: `waitNextMicrotask`, `replaceMockable`, and `setVisibilityState` are already available in the file scope — no import changes needed.

- [ ] **Step 2: Run the tests to confirm they fail**

  ```bash
  yarn test:unit --spec packages/rum/src/domain/profiling/profiler.spec.ts
  ```

  Expected: new tests FAIL (checkProfilingQuota not called from profiler yet, SESSION_RENEWED still only checks `session-expired`).

- [ ] **Step 3: Implement quota check in `profiler.ts`**

  **3a. Add `checkProfilingQuota` import at the top of `profiler.ts`** (alongside existing imports — `mockable` is already imported, do not add it again):
  ```typescript
  import { checkProfilingQuota } from './quotaCheck'
  ```

  **3b. Add `quotaCheckGeneration` counter in `createRumProfiler` closure, after the `instance` variable declaration:**
  ```typescript
  let instance: RumProfilerInstance = { state: 'stopped', stateReason: 'initializing' }
  let quotaCheckGeneration = 0
  ```

  **3c. Update `start()` — add quota check after `startNextProfilerInstance()`:**

  The current `start()` ends after `startNextProfilerInstance()`. Add the quota check block immediately after it:
  ```typescript
  // Quota check — optimistic: profiler already recording, only gates sending.
  // Generation counter invalidates results from prior sessions.
  const checkGeneration = ++quotaCheckGeneration
  const sessionId = session.findTrackedSession()?.id
  if (sessionId) {
    mockable(checkProfilingQuota)(configuration, sessionId)
      .then((result) => {
        if (checkGeneration !== quotaCheckGeneration) return
        if (instance.state !== 'running' && instance.state !== 'paused') return
        if (result === 'quota-exceeded') {
          stopProfiling('quota-exceeded')
        }
      })
      .catch(monitorError)
  }
  ```

  **3d. Update `stopProfiling()` — change the `profilingContextManager.set` call:**

  Find the line:
  ```typescript
  profilingContextManager.set({ status: 'stopped', error_reason: undefined })
  ```

  Replace with:
  ```typescript
  if (reason === 'quota-exceeded') {
    // TODO(PROF-13798): remove `as any` once rum-events-format schema adds 'quota-exceeded' to error_reason
    profilingContextManager.set({ status: 'stopped', error_reason: 'quota-exceeded' as any })
  } else {
    profilingContextManager.set({ status: 'stopped', error_reason: undefined })
  }
  ```

  **3e. Update the `SESSION_RENEWED` subscriber — add `'quota-exceeded'` to the restart condition:**

  Find:
  ```typescript
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    if (instance.state === 'stopped' && instance.stateReason === 'session-expired') {
      start()
    }
  })
  ```

  Replace with:
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

- [ ] **Step 4: Run the tests to confirm they pass**

  ```bash
  yarn test:unit --spec packages/rum/src/domain/profiling/profiler.spec.ts
  ```

  Expected: all tests GREEN (including the new quota check describe block).

- [ ] **Step 5: Run the full profiling test suite to confirm no regressions**

  ```bash
  yarn test:unit --spec packages/rum/src/domain/profiling/
  ```

  Expected: all tests GREEN.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/rum/src/domain/profiling/profiler.ts packages/rum/src/domain/profiling/profiler.spec.ts
  git commit -m "[PROF-13798] ✨ Gate profiling on quota admission API"
  ```
