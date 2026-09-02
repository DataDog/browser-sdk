# PoC: RUM internal API ("thin layer")

Crash-test the interface proposed in [`rum-thin-layer.ts`](./rum-thin-layer.ts) by implementing it and
using it in real consumers. Goal: discover gaps early and cheaply, before betting the RUM
architecture on it.

The PoC lives on a throwaway branch. It does not need to match current behavior byte-for-byte: where
adapting an existing spec is expensive, let it fail and record why in this plan's debrief (that
failing is information).

## Non-goals

- No production rollout decision (that's the debrief's output).
- No performance work, no telemetry migration, no transport/batch changes (transport stays as-is,
  plugged on `notifications`).
- No Replay migration (Replay's needs informed the interface; Profiling covers the subproduct
  use-case well enough).
- No alternative-SDK PoC (Node, service worker...).

## Step 0 — apply the interface adjustments found during exploration

Encode in `rum-thin-layer.ts`:

1. **Views are sent incrementally.** Today each `VIEW_UPDATED` produces a new assembled+sent view
   event with an incremented `_dd.document_version` (backend keeps the latest). So `update()` for
   views deep-merges **and emits `event_collected` with a new document version** (document version
   owned by the internal API). `stop()` sends the final version (`view.is_active: false`).
2. **`event_started` and `event_collected` carry an `EventBaggage`** (startClocks, domainContext,
   originalError...): consumers (ex: Profiling) can build histories from notifications alone.
3. **`startEvent` accepts only a generic `name`** (+ view service/version) as start-time info:
   Profiling looks up vital names for _ongoing_ vitals via `findEvents`, so the name must land in
   the history at start. Other type-specific base fields (click target/position, resource url) stay
   with the caller until `stop()` — lesson applied from `eventTracker.ts`: "useful" start-time
   context APIs get weird fast. Revisit only if the PoC shows a real need.
4. **`findEvents` semantics for un-ended events**: an event with no end matches `endedAfter: t` for
   any t (i.e. `startedBefore: t, endedAfter: t` = "active at t"). Ideally Profiling drops its
   `vitalHistory`/`longTaskHistory`/`actionHistory` entirely in favor of `findEvents`.

## Phase 1 — implement the interface — DONE

