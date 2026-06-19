# Partial View Updates — Option C (messagesCount) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `batch.flushObservable` / `BatchFlushEvent` approach with a simpler one: after VIEW upserts, check `batch.flushController.messagesCount > 0` to determine whether the VIEW made it into the current batch or was already flushed out.

**Architecture:** The `flushController.flushObservable` subscriber unconditionally resets `batchHasFullView = false` and advances `batchBase = lastSentView` on every flush. After each VIEW upsert (new view and checkpoint), the router then checks `messagesCount > 0` to restore `batchHasFullView = true` if the VIEW is still in the batch. For the new-view case, `lastSentView` is set **after** `batch.upsert` so the subscriber sees the old view when a sync flush fires mid-upsert.

**Tech Stack:** TypeScript, Jasmine, `@datadog/browser-core` batch/flushController.

---

### Task 1: Revert `batch.ts` and related exports

**Files:**

- Modify: `packages/browser-core/src/transport/batch.ts`
- Modify: `packages/browser-core/src/transport/index.ts`
- Modify: `packages/browser-core/src/index.ts`
- Modify: `packages/browser-debugger/src/entries/main.spec.ts`

- [ ] **Step 1: Remove `flushObservable` from `Batch` and `createBatch`**

In `packages/browser-core/src/transport/batch.ts`:

- Remove `import { Observable } from '../tools/observable'`
- Remove `export type BatchFlushEvent = FlushEvent & { upsertedKeys: string[] }`
- Remove the `flushObservable` property from the `Batch` interface
- Remove `const batchFlushObservable = new Observable<BatchFlushEvent>()` from `createBatch`
- Remove `const upsertedKeys = Object.keys(upsertBuffer)` and `batchFlushObservable.notify(...)` from `flush()`
- Remove `flushObservable: batchFlushObservable` from the return object

The `Batch` interface should be back to:

```typescript
export interface Batch {
  flushController: FlushController
  add: (message: Context) => void
  upsert: (message: Context, key: string) => void
  stop: () => void
}
```

- [ ] **Step 2: Remove `BatchFlushEvent` from exports**

In `packages/browser-core/src/transport/index.ts`, revert to:

```typescript
export type { Batch } from './batch'
export { createBatch } from './batch'
```

In `packages/browser-core/src/index.ts`, remove `BatchFlushEvent,` from the export block that contains `FlushEvent`.

- [ ] **Step 3: Fix debugger spec mock**

In `packages/browser-debugger/src/entries/main.spec.ts`:

- Remove `import { Observable } from '@datadog/browser-core'`
- Remove `flushObservable: new Observable(),` from both mock batch objects

- [ ] **Step 4: Typecheck**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/browser-core/src/transport/batch.ts \
        packages/browser-core/src/transport/index.ts \
        packages/browser-core/src/index.ts \
        packages/browser-debugger/src/entries/main.spec.ts
