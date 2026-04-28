# Action Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full action tracking for the v8 RUM module: auto click actions with page activity detection, click chains, frustration detection, manual actions, DOM-based action naming, and event counts per action and per view.

**Architecture:** New collectors (click, DOM mutation) publish to the pipeline. A network request start signal is added to existing core collectors. The action processor subscribes to pipeline events, manages click chains and page activity, detects frustration, and publishes `observation:action`. The view processor gains event counts by subscribing to observation types.

**Tech Stack:** TypeScript, DOM APIs (pointerdown/up, MutationObserver), Jasmine/Karma tests.

---

## Prerequisites

- Design doc: `docs/plans/2026-04-22-action-tracking-design.md`
- Test command: `yarn test:unit --spec <path>`
- All new files go under `packages/browser-rum-next/src/actions/` unless noted otherwise

---

### Task 1: Add action pipeline event types

**Files:**
- Modify: `packages/core-next/src/domain/pipeline/events.ts`

Add to `SdkEventMap`:

```typescript
'action:click': unknown
'action:add_action': unknown
'action:start_action': unknown
'action:stop_action': unknown
'signal:network_request_start': unknown
'resource:dom_mutation': unknown
'observation:action': unknown
```

**Commit:** `🏷️ Add action tracking pipeline event types`

---

### Task 2: Add signal:network_request_start to core collectors

**Files:**
- Modify: `packages/browser-sdk/src/collectors/fetchCollector.ts`
- Modify: `packages/browser-sdk/src/collectors/xhrCollector.ts`
- Modify: `packages/browser-sdk/src/collectors/fetchCollector.spec.ts`
- Modify: `packages/browser-sdk/src/collectors/xhrCollector.spec.ts`