Implemented in `packages/browser-rum-core/src/domain/internalApi/rumInternalApi.ts` (no unit
tests, per Benoit's decision — the later phases are the crash test). `yarn typecheck` and `eslint`
pass. Findings from the implementation:

- `addEvent` gained `name` and `duration` options (draft updated): `duration` is needed for the
  history end time (Profiling queries long task durations), `name` for history queries.
- `stop()` gained an `endClocks` option (draft updated): click actions end when page activity
  ends, views end at explicit clocks — not when `stop()` happens to be called.
- The session manager is a required option, provided as a `SessionManager` or a promise (draft
  updated): the promise shape is what `startSessionManager()` returns (created after tracking
  consent is granted, resolving `undefined` when no storage is available). Assemblies are buffered
  until it resolves; an `undefined` resolution holds them forever, mirroring the current
  behavior where RUM does not start. `attachSessionManager()` was dropped. `stop()` added for
  cleanup (unsubscribe session observables, clear history).
- Buffering defers the whole assembly (closures run when the session manager promise resolves), not
  just the notification: hooks registered between collection and resolution still apply to
  buffered events.
- The history is a small self-managed array, not a `ValueHistory`: `findEvents` needs
  started/ended bounds filtering over all entries, which `ValueHistory` can't enumerate. Expiry
  pruning matches `ValueHistory`'s (SESSION_TIME_OUT_DELAY).
- `createHook.trigger` never returns SKIPPED (consumed per-callback inside trigger), so the
  assemble pipeline only checks DISCARDED.
- Not done yet (deferred): rate limit reach is not surfaced to customers (today it reports an
  error event); `ddtags` are not added (configuration out of scope); error formatter free
  functions (deferred to phase 4, where a consumer needs them).
- Handle does not expose the event id: consumers that need it (ex: trackViews port will need the
  view id for viewHistory-like queries) must capture it from `event_started`. If that proves
  awkward in phase 3, the handle should grow an `id` getter.
- `BaseRumEvent` is now a discriminated union of minimal kickoff fields per event type (views
  carry none; actions need `action.type`, errors `error.message`/`error.source`, resources
  `resource.url`/`resource.type`, long tasks `long_task.duration`, vitals `vital.name`/
  `vital.type`). Kickoff objects intersect `Context` so extra raw event fields merge freely. This
  buys compile-time guarantees, kept in `rumInternalApi.test-d.ts` (compile-time assertions;
  invisible to the unit test runner): `update` is not available on non-view handles, non-view
  `stop()` requires the kickoff fields (also validated at runtime), `addEvent` rejects views and
  incomplete events. `EventHandle` split into `ViewEventHandle` / `NonViewEventHandle<T>`, and
  `startEvent` exposed through 4 overloads (the generic `EventHandle<T>` form broke signature
  assignability with conditional types).
- BaseRumEvent also carries the hierarchy fields: view members need `view.url` (required — it is a
  schema-required field on view events) and `view.name`, plus optional `service`/`version`. The
  internal API applies `view: { id, name, url }` (+ service/version) to all child events.
- `StartEventOptions` is now derived from `BaseRumEvent` (no duplicate field definitions): views
  must start complete (hierarchy fields required), non-view events start as partials
  (`PartialBaseRumEvent<T>`, renamed from EventMerge) because their kickoff may not be known at
  start (ex: `resource.type` is computed from stop options). The same event shape flows through
  startEvent/update/stop. Consequence: kickoff completeness for non-view events is no longer
  enforceable at the type level at stop (it can arrive at either call) — runtime validation only.
  History names are derived per type from the kickoff fields (view.name, vital.name,
  resource.url, action.target.name) instead of a generic `name` option.
- `StartEventOptions` renamed `IncompleteBaseRumEvent` = a partial BaseRumEvent for ALL types
  (not just startable ones: one-shot error / long task entries are incomplete until their assembly
  runs, ex while the session manager promise has not resolved). Views must start complete
  (overload-typed).
- `RumEventHistoryEntry` is now
  `{ complete: true; event: AssembledRumEvent; baggage } | { complete: false; event: IncompleteBaseRumEvent; baggage }`:
  entries reference the event itself instead of duplicating fields. Consequences:
  - Event ids are owned by the internal API, stamped uniformly at startEvent()/addEvent() time
    on each type's id field (view.id, action.id, error.id, resource.id, long_task.id, vital.id;
    caller-provided ones are overwritten — resource.id included, which resourceCollection
    generates today). Replay reads the current view id off incomplete entries, Profiling reads
    long task ids before their assembly runs.
  - The incomplete entry references the LIVE draft — no sync code needed (the old name/url sync
    and the per-type history label derivation are gone; consumers read kickoff fields off the
    event, ex `vital.name`).
  - Entries flip to complete at the final assembly (stop() for started events, one-shot addEvent),
    including discarded ones (DISCARDED from hooks, rate limited, beforeSend) so history queries
    never leave events in a limbo incomplete state.
  - `duration` moved into EventBaggage: history queries need the relative duration (Profiling
    computes long task windows) and the event's server duration field is lossy. The
    event_collected notification carries it through the baggage now.
  - `AssembledRumEvent` stands in for the schema-typed `RumEvent` until all contexts (session,
    user, display...) are ported to hooks.
- `addEvent` options carry `baggage?: Partial<EventBaggage>` (replacing the flat startClocks /
  duration / name / domainContext / originalError; the generic history `name` is gone).
  `startEvent` gained the same optional baggage parameter: phase 3 needs caller-controlled start
  clocks (initial view at the clock origin, BFCache views at the pageshow timestamp, click actions
  at the interaction timestamp).
- Baggage is always a named `baggage` property, never flattened/merged: history entries,
  notifications (`event_started` / `event_collected`), assemble hook params, startEvent and
  addEvent options all expose `baggage: EventBaggage` (or `Partial<EventBaggage>` on inputs).
  One shape everywhere, no spread-merge points.
- PoC simplification: the url is the view-start url; today `urlContexts` tracks per-event-start
  urls (mid-view location changes). Finer granularity can be rebuilt on top via `registerHook` if
  phase 3+ needs it. Same open question for `view.referrer` (comes from `document.referrer` for
  the first view — environment specific, so caller-provided for now).
