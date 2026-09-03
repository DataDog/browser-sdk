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
  awkward in phase 3, the handle should grow an `id` getter. (Superseded in phase 3b: an `id`
  getter was tried and dropped in favor of `handle.current()`, which exposes the live in-memory
  state — event and counts — directly; consumers needing the id read it off the entry's event.)
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

## Phase 2 — wire into `rumPublicApi` / `preStartRum` — DONE

The experiment ended up more radical than the two options below: **`preStartRum` is deleted
outright** and `rumPublicApi` wires public API calls directly to the internal API, created eagerly
in `init()`. The internal API assembly buffering (session manager promise + view coverage)
replaces `preStartRum`'s `bufferApiCalls` entirely, and the transport plugs on `event_collected`
notifications (`startInternalApiBatch`, new: reuses `createBatchDispatcher` incl.
`betaEnableViewUpdates`, session-expire flush, event-bridge path). `startRum` and the LifeCycle
pipeline stay untouched for their own specs and later phases.

Corner-cuts (per Benoit's decision; listed in the file headers):

- Tracking consent assumed granted (the session manager starts right away, `onGrantedOnce` and
  the consent-driven `tryStartRum` dance are gone; `setTrackingConsent` still updates the state the
  session manager consults).
- Context managers (global / user / account / view, feature flags) are no-ops: the internal API
  doesn't assemble contexts yet.
- No automatic instrumentation (no collectors: resources via fetch/xhr, long tasks, runtime
  errors, vitals), no telemetry, no remote configuration, no recorder/profiler wiring, no
  session-driven view renewal. (Plugins `onRumStart` was initially cut too, then replaced in
  phase 4: the internal API is passed to plugins in `onInit` and `onRumStart` is removed.) `startView` replaces the previous
  view by `stop()`ing it at the new view start time (throw-on-double-view makes the caller
  sequence explicit). The automatic initial view starts at `clocksOrigin()` so it covers events
  collected before the session manager resolves.
- `trackEventCounts` is left broken (views no longer get counts fed by `RUM_EVENT_COLLECTED` for
  migrated events) — the internal API owns counts; noted as duplication until phase 3.
- Public API calls before `init()` now display an error and are dropped (previously buffered by
  `preStartRum` and replayed — a real behavior loss of removing the pre-start buffer, accepted).

Validation: `yarn typecheck` + eslint pass. New smoke spec
`rumPublicApiInternalApi.spec.ts` proves the big lines: public calls collected before the session
manager resolves are buffered by the internal API, assembled with view/action linkage once it
resolves, batched, and flushed on session expiration; the event-bridge path works too. All other
`browser-rum-core` specs pass (1406) except `rumPublicApi.spec.ts` (61/71 failing: buffered
pre-start semantics, context getters, `startRum` spy expectations — the old spec tests the deleted
`preStartRum` architecture).

Findings so far:

- **Views need an explicit initial assembly.** `startEvent` only registers + notifies
  `event_started`; the view event is emitted on the first `update()`/`stop()`. Today the SDK sends
  a VIEW event when the view starts, so the public API calls `update({})` right after `startEvent`,
  and phase 3's `trackViews` port must emit on its first `VIEW_UPDATED`. **Open question for the
  debrief**: should `startEvent` assemble the initial view version itself?
- The internal API buffering composes well: events collected pre-consent/pre-view simply wait,
  and `stopSession` (session expire) flushing the batch works through the same notification path —
  no pre-start special casing was needed (`firstStartViewCall` is just gone with
  `trackViewsManually` handled by the caller starting the view).
- Pre-init calls being dropped loudly (error) instead of buffered silently is arguably better
  DX than the old silent replay, but it is a behavior change to discuss in the debrief.
- `batch.upsert` for view versions works off `event.view.id`, which the internal API owns — the
  id space is unified in this architecture by construction (unlike the dual viewHistory/
  internal-API history risk flagged when views keep flowing through the old pipeline).

Original plan:

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

(Split in two, per Benoit's decision: 3a below is trackViews, 3b is trackClickActions.)

### Phase 3a — `trackViews` — DONE

Ported IN PLACE — `trackViews.ts` is the internal API port now, used by the phase 2 public API
(`startInternalApiBatch` exposes the batch's `prepareUrgentFlushObservable` for the final view
update on page unloading). It started as a side module (`trackViewsOnInternalApi.ts`) with the old
file kept for the startRum pipeline, and was consolidated per Benoit's review: two implementations
of the same feature muddy exactly what the PoC tries to prove. The old startRum view glue is
deleted with it (`viewCollection.ts` — its raw event building moved into the port,
`trackViewEventCounts.ts`, `setupViewTest.specHelper`, and the specs of the old architecture:
`trackViews.spec`, `viewCollection.spec`, `startRum.spec`, `rumPublicApi.spec`).

Differences vs the old trackViews (documented in the module header):

- Views are created with `internalApi.startEvent` and updated with `handle.update()`: the raw view
  event building from viewCollection's `processViewUpdate` moved into the port, minus what the
  internal API owns (view.id, `_dd.document_version`, event counts) and what contexts assemble
  (session, referrer, `usr`, replay_stats). Event counts come from the internal API, so
  `trackViewEventCounts` is gone and count changes no longer trigger view updates (metrics and the
  session keep-alive do).
- Session renewal / expiry come from `internalApi.notifications` instead of the LifeCycle.
  `session_expired` carries no end clocks: the port uses `clocksNow()` at notification time, as the
  startRum bridge does — noted: if callers need exact session end times, the notification should
  carry them.
- In manual mode, no initial view is created at init (the old trackViews relies on preStartRum's
  `firstStartViewCall` dance to defer its start until the first public `startView`); view methods
  before the first `startView` are dropped.
- The metrics modules get a private, mostly idle LifeCycle: `waitPageActivityEnd`'s
  REQUEST_STARTED/COMPLETED never flow (phase 2 corner-cut: no auto-instrumentation), so loading
  time relies on the load event and DOM activity only.
- The public API delegates `addTiming`, `setLoadingTime`, `setViewName`, `startView` and the view
  context methods to the port — view context is real per-view state again (it was a no-op
  corner-cut in phase 2).

Interface findings:

- **Throw-on-double-view collided with the start-at-previous-end pattern.** trackViews ends the
  previous view exactly at the new view's start; with the inclusive activity bound, the
  just-ended view still counted as active and `startEvent` threw, silently killing the new view
  (found via a smoke test running under a frozen clock). Fixes, applied to the internal API: the
  double-view check runs against the new view's start clocks (not "now"), and view / action
  activity bounds are end-exclusive — a view ended at `t` is not active at `t`, matching
  ValueHistory's `closeActive` semantics. `findEvents` keeps its inclusive query bounds.
- **Views need the initial version emitted at start** (confirms the phase 2 open question): the
  port calls `handle.update()` with the initial fields right after `startEvent`, as the old
  pipeline sends a VIEW event on creation. `startEvent` itself only registers + notifies
  `event_started`.
- Document version ownership transfers cleanly: every `update()` assembly increments it, and
  the batch `upsert` keeps only the latest version (smoke test: 3 versions assembled, one in the
  flushed body, `is_active: false`, name carried through `setViewName`).

Validation: `yarn typecheck` + eslint pass. The smoke spec (`rumPublicApiInternalApi.spec.ts`)
grew to 4 tests: pre-session buffering + hierarchy linkage, automatic initial view + incremental
updates + upsert, view replacement (old view ended, action linked to the right view), event
bridge — all pass. After the consolidation (below), the whole `browser-rum-core` suite is green:
1236 pass, 0 fail — the 61 failures of the old `rumPublicApi.spec` are gone with the
preStartRum-era architecture it tested. (`trackNavigationTimings.spec` remains a pre-existing
flake in small-bundle runs — `relativeNow()` vs a hardcoded 123 at page-load time; it passes in
the full-suite run.)

Consolidation consequences (recorded for the debrief):

- **The old startRum pipeline is inert.** It no longer produces view events, and the
  sessionContext hook discards every event it collects (it requires a view). It stays compiling
  for the collectors later phases port (resources, errors, long tasks, vitals), not as a working
  alternative.
- **Zombie lifecycle events**: `VIEW_CREATED` / `VIEW_ENDED` / `ACTION_STARTED` and the prefixed
  view events (`BEFORE_VIEW_CREATED` / `BEFORE_VIEW_UPDATED` / `AFTER_VIEW_ENDED`) have no
  producer anymore. They stay in the enum for viewHistory (its consumers: sessionContext,
  urlContexts, internalContext, webSocket collection — fed manually in their specs) and for
  browser-rum's recorder and profiler (Replay migration is a non-goal of this PoC). The view
  lifecycle payloads moved to `viewHistory.ts`.

### Phase 3b — `trackClickActions` — DONE

Ported IN PLACE — `trackClickActions.ts` is the internal API port now (consolidated from a side
module, like trackViews in 3a), wired in the public API when `trackUserInteractions` is on (sharing
the observables hoisted for trackViews). The click chain and the frustration / rage-click
computation (`clickChain`, `computeFrustration`) are unchanged caller logic. The old startRum
action glue is deleted (`actionCollection.ts`, `trackManualActions.ts` + their specs;
`ActionOptions` moved to `trackClickActions.ts`, `ActionContexts` to `internalContext.ts` — the
internal context exposes no action ids anymore).

- Each click: `startEvent` with only the kickoff (`action.type: 'click'`) and the interaction
  timestamp; the click start-time context (name, target, position, name source) is kept by the
  caller and passed at `stop()` — no `eventTracker`-style side API, as planned. The friction
  predicted for `StartEventOptions` didn't materialize: the kickoff-only start is fine because
  click context is only needed on the final event.
- Discard → `handle.cancel()` (removes the history entry, so discarded clicks stop linking child
  events, as `eventTracker.discard` does today). Stops with no activity end also cancel — the
  old `stop()`-without-time semantics map to `eventTracker.discard`.
- `ACTION_STARTED` / `AUTO_ACTION_COMPLETED` are replaced by `notifications` (`event_started`
  fires synchronously at start; `event_collected` when the final version is assembled). The
  click's stop-side values land at `stop()`, including `loading_time`, frustration types and
  `_dd.action` details.
- **Counts are solely owned by the internal API**, exposed on the events' current state and
  history entries: view / action entries carry their live child `counts` (the count object the
  internal API mutates). The click frustration computation reads them off its own handle
  (`handle.current()`) — no duplicate count pass, no history query, no id correlation (initial
  iterations re-counted from `event_collected`, then matched `findEvents` entries via an `id`
  getter; corrected per Benoit's reviews).
- **`event_updated` / `event_stopped` notifications added** (draft updated): they carry the
  assembled event and fire as soon as an update / final assembly completes, regardless of rate
  limiting and `beforeSend` (the event reached its final state even when dropped before being
  sent). **"View end" is simply `event_stopped` for view events**: the click port stops the click
  chain on it, replacing the initial iteration's "collected view event with `is_active: false`"
  detection and the old VIEW_ENDED subscription. One-shot `addEvent` events notify
  `event_stopped` too (they are born final); hook-discarded assemblies don't (no assembled
  event).
- **Two internal API bugs found while wiring the counts, fixed**:
  - Final action events lost their child counts: `stop()` deleted the action counts before
    assembling, so the final snapshot read zeros. The delete now happens after the assembly.
  - One-shot actions (ex: public `addAction`) stayed un-ended in the history, so every later
    child event linked to them forever. One-shot action entries now close at their start time
    (a zero-length window, as instantaneous actions link nothing today).
- **`handle.current()` added to the handles** (draft updated): the live in-memory state of the
  event (the entry: its event is the same object the handle mutates; after the final assembly it
  is the assembled event; views / actions carry their live child counts). Consumers reading
  their own event state — the click frustration computation (`Click.hasError`) — use it instead
  of correlating history entries (an `id` getter tried first was dropped for exactly that
  indirection: the handle owns its state, querying the history for it was suboptimal).
- The LifeCycle passed to `waitPageActivityEnd` is a private idle instance (same corner-cut as 3a:
  request events don't flow, page activity relies on DOM mutations).

Validation: two smoke tests added — a validated click (pointerdown/up + DOM activity + a child
error → action event with the target name, `loading_time`, `_dd.action` details, view linkage,
`error.count: 1` from the internal API's counts, `error_click` frustration) and a dead click
without activity (cancelled, no action event sent). After the consolidation, the whole
`browser-rum-core` suite is green (1236 pass — the old `rumPublicApi.spec` failures are gone
with the architecture it tested), and `browser-rum` passes 736 specs (its recorder / profiler
specs notify the zombie lifecycle events manually, so they are unaffected).

Original plan notes for phase 3:

- `newView` → `startEvent({type:'view', ...})` handle; metric/timing/context updates →
  `handle.update()` (each update emits a new document version per step 0); view end → `stop()`;
  BFCache restore and session renewal → `stop()` + new `startEvent`.
- `addTiming`, `setLoadingTime`, `setViewName`, view context setters stay in caller scope but
  write through the handle.
- `startViewCollection`'s assembly (raw event building from ViewEvent) moves into the caller,
  feeding `update()`; the internal API owns viewHistory (findEvents) and event counts.
- Fix/annotate broken specs; enumerate which ones failed and why.

Validate: `yarn test:unit --spec packages/browser-rum-core/src/domain/view/*.spec.ts` (and action
specs); then the whole `browser-rum-core` suite, and record the delta.

## Phase 4 — React plugin (errors + router) — DONE

Wired as planned (and extended to all the framework plugins for compile compatibility — see
below):

- **`onInit` receives `{ initConfiguration, publicApi, internalApi }`, and `onRumStart` is
  REMOVED** (per Benoit's review, superseding the initial wiring): there is no separate "RUM
  start" moment anymore — the public API creates the internal API as soon as `init()` is called
  (before configuration validation, so plugin `initConfiguration` mutations like
  `trackViewsManually` still apply), and hands it to plugins right there. Its session manager
  option is a deferred promise, resolved with the session manager value once validation passed
  and the session manager started; events collected by plugins in the meantime (ex: a router
  view at plugin init) are buffered by the internal API. `beforeSend` is wrapped with
  `catchUserErrors` at creation, mirroring what validation does. Finding while wiring this: the
  deferred must resolve with the session manager **value** (not the promise — adoption adds
  microtask hops that reorder consumers), and the batch must subscribe its session flush on the
  same deferred promise as the internal API — otherwise the internal API attaches its session
  observables after the batch subscribed its flush, and a session expiry flushes the batch
  before the final view version is upserted. Subscription order between consumers of the same
  resolution is a real interface concern; worth an explicit guarantee (ex: documented order, or
  the flush listening on a notification instead of the raw observable) in the debrief.
- **`formatErrorEvent` free formatter added** (`domain/internalApi/errorFormatter.ts`, exported
  from the package): the deferred phase 1 item. It runs browser-core's `computeRawError` and
  formats the raw error as the error base event (kickoff + raw fields), returning the raw error so
  callers build the baggage. Used by the public API's `addError` and every plugin. Found missing
  while porting: `component_stack` was dropped from the formatting — errors would have lost their
  framework component stacks.
- Errors: `addReactError` (and `addVueError` / `addAngularError` / `reportNuxtError` /
  `addNextjsError` — all five framework plugins got the same mechanical change, forced by the
  `onInit`-receives-internalApi update) collect via `internalApi.addEvent` with the formatter + framework
  context, carrying `originalError` and `handlingStack` in the baggage.
  **Lost behavior noted**: the old `addError` notified `RAW_ERROR_COLLECTED` on the LifeCycle,
  which the logs SDK consumes (`forwardErrorsToLogs`) — errors collected through the internal API
  don't, so the RUM→logs forwarding is broken for them. The debrief must decide where raw-error
  forwarding lives (a hook? a notification?).
- Router: `startReactRouterView` / `startTanStackRouterView` start views with
  `internalApi.startEvent({type:'view', view: {url, name}})`, explicitly `stop()`-ing the previous
  handle at the new view's start time (throw-on-double-view makes the router contract explicit)
  and emitting the initial version with `update({})` (phase 3a finding). With `onRumStart` gone,
  the plugins' two-level subscriber pattern collapsed: router views and errors subscribe to the
  plugin's single `onRumInit` queue and receive the internal API as an argument — pre-init calls
  queue, pre-session ones are covered by the internal API buffering. The vue / angular / nuxt /
  nextjs routers keep using `publicApi.startView` (still functional — it delegates to
  trackViews/internalApi): react was the phase target, the others are compile compatibility.
- `browser-rum-core` now exports the internal API types (`RumInternalApi`, handles, baggage,
  `BaseRumEvent`, `AddEventOptions`, options), and a `createFakeInternalApi` test helper records
  view names + spy handles. All `initialize*Plugin` test helpers take an `internalApi`. The e2e
  plugin scenario was adapted (raw events go through `internalApi.addEvent`; the view-through-
  addEvent case now throws and is swallowed by the scenario).

Validation: all plugin suites green — react 166, vue 39, angular 26, nuxt 33, nextjs 34 —
plus `browser-rum-core` 1236. Two spec assertions needed fixing to the formatter's actual output
(the `Provided "..."` prefix for non-Error values). The react specs now also assert the explicit
router contract: the previous view handle is stopped when a new view starts.

Original plan:

- `onRumStart` receives the `RumInternalApi` instance (keep `onInit({initConfiguration, publicApi})`
  as-is: pre-init needs the public API and `trackViewsManually` mutation). (Superseded: the
  internal API is now passed to `onInit` and `onRumStart` is removed — see above.)
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
