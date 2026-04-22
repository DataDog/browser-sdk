# Move Views into browser-rum-next — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Absorb `browser-views-next` into `browser-rum-next` so views are an internal concern of the RUM module, not a standalone module.

**Architecture:** Copy all view source files into `packages/browser-rum-next/src/views/`, wire view collectors + enricher + processor into `rumProcessor.init()`, update `sdk.ts` to remove the standalone view collector bootstrapping, update the integration tests to use `rumProcessor` instead of `viewsProcessor`, then delete `browser-views-next`.

**Tech Stack:** TypeScript, Yarn workspaces, Jasmine unit tests

---

### Task 1: Create `packages/browser-rum-next/src/views/` and copy source files

**Files:**
- Create: `packages/browser-rum-next/src/views/types.ts`
- Create: `packages/browser-rum-next/src/views/initialViewCollector.ts`
- Create: `packages/browser-rum-next/src/views/initialViewCollector.spec.ts`
- Create: `packages/browser-rum-next/src/views/navigationCollector.ts`
- Create: `packages/browser-rum-next/src/views/navigationCollector.spec.ts`
- Create: `packages/browser-rum-next/src/views/navigationEnricher.ts`
- Create: `packages/browser-rum-next/src/views/navigationEnricher.spec.ts`
- Create: `packages/browser-rum-next/src/views/processor.ts`
- Create: `packages/browser-rum-next/src/views/processor.spec.ts`

**Step 1: Copy types.ts**

`packages/browser-rum-next/src/views/types.ts` — exact copy of `packages/browser-views-next/src/types.ts` (no import changes needed, all module augmentation uses `@datadog/core-next` which is a peer dep of both).

**Step 2: Copy initialViewCollector.ts**

`packages/browser-rum-next/src/views/initialViewCollector.ts` — same as source except change import:
```typescript
import type { NavigationResource } from './types'
// (was: import type { NavigationResource } from './types' — same path, no change needed)
```
The import is already `./types` relative, so it's an exact copy.

**Step 3: Copy initialViewCollector.spec.ts**

`packages/browser-rum-next/src/views/initialViewCollector.spec.ts` — change the two imports:
- `from './initialViewCollector'` → stays the same
- `from './types'` → stays the same

Exact copy, no changes.

**Step 4: Copy navigationCollector.ts**

`packages/browser-rum-next/src/views/navigationCollector.ts` — change import:
```typescript
import type { NavigationResource, ViewLoadingType } from './types'
// (was: same path — exact copy)
```

**Step 5: Copy navigationCollector.spec.ts**

Exact copy — imports are relative and unchanged.

**Step 6: Copy navigationEnricher.ts**

Exact copy — no internal imports.

**Step 7: Copy navigationEnricher.spec.ts**

Exact copy — imports are relative and unchanged.

**Step 8: Copy domain/processor.ts as views/processor.ts**

`packages/browser-rum-next/src/views/processor.ts` — change imports (the original imports from `'../types'`):
```typescript
import type { Pipeline, ContextManager } from '@datadog/core-next'
import type { ViewObservation, ViewChangedSignal } from './types'  // was '../types'
```

**Step 9: Copy domain/processor.spec.ts as views/processor.spec.ts**

`packages/browser-rum-next/src/views/processor.spec.ts` — change imports:
```typescript
import { Pipeline, ContextManager } from '@datadog/core-next'
import { startProcessor } from './processor'          // was './processor' (same dir now)
import type { ViewObservation, ViewChangedSignal } from './types'  // was '../types'
```

**Step 10: Run tests for the new files to confirm they compile and pass**

```bash
yarn test:unit --spec packages/browser-rum-next/src/views/initialViewCollector.spec.ts --spec packages/browser-rum-next/src/views/navigationCollector.spec.ts --spec packages/browser-rum-next/src/views/navigationEnricher.spec.ts --spec packages/browser-rum-next/src/views/processor.spec.ts
```

Expected: all pass.

---

### Task 2: Create `packages/browser-rum-next/src/views/collectors.ts`

**Files:**
- Create: `packages/browser-rum-next/src/views/collectors.ts`

**Step 1: Write the file**

```typescript
import type { Pipeline } from '@datadog/core-next'
import { startInitialViewCollection } from './initialViewCollector'
import { startNavigationCollection } from './navigationCollector'

function startViewCollectors(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const stopInitial = startInitialViewCollection(pipeline)
  const stopNavigation = startNavigationCollection(pipeline)
  return () => {
    stopInitial()
    stopNavigation()
  }
}

export { startViewCollectors }
```

No test needed — this is a thin combinator. The underlying collectors are already tested.

---

