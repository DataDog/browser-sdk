# PoC: RUM internal API ("thin layer")

Crash-test the interface proposed in [`rum-thin-layer.ts`](./rum-thin-layer.ts) by implementing it and
using it in real consumers. Goal: discover gaps early and cheaply, before betting the RUM
architecture on it.

The PoC lives on a throwaway branch. It does not need to match current behavior byte-for-byte: where
adapting an existing spec is expensive, let it fail and record why in this plan's debrief (that
failing is information).

## Non-goals

* No production rollout decision (that's the debrief's output).
* No performance work, no telemetry migration, no transport/batch changes (transport stays as-is,
  plugged on `notifications`).
* No Replay migration (Replay's needs informed the interface; Profiling covers the subproduct
  use-case well enough).
* No alternative-SDK PoC (Node, service worker...).

## Step 0 — apply the interface adjustments found during exploration

Encode in `rum-thin-layer.ts`:

1. **Views are sent incrementally.** Today each `VIEW_UPDATED` produces a new assembled+sent view
   event with an incremented `_dd.document_version` (backend keeps the latest). So `update()` for
   views deep-merges **and emits `event_collected` with a new document version** (document version
   owned by the internal API). `stop()` sends the final version (`view.is_active: false`).
2. **`event_started` and `event_collected` carry an `EventBaggage`** (startClocks, domainContext,
   originalError...): consumers (ex: Profiling) can build histories from notifications alone.
3. **`startEvent` accepts only a generic `name`** (+ view service/version) as start-time info:
   Profiling looks up vital names for *ongoing* vitals via `findEvents`, so the name must land in
   the history at start. Other type-specific base fields (click target/position, resource url) stay
   with the caller until `stop()` — lesson applied from `eventTracker.ts`: "useful" start-time
   context APIs get weird fast. Revisit only if the PoC shows a real need.
4. **`findEvents` semantics for un-ended events**: an event with no end matches `endedAfter: t` for
   any t (i.e. `startedBefore: t, endedAfter: t` = "active at t"). Ideally Profiling drops its
   `vitalHistory`/`longTaskHistory`/`actionHistory` entirely in favor of `findEvents`.

## Phase 1 — implement the interface

New module `packages/browser-rum-core/src/domain/internalApi/` (+ colocated spec):

* `createRumInternalApi(options)`:
  * State: active view (single, throw on double start), active actions (**set** — manual and click
    actions can overlap, `action.id` is an array in child events), open event handles, event history
    (ValueHistory), event counts per view and per action, rate limiters (error/action/vital),
    `beforeSend`.
  * `startEvent`: generate id, register in history, notify `event_started` **synchronously**, set
    active view/action.
  * `addEvent`: throw on `type: 'view'`; assemble (see pipeline below). View counters increment
    for error/action/resource; active-action counters for error/long_task/resource child events.
  * Assembly pipeline: baseRumEvent → hierarchy (view id/name via history, action ids via history,
    long-task start time correction) → hooks (`assemble`) → rate limiting → `beforeSend` →
    `notifications` (`event_collected`). DISCARDED from hooks and `beforeSend: false` drop the
    event (no notification, see rum-thin-layer.ts).
  * `registerHook`, `notifications`, `findEvents`, `findSession` per draft.
  * Buffering: events collected before the session manager resolves are held and flushed after
    (see phase 2 for who resolves it when).
* Free formatter functions (ex: turn an unknown error into a RUM error event) — extracted from
  `computeRawError` usage in `errorCollection.ts`, minus the lifecycle/log-forwarding part.

Validate: unit tests for the module itself (throws, buffering, hierarchy, counters, incremental
view versions, rate limit, beforeSend). `yarn typecheck`.

## Phase 2 — wire into `rumPublicApi` / `preStartRum`

This phase is the "maybe we can simplify this a bunch" experiment. Two options to explore:

* **(a) Status quo plumbing**: create the internal API inside `startRum`, once the session manager
  resolves. `preStartRum`'s `bufferApiCalls` keeps buffering public API calls. Low risk, but no
  simplification.
* **(b) Eager creation** (the interesting one): create the internal API in `init()` right after
  configuration validation (it needs `beforeSend`, which comes from configuration). The session
  manager is only created asynchronously after tracking consent is granted — so `createRumInternalApi`
  gets the session manager attached later (e.g. `attachSessionManager()`, or accept a promise).
  The internal API buffers `addEvent`/collected events until then, while `event_started` fires
  immediately.

  Payoff to measure: `preStartRum`'s per-call buffer shrinks to the context managers (already
  flagged for removal in a next major) and the `firstStartViewCall` special case. Most
  `bufferApiCalls.notify(...)` methods (`addTiming`, `startView`, `setViewName`, `addAction`,
  `addError`, `startResource`, ...) become direct internal API calls.

Things to figure out concretely:

* The `trackViewsManually` + `firstStartViewCall` dance: the first `startView` call before RUM start
  provides the initial view options and must not create an extra view. With throw-on-double-view,
  a pre-start `startEvent({type:'view'})` + buffered semantics interact here — document what works.