In `fetchCollector.ts`, add `pipeline.publish('signal:network_request_start', { url, method })` before the `originalFetch.apply()` call (but after the intake URL check — don't signal for intake requests).

In `xhrCollector.ts`, add the same publish in the `send()` override, before `originalSend.apply()`.

**Tests:** Verify that `signal:network_request_start` is published for each request. One test per collector.

**Commit:** `✨ Add signal:network_request_start to fetch and XHR collectors`

---

### Task 3: Implement action naming

**Files:**
- Create: `packages/browser-rum-next/src/actions/getActionName.ts`
- Create: `packages/browser-rum-next/src/actions/getActionName.spec.ts`

Pure function. No pipeline dependency. Takes a DOM element, returns `{ name: string, nameSource: string }`.

Hierarchical strategy:
1. Walk up DOM for `data-dd-action-name` attribute → source: `custom_attribute`
2. Priority strategies (up to 10 parents):
   - input with labels → label text (source: `text_content`)
   - input type button/submit/reset → value (source: `standard_attribute`)
   - button, label, role="button" → textual content (source: `text_content`)
   - aria-label (source: `standard_attribute`)
   - aria-labelledby → joined text (source: `standard_attribute`)
   - alt, name, title, placeholder (source: `standard_attribute`)
   - select → first option text (source: `standard_attribute`)
3. Fallback: element innerText/textContent (source: `text_content`)
4. Final: empty string (source: `blank`)

Post-processing: normalize whitespace (collapse to single spaces, trim), truncate to 100 chars with `[...]`.

**Tests:**
- Returns data-dd-action-name when present
- Walks up DOM for data-dd-action-name
- Returns button text content
- Returns input label text
- Returns input value for submit buttons
- Returns aria-label
- Returns fallback text content
- Returns empty string when no name found
- Truncates to 100 chars
- Normalizes whitespace

**Commit:** `✨ Add DOM-based action naming`

---

### Task 4: Implement click collector

**Files:**
- Create: `packages/browser-rum-next/src/actions/clickCollector.ts`
- Create: `packages/browser-rum-next/src/actions/clickCollector.spec.ts`

Listens to `pointerdown` and `pointerup`. On pointerdown, captures name and target info. On pointerup, publishes `action:click`.

```typescript
function startClickCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  let pendingPointerDown: { name, nameSource, targetSelector, targetWidth, targetHeight, startTime, startDate } | undefined

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Element
    if (!target) return
    const { name, nameSource } = getActionName(target)
    pendingPointerDown = {
      name, nameSource,
      targetSelector: computeSelector(target),
      targetWidth: target.clientWidth,
      targetHeight: target.clientHeight,
      startTime: performance.now(),
      startDate: Date.now(),
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!pendingPointerDown) return
    const pd = pendingPointerDown
    pendingPointerDown = undefined
    pipeline.publish('action:click', {
      ...pd,
      positionX: event.clientX,
      positionY: event.clientY,
      pointerUpDelay: performance.now() - pd.startTime,
    })
  }

  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('pointerup', onPointerUp)

  return () => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('pointerup', onPointerUp)
  }
}
```

For `computeSelector`, use a simple implementation: `element.tagName.toLowerCase()` + id/class. Full CSS selector computation can be improved later.

**Tests:**
- Publishes action:click on pointerdown + pointerup
- Includes name from getActionName
- Includes position from pointerup event
- Includes pointerUpDelay
- Cleanup removes listeners
- Does not publish if pointerdown has no target

**Commit:** `✨ Add click collector`

---

### Task 5: Implement DOM mutation collector

**Files:**
- Create: `packages/browser-rum-next/src/actions/domMutationCollector.ts`
- Create: `packages/browser-rum-next/src/actions/domMutationCollector.spec.ts`

Creates a `MutationObserver` on `document.body` (attributes, childList, subtree). Publishes `resource:dom_mutation` for each callback.

```typescript
function startDomMutationCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}

  const observer = new MutationObserver(() => {
    pipeline.publish('resource:dom_mutation', { timestamp: performance.now() })
  })

  observer.observe(document.body || document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  })

  return () => observer.disconnect()
}
```

**Tests:**
- Returns cleanup function
- Publishes resource:dom_mutation when DOM changes (add element, modify attribute)

**Commit:** `✨ Add DOM mutation collector`

---

### Task 6: Implement page activity detector

**Files:**
- Create: `packages/browser-rum-next/src/actions/activityDetector.ts`
- Create: `packages/browser-rum-next/src/actions/activityDetector.spec.ts`

Reusable utility. Subscribes to pipeline events, reports when activity settles.

```typescript
interface ActivityResult {
  hadActivity: boolean
  endTime?: number
}

interface ActivityDetector {
  onComplete(callback: (result: ActivityResult) => void): void
  stop(): void
}

const VALIDATION_DELAY = 100
const END_DELAY = 100
const MAX_DURATION = 10_000

function createActivityDetector(pipeline: Pipeline<Record<string, unknown>>): ActivityDetector
```

**Logic:**
1. Subscribe to `signal:network_request_start` (increment pending), `resource:network_request` (decrement pending), `resource:dom_mutation` (mark activity)
2. Start a validation timer (100ms). If no activity by then → callback `{ hadActivity: false }`
3. If activity detected, wait for: pending === 0 AND no mutation for 100ms → callback `{ hadActivity: true, endTime }`
4. Max duration timer (10s) forces completion

**Tests:**
- Reports hadActivity: false when no activity within validation delay
- Reports hadActivity: true when network request occurs
- Reports hadActivity: true when DOM mutation occurs
- Waits for pending requests to complete before reporting
- Reports after max duration even if activity ongoing
- stop() unsubscribes and cancels timers

**Commit:** `✨ Add page activity detector`

---

### Task 7: Implement click chain

**Files:**
- Create: `packages/browser-rum-next/src/actions/clickChain.ts`
- Create: `packages/browser-rum-next/src/actions/clickChain.spec.ts`

Pure logic. No pipeline dependency. Manages grouping of rapid clicks.

```typescript
interface PendingClick {
  name: string
  targetSelector: string
  positionX: number
  positionY: number
  startTime: number
  startDate: number
  activity: ActivityResult
  errorCount: number
  // ... other fields from action:click
}

interface ClickChain {
  tryAppend(click: PendingClick): boolean  // returns false if click doesn't belong
  finalize(): PendingClick[]
}

const MAX_CLICK_GAP = 1000       // 1 second
const MAX_CLICK_DISTANCE = 100   // pixels

function createClickChain(firstClick: PendingClick, onFinalize: (clicks: PendingClick[]) => void): ClickChain
```

**Rules:**
- Same targetSelector
- < 1s since last click
- < 100px Euclidean distance
- 1s timer after last click triggers finalization

**Tests:**
- Groups clicks on same target within time/distance
- Rejects click on different target
- Rejects click after 1s gap
- Rejects click beyond 100px distance
- Finalizes after 1s timeout
- Returns all clicks on finalize

**Commit:** `✨ Add click chain grouping`

---

### Task 8: Implement frustration detection

**Files:**
- Create: `packages/browser-rum-next/src/actions/computeFrustration.ts`
- Create: `packages/browser-rum-next/src/actions/computeFrustration.spec.ts`

Pure function. Takes a finalized click chain, returns frustration info.

```typescript
type FrustrationType = 'rage_click' | 'dead_click' | 'error_click'

interface FrustrationResult {
  isRage: boolean
  frustrationTypes: FrustrationType[]  // per click (non-rage) or for the rage action
}

function computeFrustration(clicks: PendingClick[]): FrustrationResult
```

**Logic:**
- Rage: >= 3 clicks → `isRage: true`, frustration includes `'rage_click'`
- Dead: per click, `hadActivity === false` AND target not interactive element → `'dead_click'`
- Error: per click, `errorCount > 0` → `'error_click'`
- Rage disables dead-click detection

**Interactive elements** (excluded from dead click): input (except button types), textarea, select, label, contenteditable, canvas, anchor.

```typescript
function isInteractiveElement(targetSelector: string): boolean
```

**Tests:**
- No frustration for single click with activity
- Dead click when no activity and non-interactive target
- No dead click on interactive elements (input, button, a, etc.)
- Error click when errorCount > 0
- Rage click with >= 3 clicks
- Rage disables dead click detection
- Rage + error combination

**Commit:** `✨ Add frustration detection (rage, dead, error clicks)`

---

### Task 9: Implement action processor

**Files:**
- Create: `packages/browser-rum-next/src/actions/actionProcessor.ts`
- Create: `packages/browser-rum-next/src/actions/actionProcessor.spec.ts`

The main orchestrator. Subscribes to pipeline events, manages click lifecycles, and publishes `observation:action`.

```typescript
function startActionProcessor(pipeline: Pipeline<Record<string, unknown>>): void
```

**Click action flow:**
1. Subscribe to `action:click`
2. For each click: create activity detector, track errors/resources/longTasks during action
3. Feed click into current chain (or create new chain)
4. When chain finalizes: compute frustration, publish `observation:action`(s)

**Manual action flow:**
1. Subscribe to `action:add_action` → immediately publish `observation:action`
2. Subscribe to `action:start_action` → create tracked action, start timing
3. Subscribe to `action:stop_action` → find matching action, compute duration, publish `observation:action`

**Event counting:**
- Subscribe to `observation:error`, `observation:resource`, `observation:long_task`
- If a click action is active (between click and activity settled), increment its counts

**Tests:**
- Click action publishes observation:action after activity settles
- Click action includes loading_time (duration from click to activity end)
- Click action includes event counts (error, resource, longTask)
- Manual addAction publishes immediately
- Manual startAction/stopAction publishes with duration
- Click chain groups rapid clicks
- Frustration types appear on observation:action
- Rage click produces single observation:action

**Commit:** `✨ Add action processor with click chains and frustration`

---

### Task 10: Wire action tracking into RUM module

**Files:**
- Modify: `packages/browser-rum-next/src/processor/index.ts`

In RUM's `init()`:
1. Start click collector
2. Start DOM mutation collector
3. Start action processor
4. Register transport route: `transport.route('observation:action', 'rum')`
5. Add cleanup for collectors in `__stop()`

**Tests:**
- observation:action is routed to rum track
- Click collector starts on init

**Commit:** `🔌 Wire action tracking into RUM module init`

---

### Task 11: Add view event counts

**Files:**
- Modify: `packages/browser-rum-next/src/views/processor.ts`
- Modify: `packages/browser-rum-next/src/views/processor.spec.ts`
- Modify: `packages/browser-rum-next/src/views/types.ts`

Add `eventCounts` to `ViewObservation`:

```typescript
eventCounts?: {
  actionCount: number
  errorCount: number
  resourceCount: number
  longTaskCount: number
  frustrationCount: number
}
```

The view processor subscribes to `observation:action`, `observation:error`, `observation:resource`, `observation:long_task`. On each, increment the counter on `currentView` and publish update.

For `frustrationCount`, check if `observation:action` has frustration types.

**Tests:**
- View counts actions
- View counts errors
- View counts resources
- View counts long tasks
- View counts frustrations
- Counts reset on new view

**Commit:** `✨ Add event counts to view observations`

---

### Task 12: Update RUM public API bridge

**Files:**
- Modify: `packages/browser-rum-next/src/index.ts`

Add to `datadogRum`:
- `addAction(name, context?)` → publishes `action:add_action` (already exists as stub, wire it)
- `startAction(name, options?)` → publishes `action:start_action`
- `stopAction(name?, options?)` → publishes `action:stop_action`

**Tests:**
- addAction publishes action:add_action
- startAction publishes action:start_action
- stopAction publishes action:stop_action

**Commit:** `✨ Add action methods to RUM public API bridge`

---

### Task 13: Add integration test

**Files:**
- Modify: `packages/browser-sdk/src/integration/rum.spec.ts`

Add tests:
- Manual addAction sends observation:action to RUM endpoint
- observation:action includes type 'custom' for manual actions

**Commit:** `✅ Add action tracking integration tests`

---

## Task dependency graph

```
Task 1 (event types) ───────────────────────────────────────┐
Task 2 (network start signal) ──────────────────────────────┤
Task 3 (action naming) ────────────────┐                    │
Task 4 (click collector) ◄─────────────┘                    │
Task 5 (DOM mutation collector) ────────────────────────────┤
Task 6 (activity detector) ◄───────────────────────────────┤
Task 7 (click chain) ──────────────────────────────────────┤
Task 8 (frustration) ──────────────────────────────────────┤
                                                            │
Task 9 (action processor) ◄─────────────────────────────────┘
  depends on: 4, 5, 6, 7, 8
  └─ Task 10 (wire into RUM) 
       └─ Task 11 (view event counts)
            └─ Task 12 (public API bridge)
                 └─ Task 13 (integration test)
```

Tasks 1-8 are mostly independent (3→4 is the only hard dependency). Task 9 depends on all of them. Tasks 10-13 are sequential.

## Verification

After all tasks:
```
yarn test:unit --spec packages/browser-rum-next/src/actions/getActionName.spec.ts --spec packages/browser-rum-next/src/actions/clickCollector.spec.ts --spec packages/browser-rum-next/src/actions/domMutationCollector.spec.ts --spec packages/browser-rum-next/src/actions/activityDetector.spec.ts --spec packages/browser-rum-next/src/actions/clickChain.spec.ts --spec packages/browser-rum-next/src/actions/computeFrustration.spec.ts --spec packages/browser-rum-next/src/actions/actionProcessor.spec.ts --spec packages/browser-rum-next/src/views/processor.spec.ts --spec packages/browser-rum-next/src/processor/index.spec.ts --spec packages/browser-sdk/src/integration/rum.spec.ts --spec packages/browser-sdk/src/collectors/fetchCollector.spec.ts --spec packages/browser-sdk/src/collectors/xhrCollector.spec.ts
```