- Events with no covering view are buffered, not dropped: as preStartRum holds calls collected
  before RUM starts, assemblies are held (session manager resolution and view starts are the
  flush triggers) until a view covers the event start time — the initial view usually starts at
  the clock origin, so it covers events collected before it was created. Events no view ever
  covers stay buffered (bounded), never sent.
- The implementation is split into focused modules: `rumInternalApi.types.ts` (public types),
  `baseRumEvent.ts` (draft event helpers), `eventHistory.ts` (history + per-event state: counts,
  document versions), `assembleRumEvent.ts` (the assembly pipeline as a free function) and
  `rumInternalApi.ts` (the orchestrator: session manager, buffering, event handles).

Original plan:

New module `packages/browser-rum-core/src/domain/internalApi/` (+ colocated spec):

- `createRumInternalApi(options)`:
  - State: active view (single, throw on double start), active actions (**set** — manual and click
    actions can overlap, `action.id` is an array in child events), open event handles, event history
    (ValueHistory), event counts per view and per action, rate limiters (error/action/vital),
    `beforeSend`.
  - `startEvent`: generate id, register in history, notify `event_started` **synchronously**, set
    active view/action.
  - `addEvent`: throw on `type: 'view'`; assemble (see pipeline below). View counters increment
    for error/action/resource; active-action counters for error/long_task/resource child events.
  - Assembly pipeline: baseRumEvent → hierarchy (view id/name via history, action ids via history,
    long-task start time correction) → hooks (`assemble`) → rate limiting → `beforeSend` →
    `notifications` (`event_collected`). DISCARDED from hooks and `beforeSend: false` drop the
    event (no notification, see rum-thin-layer.ts).
  - `registerHook`, `notifications`, `findEvents`, `findSession` per draft.
  - Buffering: events collected before the session manager resolves are held and flushed after
    (see phase 2 for who resolves it when).
- Free formatter functions (ex: turn an unknown error into a RUM error event) — extracted from
  `computeRawError` usage in `errorCollection.ts`, minus the lifecycle/log-forwarding part.

Validate: unit tests for the module itself (throws, buffering, hierarchy, counters, incremental
view versions, rate limit, beforeSend). `yarn typecheck`.

## Phase 2 — wire into `rumPublicApi` / `preStartRum`

This phase is the "maybe we can simplify this a bunch" experiment. Two options to explore:

- **(a) Status quo plumbing**: create the internal API inside `startRum`, once the session manager
  resolves. `preStartRum`'s `bufferApiCalls` keeps buffering public API calls. Low risk, but no
  simplification.
- **(b) Eager creation** (the interesting one): create the internal API in `init()` right after
  configuration validation (it needs `beforeSend`, which comes from configuration). The session
  manager is only created asynchronously after tracking consent is granted — so
  `createRumInternalApi` receives the `startSessionManager()` promise as its session manager
  option, and buffers `addEvent`/collected assemblies until it resolves, while `event_started`
  fires immediately.

  Payoff to measure: `preStartRum`'s per-call buffer shrinks to the context managers (already
  flagged for removal in a next major) and the `firstStartViewCall` special case. Most
  `bufferApiCalls.notify(...)` methods (`addTiming`, `startView`, `setViewName`, `addAction`,
  `addError`, `startResource`, ...) become direct internal API calls.

Things to figure out concretely:

- The `trackViewsManually` + `firstStartViewCall` dance: the first `startView` call before RUM start
  provides the initial view options and must not create an extra view. With throw-on-double-view,
  a pre-start `startEvent({type:'view'})` + buffered semantics interact here — document what works.
- Interplay between buffering and `event_started` firing synchronously (Replay's full snapshot on
  view start must not depend on the session manager being ready).
- The transport is the `Batch` returned by `startRumBatch`: view `event_collected` notifications
  must route through `batch.upsert(event, viewId)` (as `createBatchDispatcher` does today, incl.
  the `betaEnableViewUpdates` diff feature) so pending batches only hold the latest view version.