* Interplay between buffering and `event_started` firing synchronously (Replay's full snapshot on
  view start must not depend on the session manager being ready).
* The transport is the `Batch` returned by `startRumBatch`: view `event_collected` notifications
  must route through `batch.upsert(event, viewId)` (as `createBatchDispatcher` does today, incl.
  the `betaEnableViewUpdates` diff feature) so pending batches only hold the latest view version.
* Keep the `LifeCycle` for the event types not yet migrated to the internal API; the migrated types
  stop notifying their lifecycle events — see what breaks (that's the crash test).

Deliverable: notes in this plan on which option is viable and what `preStartRum` can drop.

## Phase 3 — `trackViews` and `trackClickActions` on the internal API

* `trackViews`:
  * `newView` → `startEvent({type:'view', ...})` handle; metric/timing/context updates →
    `handle.update()` (each update emits a new document version per step 0); view end → `stop()`;
    BFCache restore and session renewal → `stop()` + new `startEvent`.
  * `addTiming`, `setLoadingTime`, `setViewName`, view context setters stay in caller scope but
    write through the handle.
  * `startViewCollection`'s assembly (raw event building from ViewEvent) moves into the caller,
    feeding `update()`; the internal API owns viewHistory (findEvents) and event counts.
* `trackClickActions`:
  * Each click → `startEvent({type:'action'})`; discard → `cancel()`; stop with page-activity
    end → `stop({duration})`; rage-click chain and frustration computation unchanged (caller
    logic); the internal API computes per-action counts (replaces `eventTracker`).
  * Click start-time context (target/position/name) is kept by the caller and passed at
    `stop()` — no `eventTracker`-style side API. Watch for friction here: if it hurts, that is
    exactly the kind of evidence for revisiting `StartEventOptions`.
  * `ACTION_STARTED`/`AUTO_ACTION_COMPLETED` lifecycle events are replaced by `notifications`.
* Fix/annotate broken specs; enumerate which ones failed and why.

Validate: `yarn test:unit --spec packages/browser-rum-core/src/domain/view/*.spec.ts` (and action
specs); then the whole `browser-rum-core` suite, and record the delta.

## Phase 4 — React plugin (errors + router)

* `onRumStart` receives the `RumInternalApi` instance (keep `onInit({initConfiguration, publicApi})`
  as-is: pre-init needs the public API and `trackViewsManually` mutation).
* Errors: `addReactError` → formatter free function + `api.addEvent({baseRumEvent, startClocks,
  domainContext})`. Check what `computeRawError` behavior is lost (forward-to-logs coupling) and
  note it.
* Router: `startReactRouterView` → `api.startEvent({type:'view'})` (explicitly `stop()`-ing the
  previous view handle first — throw-on-double-view makes the router contract explicit). Pre-init
  navigations are covered by phase 2 (b) buffering.
* Update `packages/browser-rum-react/test/initializeReactPlugin.ts` and run the react package specs.

## Phase 5 — Profiling

`createRumProfiler` receives the `RumInternalApi` + the things that stay out of scope
(`configuration`, `sessionManager`, `createEncoder`):

* Try to **drop `longTaskHistory` / `actionHistory` / `vitalHistory` entirely** in favor of
  `findEvents` (started/ended time-window queries). Subscribe to `event_collected` only where a
  history query can't express what's needed (ex: vitals that started but are still ongoing —
  `event_started` + `EventBaggage` should cover it). Any leftover history is a finding.
* View entries (`datadogProfiler`) → `event_started` (view); session restart → `session_renewed` /
  `session_expired`; `viewHistory.findView()` → `findEvents({ startedBefore: t, endedAfter: t })`.
* `profilingContext` → `registerHook` (replaces `hooks.assemble.register`).
* Check: `event_collected` is post-rate-limit/beforeSend. Long tasks are not rate-limited today,
  but confirm discarded long tasks can't corrupt profile references (expected: dangling ids are
  harmless).

Validate: `browser-rum` unit tests (profiling specs). Deliverable: list of any remaining gaps.

## Phase 6 — debrief

* Update `rum-thin-layer.ts` with everything learned (final interface).
* Answer the questions this PoC exists for:
  * Is the tight scope (assembly + extensibility + observability) the right call, or did consumers
    keep needing out-of-scope escapes (`sessionManager`, `configuration`)?
  * Was throw-on-misuse workable in real modules (views especially), or does it force awkward
    caller code?
  * Did `preStartRum` actually simplify (phase 2 deliverable)?
  * What's missing before betting automatic instrumentation (resources, errors, vitals,
    long tasks...) and Replay on it?
* Recommend: iterate the interface, or rethink.

## Guardrails

* PoC branch `benoit.zugmeyer/poc-rum-internal-api`, branch from main, commit conventions as usual
  (docs/DEVELOPMENT.md).
* Never edit auto-generated files.
* `yarn typecheck` after each phase; `yarn test:unit` for touched packages; no E2E requirement,
  optional manual sandbox check (`yarn dev`) at phase 3.
* Keep each phase in separate commits so the debrief can point at concrete diffs.