### Task 3: Update `browser-rum-next/src/processor/index.ts` — wire views into RUM init

**Files:**
- Modify: `packages/browser-rum-next/src/processor/index.ts`

**Step 1: Add imports**

At the top of the file, add:
```typescript
import { startViewCollectors } from '../views/collectors'
import { navigationEnricher } from '../views/navigationEnricher'
import { startProcessor as startViewProcessor } from '../views/processor'
import type { StartViewAction } from '../views/types'
```

**Step 2: Add `startView` to `RumPublicApi` interface**

```typescript
interface RumPublicApi extends Record<string, unknown> {
  startView(name?: string): void   // add this line
  addError(error: Error | string, context?: object): void
  // ... rest unchanged
}
```

**Step 3: Inside `init()`, start view collectors, register navigation enricher, and start view processor**

After the existing enricher registrations and before the `startProcessor` call:

```typescript
// Start view collectors (initial + navigation)
const stopViewCollectors = startViewCollectors(context.pipeline)

// Register navigation enricher (adds id UUID) on resource:navigation and action:start_view
context.pipeline.enrich('resource:navigation', navigationEnricher())
context.pipeline.enrich('action:start_view', navigationEnricher())

// Start view processor (resource:navigation + action:start_view → observation:view + signal:view_changed)
startViewProcessor({ pipeline: context.pipeline, globalContext, userContext, accountContext })
```

**Step 4: Add `startView` to the returned public API object**

```typescript
return {
  startView(name?: string) {
    const action: StartViewAction = {
      url: window.location.href,
      startTime: performance.now(),
      startDate: Date.now(),
      referrer: '',
      loadingType: 'route_change',
      name,
    }
    context.pipeline.publish('action:start_view', action)
  },
  addError(...) {
    // existing
  },
  // ... rest unchanged
}
```

Note: `stopViewCollectors` is captured but not returned. The pipeline module lifecycle doesn't have a stop hook. This is fine — views are started and stay active for the lifetime of the SDK instance. (If cleanup is needed it can be wired via the pipeline seal or a future stop mechanism.)

**Step 5: Run processor spec**

```bash
yarn test:unit --spec packages/browser-rum-next/src/processor/index.spec.ts
```

Expected: existing tests pass. Also add a new test for `startView` in the spec file:

```typescript
it('init returns public API with startView method', () => {
  const { pipeline, config } = createTestContext()
  const api = initModule({ pipeline, config })

  expect(typeof (api as any).startView).toBe('function')
})

it('startView publishes action:start_view to the pipeline', async () => {
  const { pipeline, config } = createTestContext()
  const actions: Record<string, unknown>[] = []
  pipeline.subscribe('action:start_view', (e) => actions.push(e as Record<string, unknown>))

  const api = initModule({ pipeline, config })
  pipeline.seal()
  ;(api as any).startView('checkout')
  await tick()

  expect(actions.length).toBe(1)
  expect(actions[0].name).toBe('checkout')
  expect(actions[0].loadingType).toBe('route_change')
})
```

---

### Task 4: Update `browser-sdk/src/domain/sdk.ts` — remove standalone view collectors

**Files:**
- Modify: `packages/browser-sdk/src/domain/sdk.ts`

**Step 1: Remove the view collector import**

Delete this line:
```typescript
import { startCollectors as startViewCollectors } from '@datadog/browser-views-next/collectors'
```

**Step 2: Remove the collector call and cleanup**

In `createSdk`:
- Remove: `const stopViewCollectors = startViewCollectors(pipeline)`
- Remove `stopViewCollectors()` from `__stop` cleanup

**Step 3: Verify sdk.ts compiles**

```bash
yarn typecheck 2>&1 | head -40
```

---

### Task 5: Update `browser-sdk/src/integration/views.spec.ts` — switch from viewsProcessor to rumProcessor

**Files:**
- Modify: `packages/browser-sdk/src/integration/views.spec.ts`

**Step 1: Replace imports**

Old:
```typescript
import { viewsProcessor } from '@datadog/browser-views-next/processor'
import { unregisterSdk } from '@datadog/core-next'
import type { ViewsPublicApi } from '@datadog/browser-views-next'
```

New:
```typescript
import { rumProcessor } from '@datadog/browser-rum-next/processor'
import type { RumPublicApi } from '@datadog/browser-rum-next/processor'
import { unregisterSdk } from '@datadog/core-next'
```

**Step 2: Replace all `createSdk` calls**

Old pattern:
```typescript
modules: [viewsProcessor],
views: {},
```

New pattern:
```typescript
modules: [rumProcessor],
rum: {},
```

**Step 3: Replace all API access**