git commit -m "🔥 Remove batch.flushObservable and BatchFlushEvent"
```

---

### Task 2: Update `createViewBatchRouter` in `startRumBatch.ts`

**Files:**

- Modify: `packages/browser-rum-core/src/transport/startRumBatch.ts`

- [ ] **Step 1: Change the `Pick` type and subscriber**

Replace the `batch` parameter type and subscriber. The `Pick` goes back to `'flushController' | 'add' | 'upsert'`. The subscriber resets state unconditionally — no `upsertedKeys` check needed:

```typescript
export function createViewBatchRouter(
  batch: Pick<ReturnType<typeof createBatch>, 'flushController' | 'add' | 'upsert'>
): { route: (event: AssembledRumEvent) => void; stop: () => void } {
  let lastSentView: RumViewEvent | undefined
  let batchBase: RumViewEvent | undefined
  let batchHasFullView = false
  let viewUpdatesSinceCheckpoint = 0

  // On flush: advance batchBase to lastSentView (what the backend now has) and clear the flag.
  // lastSentView is set AFTER batch.upsert() in the new-view and checkpoint paths so that if
  // upsert() triggers a sync flush, the subscriber captures the previous view (what the backend
  // actually received), not the one being added.
  const { unsubscribe } = batch.flushController.flushObservable.subscribe(() => {
    batchHasFullView = false
    batchBase = lastSentView
  })
```

- [ ] **Step 2: Update new-view path**

Set `lastSentView` AFTER `batch.upsert`, then set `batchHasFullView` via `messagesCount`. Do NOT set `batchHasFullView = true` before the upsert — `messagesCount` is the single source of truth:

```typescript
// New view started
if (viewId !== lastSentView?.view.id) {
  viewUpdatesSinceCheckpoint = 0
  batch.upsert(serverRumEvent, viewId)
  // lastSentView set AFTER upsert: if upsert triggers a sync flush, the subscriber
  // captures the old lastSentView as batchBase (what the backend actually received),
  // not the new view that hasn't been sent yet.
  lastSentView = serverRumEvent
  // If upsert triggered an after-add flush (e.g. messages_limit), the VIEW was sent
  // and the batch is now empty — messagesCount == 0. Otherwise the VIEW is in the batch.
  batchHasFullView = batch.flushController.messagesCount > 0
  return
}
```

- [ ] **Step 3: Update checkpoint path**

`lastSentView` is already set in the "Intermediate update" block before this branch. Only `batchHasFullView` needs updating — same `messagesCount` pattern, no initial `true` assignment:

```typescript
// Checkpoint: periodically send a full VIEW for backend reliability.
viewUpdatesSinceCheckpoint += 1
if (viewUpdatesSinceCheckpoint >= PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL) {
  viewUpdatesSinceCheckpoint = 0
  batch.upsert(serverRumEvent, viewId)
  batchHasFullView = batch.flushController.messagesCount > 0
  return
}
```

- [ ] **Step 4: Typecheck**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/browser-rum-core/src/transport/startRumBatch.ts
git commit -m "♻️ Use flushController.messagesCount to detect sync-flush eviction"
```

---

### Task 3: Update `createMockBatch` in the spec

The mock batch needs to simulate `messagesCount` so the router's post-upsert check works correctly in tests. The real batch increments `messagesCount` in `notifyBeforeAddMessage` (new keys only) and resets on flush.

**Files:**

- Modify: `packages/browser-rum-core/src/transport/startRumBatch.spec.ts`

- [ ] **Step 1: Restore `FlushController`/`FlushEvent` imports, remove `BatchFlushEvent`**

```typescript
import { ExperimentalFeature, Observable, addExperimentalFeatures } from '@datadog/browser-core'
import { resetExperimentalFeatures } from '@datadog/browser-core/src/tools/experimentalFeatures'
import type { FlushController, FlushEvent } from '@datadog/browser-core/src/transport/flushController'
import { registerCleanupTask } from '@datadog/browser-core/test'
```

- [ ] **Step 2: Rewrite `createMockBatch`**

The mock `upsert` increments `messagesCount` for new keys (matching real batch behavior where `notifyBeforeAddMessage` only fires for new keys). `flush()` resets `messagesCount` and fires `flushObservable` with a standard `FlushEvent`.

```typescript
function createMockBatch() {
  const flushObservable = new Observable<FlushEvent>()
  let messagesCount = 0
  const upsertedKeys = new Set<string>()

  const addSpy = jasmine.createSpy<(message: object) => void>('add')
  const upsertSpy = jasmine.createSpy<(message: object, key: string) => void>('upsert')

  const batch = {
    flushController: {
      flushObservable,
      get messagesCount() {
        return messagesCount
      },
    } as unknown as FlushController,
    add: addSpy,
    upsert: (message: object, key: string) => {
      // Simulate notifyBeforeAddMessage: only new keys increment the count
      if (!upsertedKeys.has(key)) {
        messagesCount++
        upsertedKeys.add(key)
      }
      upsertSpy(message, key)
    },
  }

  return {
    batch,
    addSpy,
    upsertSpy,
    flush: () => {
      messagesCount = 0
      upsertedKeys.clear()
      flushObservable.notify({ reason: 'bytes_limit', bytesCount: 0, messagesCount: 0 })
    },
  }
}
```

- [ ] **Step 3: Update `flush()` calls — remove `upsertedKeys` args**

All `flush(['view-1'])` calls (with or without trailing comments) go back to plain `flush()`. One command covers all cases:

```bash
sed -i '' 's/flush(\["view-1"\])/flush()/g' \
  packages/browser-rum-core/src/transport/startRumBatch.spec.ts
```

Verify no `flush(["view-1"])` remain:

```bash
grep "flush(\[" packages/browser-rum-core/src/transport/startRumBatch.spec.ts
```

Expected: no output.

- [ ] **Step 4: Run unit tests**

Run: `yarn test:unit --spec packages/browser-rum-core/src/transport/startRumBatch.spec.ts`
Expected: 19/19 passing

- [ ] **Step 5: Run formatter**

Run: `yarn format`
Expected: `All matched files use Prettier code style!`

If not: `yarn prettier --write packages/browser-rum-core/src/transport/startRumBatch.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/browser-rum-core/src/transport/startRumBatch.spec.ts
git commit -m "♻️ Update spec mock to simulate messagesCount; revert BatchFlushEvent"
```

---

### Task 4: Final verification

- [ ] **Step 1: Full typecheck**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 2: Full unit tests**

Run: `yarn test:unit`
Expected: all passing

- [ ] **Step 3: Check for any remaining BatchFlushEvent or flushObservable references on Batch**

```bash
grep -rn "BatchFlushEvent\|batch\.flushObservable" packages/ test/
```

Expected: no output

- [ ] **Step 4: Push**

```bash
git push origin adlrb/partial-view
```