- Keep the `LifeCycle` for the event types not yet migrated to the internal API; the migrated types
  stop notifying their lifecycle events — see what breaks (that's the crash test).

Deliverable: notes in this plan on which option is viable and what `preStartRum` can drop.

## Phase 3 — `trackViews` and `trackClickActions` on the internal API

- `trackViews`:
  - `newView` → `startEvent({type:'view', ...})` handle; metric/timing/context updates →
    `handle.update()` (each update emits a new document version per step 0); view end → `stop()`;
    BFCache restore and session renewal → `stop()` + new `startEvent`.
  - `addTiming`, `setLoadingTime`, `setViewName`, view context setters stay in caller scope but
    write through the handle.
  - `startViewCollection`'s assembly (raw event building from ViewEvent) moves into the caller,
    feeding `update()`; the internal API owns viewHistory (findEvents) and event counts.
- `trackClickActions`:
  - Each click → `startEvent({type:'action'})`; discard → `cancel()`; stop with page-activity
    end → `stop({duration})`; rage-click chain and frustration computation unchanged (caller
    logic); the internal API computes per-action counts (replaces `eventTracker`).
  - Click start-time context (target/position/name) is kept by the caller and passed at
    `stop()` — no `eventTracker`-style side API. Watch for friction here: if it hurts, that is
    exactly the kind of evidence for revisiting `StartEventOptions`.
  - `ACTION_STARTED`/`AUTO_ACTION_COMPLETED` lifecycle events are replaced by `notifications`.
- Fix/annotate broken specs; enumerate which ones failed and why.

Validate: `yarn test:unit --spec packages/browser-rum-core/src/domain/view/*.spec.ts` (and action
specs); then the whole `browser-rum-core` suite, and record the delta.

## Phase 4 — React plugin (errors + router)

- `onRumStart` receives the `RumInternalApi` instance (keep `onInit({initConfiguration, publicApi})`
  as-is: pre-init needs the public API and `trackViewsManually` mutation).
- Errors: `addReactError` → formatter free function + `api.addEvent({baseRumEvent, startClocks,
domainContext})`. Check what `computeRawError` behavior is lost (forward-to-logs coupling) and
  note it.
- Router: `startReactRouterView` → `api.startEvent({type:'view'})` (explicitly `stop()`-ing the
  previous view handle first — throw-on-double-view makes the router contract explicit). Pre-init
  navigations are covered by phase 2 (b) buffering.
- Update `packages/browser-rum-react/test/initializeReactPlugin.ts` and run the react package specs.

## Phase 5 — Profiling

`createRumProfiler` receives the `RumInternalApi` + the things that stay out of scope
(`configuration`, `sessionManager`, `createEncoder`):

- Try to **drop `longTaskHistory` / `actionHistory` / `vitalHistory` entirely** in favor of
  `findEvents` (started/ended time-window queries). Subscribe to `event_collected` only where a
  history query can't express what's needed (ex: vitals that started but are still ongoing —
  `event_started` + `EventBaggage` should cover it). Any leftover history is a finding.
- View entries (`datadogProfiler`) → `event_started` (view); session restart → `session_renewed` /
  `session_expired`; `viewHistory.findView()` → `findEvents({ startedBefore: t, endedAfter: t })`.
- `profilingContext` → `registerHook` (replaces `hooks.assemble.register`).
- Check: `event_collected` is post-rate-limit/beforeSend. Long tasks are not rate-limited today,
  but confirm discarded long tasks can't corrupt profile references (expected: dangling ids are
  harmless).

Validate: `browser-rum` unit tests (profiling specs). Deliverable: list of any remaining gaps.

## Phase 6 — debrief

- Update `rum-thin-layer.ts` with everything learned (final interface).
- Answer the questions this PoC exists for:
  - Is the tight scope (assembly + extensibility + observability) the right call, or did consumers
    keep needing out-of-scope escapes (`sessionManager`, `configuration`)?
  - Was throw-on-misuse workable in real modules (views especially), or does it force awkward
    caller code?
  - Did `preStartRum` actually simplify (phase 2 deliverable)?
  - What's missing before betting automatic instrumentation (resources, errors, vitals,
    long tasks...) and Replay on it?
- Recommend: iterate the interface, or rethink.

## Guardrails

- PoC branch `benoit.zugmeyer/poc-rum-internal-api`, branch from main, commit conventions as usual
  (docs/DEVELOPMENT.md).
- Never edit auto-generated files.
- `yarn typecheck` after each phase; `yarn test:unit` for touched packages; no E2E requirement,
  optional manual sandbox check (`yarn dev`) at phase 3.
- Keep each phase in separate commits so the debrief can point at concrete diffs.