Old pattern:
```typescript
const views = currentSdk!['views'] as ViewsPublicApi
views.startView('checkout')
views.setGlobalContext({ deployment: 'canary' })
views.setUser({ id: 'user-42', name: 'Ada' })
```

New pattern:
```typescript
const rum = currentSdk!['rum'] as RumPublicApi
rum.startView('checkout')
rum.setGlobalContext({ deployment: 'canary' })
rum.setUser({ id: 'user-42', name: 'Ada' })
```

---

### Task 6: Update `browser-sdk/src/integration/rum.spec.ts` — remove viewsProcessor

**Files:**
- Modify: `packages/browser-sdk/src/integration/rum.spec.ts`

**Step 1: Remove viewsProcessor import**

Delete:
```typescript
import { viewsProcessor } from '@datadog/browser-views-next/processor'
```

**Step 2: Remove viewsProcessor from all module arrays and configs**

Old:
```typescript
modules: [rumProcessor, viewsProcessor],
rum: {},
views: {},
```

New:
```typescript
modules: [rumProcessor],
rum: {},
```

Same for the `logsProcessor + rumProcessor + viewsProcessor` triple:
```typescript
modules: [logsProcessor, rumProcessor],
logs: { forwardErrorsToLogs: true },
rum: {},
```

---

### Task 7: Update package.json files — remove browser-views-next dependency

**Files:**
- Modify: `packages/browser-sdk/package.json`
- Modify: `packages/browser-rum-next/package.json` (verify it's not there)

**Step 1: Remove from browser-sdk/package.json**

In the `dependencies` block, remove:
```json
"@datadog/browser-views-next": "workspace:*"
```

If `dependencies` becomes empty after removal, remove the entire `dependencies` key.

**Step 2: Check browser-rum-next/package.json**

Confirm `@datadog/browser-views-next` is not listed (it currently isn't). No change needed.

---

### Task 8: Update `tsconfig.base.json` — remove browser-views-next path aliases

**Files:**
- Modify: `tsconfig.base.json`

**Step 1: Remove three path entries**

Delete:
```json
"@datadog/browser-views-next": ["./packages/browser-views-next/src"],
"@datadog/browser-views-next/collectors": ["./packages/browser-views-next/src/collectors"],
"@datadog/browser-views-next/processor": ["./packages/browser-views-next/src/processor"],
```

---

### Task 9: Run the full test suite

**Step 1: Run all affected tests**

```bash
yarn test:unit \
  --spec packages/browser-rum-next/src/views/initialViewCollector.spec.ts \
  --spec packages/browser-rum-next/src/views/navigationCollector.spec.ts \
  --spec packages/browser-rum-next/src/views/navigationEnricher.spec.ts \
  --spec packages/browser-rum-next/src/views/processor.spec.ts \
  --spec packages/browser-rum-next/src/domain/processor.spec.ts \
  --spec packages/browser-rum-next/src/processor/index.spec.ts \
  --spec packages/browser-sdk/src/integration/views.spec.ts \
  --spec packages/browser-sdk/src/integration/rum.spec.ts \
  --spec packages/browser-sdk/src/integration/logs.spec.ts
```

Expected: all pass.

**Step 2: Run typecheck**

```bash
yarn typecheck
```

Expected: no errors.

---

### Task 10: Delete `packages/browser-views-next/`

**Step 1: Delete the directory**

```bash
rm -rf packages/browser-views-next
```

**Step 2: Run yarn install to clean up workspace graph**

```bash
yarn install
```

**Step 3: Run tests again to confirm nothing broke**

```bash
yarn test:unit \
  --spec packages/browser-rum-next/src/views/initialViewCollector.spec.ts \
  --spec packages/browser-rum-next/src/views/navigationCollector.spec.ts \
  --spec packages/browser-rum-next/src/views/navigationEnricher.spec.ts \
  --spec packages/browser-rum-next/src/views/processor.spec.ts \
  --spec packages/browser-rum-next/src/processor/index.spec.ts \
  --spec packages/browser-sdk/src/integration/views.spec.ts \
  --spec packages/browser-sdk/src/integration/rum.spec.ts
```

---

### Task 11: Commit

```bash
git add packages/browser-rum-next/src/views/ \
        packages/browser-rum-next/src/processor/ \
        packages/browser-sdk/src/domain/sdk.ts \
        packages/browser-sdk/src/integration/views.spec.ts \
        packages/browser-sdk/src/integration/rum.spec.ts \
        packages/browser-sdk/package.json \
        tsconfig.base.json

git rm -r packages/browser-views-next/

git commit -m "♻️ Move views into browser-rum-next"
```
