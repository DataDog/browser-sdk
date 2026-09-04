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
- Pre-init calls being dropped loudly (error) instead of buffered silently was rejected in the
  debrief: the old behavior (buffer calls made before init(), replay them when init succeeds,
  500-call limit) was restored on the public API — see the phase 6 follow-up commit.
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
  **Lost behavior noted, later corrected**: the old `addError` notified `RAW_ERROR_COLLECTED` on
  the LifeCycle, and this entry first claimed the logs SDK consumed it (`forwardErrorsToLogs`)
  — investigation (debrief review) showed that was wrong: `forwardErrorsToLogs` is a Logs SDK
  init option with its own error collectors, and `RAW_ERROR_COLLECTED`'s only consumer was RUM's
  own error pipeline — the exact piece the internal API replaces. No RUM→logs forwarding ever
  existed to break; the raw error rides `domainContext` for any future consumer.
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

## Phase 5 — Profiling — DONE

`createRumProfiler` receives the `RumInternalApi` first, followed by the out-of-scope
dependencies (`configuration`, `sessionManager`, `profilingContextManager`, `createEncoder`). The
profiler is now WIRED in the phase 2 public API: it starts when the session manager resolves
(`profilerApi.onRumStart` is called from `doInit`), where its sampling decision has a tracked
session to check. The old `ProfilerApi` contract (LifeCycle, hooks, viewHistory) is replaced.

- **`longTaskHistory` / `actionHistory` / `vitalHistory` are gone entirely**: the profile
  enrichment queries `findEvents` with time windows (`{ startedBefore: end, endedAfter: start }`
  — same overlap semantics as the histories' `findAll`). No leftover history, and no
  `event_collected` subscription was needed: ongoing vitals are found as incomplete entries
  (undefined duration), as the old history's started ones. `LongTaskContext` moved to
  `types.ts`; the old histories and their specs are deleted.
- Mapping notes (behavior changes recorded):
  - Long task durations come from `baggage.duration` (the relative duration) — the old history
    read the raw event payload's duration.
  - **Action labels are now `action.target.name`** from the assembled event. The old history
    stored an always-empty label to account for customers redacting names in beforeSend;
    entries carry the assembled event (post-beforeSend mutations apply to the same object), so
    reading the name is consistent with that concern. Worth confirming with the backend team
    before rollout.
  - Discarded long tasks: entries of rate-limited/dismissed events complete too, so profile
    references can point at events that were never sent — dangling ids, harmless as expected.
- View entries: `event_started` (view) during a profiler instance, and the active view at start
  (`findEvents` "active at t"). **Interface finding: `event_started` carries only the event id**,
  so consumers needing kickoff fields (the view name) must run a `findEvents` lookup — the same
  correlation problem `handle.id` / `handle.current()` addressed for click counts. The debrief
  should consider carrying the kickoff (or a reference to the history entry) in `event_started`.
- Session expiry / renewal: `session_expired` / `session_renewed` notifications. **Bug found while
  porting**: the session notification subscription lives for the profiler's lifetime —
  unsubscribing it on stop (as the per-instance cleanups do) breaks session-renewal restarts.
- `profilingContext` → `internalApi.registerHook` (same event-type gating and `_dd.profiling`
  attributes).
- The profiling transport's error reporting used to notify `RAW_ERROR_COLLECTED` (surfaced as a
  customer error event by the old pipeline); it now gets an idle LifeCycle — transport errors
  are not surfaced to customers (corner-cut: the old pipeline is inert anyway).
- Robustness note: passing a malformed `startClocks` to `addEvent` baggage creates NaN history
  bounds that match every query — the internal API does not validate baggage shapes (found via a
  spec bug; low priority, but worth a validation or a typed guard eventually).

Validation: `yarn typecheck` + eslint pass. The old 1484-line LifeCycle-based
`datadogProfiler.spec` is deleted with the architecture it tested (coverage inventory recorded:
quota integration, visibility pause/resume, buffer-full/before-unload instance rotation,
sampling and no-session cases); the remaining specs stay green untouched (quotaCheck,
transport, debug ids, view name utils), the `profilingApi.spec` was adapted, `profilingContext`
and `datadogProfiler` specs were rewritten on the internal API — profiles carry long tasks /
actions / vitals from `findEvents` (with the internal API's own ids — they are owned by it),
views from `event_started` + active-at-start with the default view name computation, session
expiry stops and renewal restarts, and user-stopped profilers stay stopped. Whole `browser-rum`
package: 674 pass, 0 fail.

Remaining gaps for the debrief:

- The long task / action / vital collectors themselves are not wired in the phase 2 public API
  (auto-instrumentation corner-cut), so in the PoC pipeline profiles carry whatever the public
  API collects manually — the enrichment code is the same either way.
- The old spec's fine-grained coverage (quota generation races, visibility transitions) would
  need porting before any rollout — the new spec covers the big lines only.

## Bonus phase — browser-rum-shopify on the internal API — DONE

`packages/browser-rum-shopify` used to be a thin wrapper around the FULL RUM public API: it
built `makeRumPublicApi(makeRecorderApi(), makeProfilerApi())` with `sdkName: 'rum-shopify'`,
wrapped `init()` to force sandbox-suited defaults (manual views, no auto-instrumentation, cookie
persistence), and let the Shopify Web Pixel bindings drive it through the public surface
(`startView` / `startAction`+`stopAction` / `addError`). The bonus phase replaces it with a
standalone, minimal SDK instantiated directly on the internal API — the crash-test the thin
layer was designed for: a real product variant with no auto-instrumentation at all.

### What it is now

- `src/entries/main.ts` defines a `DD_RUM` global whose only method is `init(config)` — the full
  `RumPublicApi` (recorder, profiler, actions, contexts, telemetry) is not part of the bundle
  anymore. `@datadog/browser-rum` is dropped from the package dependencies.
- `src/boot/makeShopifyRumApi.ts` (replacing `makeShopifyRumPublicApi.ts`) is the whole SDK glue:
  `validateAndBuildRumConfiguration` (forces `sessionPersistence: 'cookie'` — the sandboxed
  iframe shares the parent cookie jar) → `startSessionManager` → `createRumInternalApi`
  (session manager promise + `catchUserErrors`-wrapped beforeSend) → `startInternalApiBatch`
  (identity encoder) → Shopify bindings. It mirrors the phase 2 `doInit` glue, minus everything
  auto-instrumentation needs. New index exports in browser-rum-core to make this possible:
  `validateAndBuildRumConfiguration`, `startInternalApiBatch`, `BeforeSend` — the interesting
  debrief point: a minimal SDK needs ~4 exports on top of `createRumInternalApi` /
  `formatErrorEvent`.
- `src/domain/shopifyBindings.ts` builds RUM data from Shopify messages by driving the internal
  API:
  - `page_viewed` (checkout paths only, unchanged gating) → `startEvent({type:'view',
view:{url}})` with throw-on-double-view (the previous handle stops at the new view's start
    time) + an immediate `handle.update({})` for the initial view version — the react router
    plugin pattern.
  - `clicked` → a one-shot `addEvent` action (`action.type: 'click'`, element id as target
    name) — equivalent to the replaced back-to-back `startAction`/`stopAction` (zero duration).
  - `ui_extension_errored` → `formatErrorEvent` (the free formatter) + `addEvent` with the
    flattened extension context as event context, same `source: 'custom'` /
    `NonErrorPrefix.PROVIDED` semantics as the public `addError`.
- `patchSandboxedIframeApis` is unchanged (cookieStore / navigator.locks / document.hasFocus
  shims the session manager needs in the sandbox).

### Bundle size (the PoC headline)

`yarn workspace @datadog/browser-rum-shopify run build:bundle`, same repo, same config:

- before (phase 5 tree, full RUM SDK): **159,422 bytes**
- after (this phase, internal API only): **52,474 bytes** → **-67%**

### Corner-cuts (recorded for the debrief)

- The storefront path is removed: `init()` without `shopifyAnalytics` (the Theme Liquid snippet
  context) warns and does nothing. In a real rollout, storefront pages would use `datadog-rum.js`
  via Liquid, or the package keeps a second entry — out of PoC scope.
- Tracking consent assumed granted, no intake compression (identity encoder, no deflate
  worker), no input sanitization (the values come from Shopify events, not arbitrary customer
  objects) — all mirroring the phase 2 public API corner-cuts.
- Views are bare events: no view metrics machinery (`trackViews` is not started), no loading
  type, no name (the replaced implementation passed only `{url}` too — the internal API does
  not compute default view names).
- Events inherit the PoC's `session.id` gap (no session context hook in the internal API yet).
- The e2e live-store scenario (`test/e2e/scenario/shopify.scenario.ts`) is not adapted: its
  storefront assertions rely on the removed full SDK; the checkout flow assertions should hold
  (the bindings produce the same events) but could not be run against the live dev store.
- `src/domain/getSessionReplayLink.ts` is unreferenced by the package entry (pre-existing);
  kept as-is since it does not depend on the full SDK.

### Validation

- `yarn typecheck` + eslint pass.
- Shopify unit specs rewritten and green: 19/19 (bindings on a fake internal API: view
  lifecycle with handle stop/update, one-shot click actions, `formatErrorEvent` errors with
  extension context, checkout-path gating unchanged; boot glue: sandbox patches, forced
  cookie persistence, no `shopifyAnalytics` leak in the validated configuration, storefront
  no-op, double-init guard, invalid-configuration guard).
- browser-rum-core boot specs still pass (index export additions only).
- The bundle builds (see sizes above).

## Phase 6 — debrief — DONE

`rum-thin-layer.ts` is updated to its final revision (event order guarantee, initial view
version recommendation, `event_started` carrying the kickoff, baggage robustness note). The
answers below are backed by the phase commits (each phase section above points at its diff,
findings and corner-cuts).

### Consumers the interface survived

Six kinds of real consumers, all ports are net-negative in code (things deleted: preStartRum,
viewCollection, actionCollection, trackViewEventCounts, trackManualActions, the profiler's three
histories, the plugins' two-level subscriber pattern, the shopify full-SDK wrapper):

1. the public API (phase 2, buffer/pre-start replacement),
2. trackViews (3a) and trackClickActions (3b) — in place, not parallel ports,
3. the five framework plugins (4), via `onInit({internalApi})`,
4. the profiler (5) — the histories → findEvents experiment the interface was partly designed for,
5. a minimal SDK (bonus phase) — browser-rum-shopify, -67% bundle.

### Q1 — Is the tight scope (assembly + extensibility + observability) the right call?

**Yes.** `sessionManager` and `configuration` are passed _alongside_ the internal API to the
consumers that need them (profiler, shopify glue), as constructor dependencies — no consumer ever
needed to reach into internals the API doesn't own. The bonus phase quantifies the scope claim: a
minimal SDK needs `createRumInternalApi` + `formatErrorEvent` + four plumbing exports
(`validateAndBuildRumConfiguration`, `startSessionManager`, `startInternalApiBatch`, `BeforeSend`)
— none of which is internal-API surface. `findSession` covered the session reads; counts living in
the API (exposed via `handle.current()` and history entries) removed the duplicate count pass.

The scope hole the PoC exposed instead: **context assembly**. Session/user/global/view contexts
and `session.id` stamping were corner-cut (out of the draft's scope, "provided by hooks") — but
nobody registers those hooks in the PoC pipeline, so events ship **without `session.id`**. Before
any rollout, contexts must become first-class: either the internal API owns the session stamp
itself, or a contexts module ships as a default hook set with a documented registration order.
This is the biggest "missing before betting" item.

### Q2 — Was throw-on-misuse workable?

**Yes, with one production lesson.** It forced the right caller contracts: routers now stop the
previous view explicitly (`currentViewHandle?.stop(undefined, { endClocks: startClocks })` in three
consumers), clicks cancel instead of being silently discarded, one-shot `addEvent` rejects views.
And it caught real internal API bugs during the ports: the start-at-previous-end collision
(fixed by end-exclusive activity bounds + checking the double-view against the new view's start
clocks — silently killed new views before that), action counts deleted before the final assembly
snapshot, one-shot actions never closed in history.

The lesson: a throw inside caller flow (ex: trackViews' `startNewView`) fails _silently_ unless
the caller guards it — the double-view throw ate the new view with no console trace until the
frozen-clock smoke test caught it. SDK-internal callers should wrap their start sequences
(callMonitored), and the throws are only a development-time contract for them; the public
surface stays guarded by `catchUserErrors`/`callMonitored` as today.

### Q3 — Did `preStartRum` actually simplify?

**Yes, more than planned.** It was deleted outright (not shrunk): the internal API's assembly
buffering (session manager promise + view coverage) generalized the pre-start buffer to _all_
events, not just public calls. `bufferApiCalls`, the `firstStartViewCall` dance and the "is RUM
started" state machine are gone; plugin pre-init calls queue once and pre-session events buffer.

One behavior deviation was rejected after review: the PoC first made pre-init public calls error
loudly instead of silently replaying them. The old behavior is the required one and was restored
in a follow-up commit — the public API buffers calls made before `init()` (500-call limit, like
preStartRum) and replays them in call order when init succeeds; their events then land on the
internal API's own buffering until the session manager resolves. The remaining rollout decision:
tracking consent is assumed granted in the PoC — the consent→session manager sequencing must be
restored, and the internal API already supports it (the promise shape is exactly what
`onGrantedOnce` would produce).

The one _new_ fragility: subscription order on the session manager promise (phase 4) — the batch
must not flush before the final view version is upserted. Encoded as an ordering guarantee in the
final draft; consider making the transport flush on `session_expired` so the guarantee lives in
one place.

### Q4 — What's missing before betting auto-instrumentation and Replay?

Ordered by risk:

1. **Contexts** (Q1): session.id stamping, user/global/view/feature-flag/geo/display attributes.
   Everything else can be migrated piecemeal; without this the events are not RUM events.
2. **Rate-limit reach surfacing** (today an error event is reported to customers; the PoC rate
   limiters report with noop) and the profiling transport errors. (Corrected: this list first
   claimed `forwardErrorsToLogs` (RUM → logs) was broken by the internal API — wrong: it is a
   Logs SDK option, the Logs SDK collects its own errors independently of RUM, and
   `RAW_ERROR_COLLECTED`'s only consumer was RUM's own error pipeline. No RUM→logs forwarding
   exists to break.)
3. **Collectors + the old pipeline teardown**: resources (fetch/XHR), long tasks, runtime errors,
   vitals must port for auto-instrumentation; the old startRum pipeline is inert but kept
   compiling for them. Zombie lifecycle events (`VIEW_CREATED` & co) must go with it — Replay is
   their last consumer, so Replay must port first (it is the largest viewHistory/lifecycle
   consumer; the PoC's `findEvents` + notifications cover its documented needs but the migration
   itself was a non-goal).
4. **View metrics completeness**: the metrics modules currently run on a private idle LifeCycle —
   `REQUEST_STARTED/COMPLETED` never flow, so loading times rely on the load event only. The
   collectors must feed page activity again (or the metrics re-plumb onto notifications).
5. **Interface adjustments before freeze** (all encoded in the final draft):
   `event_started` carrying the kickoff event, initial view version emitted at `startEvent`,
   the session promise ordering guarantee, `beforeSend` outside `limitModification` (must be
   re-wrapped before rollout), baggage shape validation (NaN bounds match every query),
   ddtags/urlContexts granularity/`view.referrer`.
6. **Spec debt** (deliberate, recorded per phase): the old-architecture specs were deleted with
   their architecture — trackViews (smoke-level coverage now), trackClickActions, the
   1484-line profiler spec (quota races, visibility transitions), rumPublicApi. Fine-grained
   coverage must be rebuilt on the new architecture before rollout; the e2e suite is unaffected
   except the live-store shopify scenario (storefront assertions rely on the removed full-SDK
   path).

### Q5 — Iterate or rethink?

**Iterate.** The interface needed only additive adjustments through six consumer kinds (baggage,
`endClocks`, `handle.current()`, `event_updated`/`event_stopped`, `formatErrorEvent`); nothing
was reverted, no parallel implementation survived review, and each port deleted more than it
added (cumulatively: preStartRum, the collection glue, three profiler histories, the plugin
subscriber queue, the shopify full-SDK wrapper — and a -67% bundle for the minimal variant). The
crash-test found integration-grade issues (ordering, contexts, forwarding), all addressable
within the design rather than pointing at a flaw in it.

Suggested next steps, in order: (1) contexts as default hooks + session stamping, (2) rate-limit
surfacing decisions, (3) port one collector (resources — it exercises
start/stop pairs, tracing and the request/activity flow), (4) re-run the spec debt list,
(5) then Replay as the gate for deleting the old pipeline.

## Guardrails

- PoC branch `benoit.zugmeyer/poc-rum-internal-api`, branch from main, commit conventions as usual
  (docs/DEVELOPMENT.md).
- Never edit auto-generated files.
- `yarn typecheck` after each phase; `yarn test:unit` for touched packages; no E2E requirement,
  optional manual sandbox check (`yarn dev`) at phase 3.
- Keep each phase in separate commits so the debrief can point at concrete diffs.

## v2 — pre-init support in the internal API, draft view, never-stop views (plan-v2.md)

Executed per plan-v2.md (phases A–F). The internal API is created eagerly (unconfigured) and
`configure()` binds the validated configuration at init: public API calls made before `init()`
flow into it directly and buffer as events (draft view updates, held assemblies) with their true
call-time timestamps — the pre-init call wrapper from the debrief follow-up is deleted. Views:
a draft view exists from creation (id pre-assigned, history entry at the clock origin), the first
`startEvent({type:'view'})` promotes it (kickoff wins, initial version emitted, always
`initial_load`), later ones supersede the active view, and session-expiry endings are owned by
the API (notify → last-update slot → final version assembled before any consumer can flush —
the phase 4 ordering guarantee became structural).

Commits: internal API v2 core + state machine unit specs (phase A), then all consumers at once
(phases B–E, one commit: they only typecheck together — public API, trackViews restructure,
router plugins, Shopify, profiler specs).

### v2 validation

- Suites: browser-rum-core 1247 (incl. 10 new `rumInternalApi.spec.ts` state machine specs),
  browser-rum 674, react/vue/angular/nuxt/nextjs/shopify 269 — all green; typecheck + eslint.
- The new specs caught one real bug before it shipped: draft-update clones were replayed after
  promotion as later document versions (a stale snapshot became the "latest" view). Fixed by
  dropping the promoted view's held assemblies at promotion (their content is subsumed in the
  promoted base).
- Shopify bundle: 52,474 → 54,533 bytes (+4%: the draft/supersede/expiry machinery costs a bit
  more than the deleted stop boilerplate saved; still −66% vs the full-SDK wrapper).

### v2 corner-cuts / behavior deviations (recorded, by design or deferred)

- `setViewContext` on the draft uses the standard deep-merge, not the public REPLACE contract —
  the replace-vs-merge semantics stay a deferred follow-up (plan-v2.md).
- `setViewLoadingTime()` before init is dropped (metrics state does not exist yet); the old
  preStartRum replayed it.
- `stopSession()` before init is a no-op (decided in plan-v2.md).
- Pre-init `startView` promotes the draft as the initial view in automatic mode too (uniform
  rule, decided — main's behavior was "extra view").
- View context updates are no longer throttled (each assembles a view version; v1 throttled via
  the per-view context manager).
- Shopify views stay bare kickoffs: subsequent (superseded) views carry no `loading_type` — the
  minimal SDK doesn't provide one and the API only stamps `initial_load` at promotion.
- Metrics view-end times use `relativeNow()` at `event_stopped` (v1 used the exact end clocks;
  supersede/expiry both end at ~now, so loading-time windows are approximate).
- trackViews session renewal copies the previous view's name/service/version/context from the
  ended view's event — the per-view context manager is gone.
- Deferred `configure()`-time bindings unchanged from the v1 list: contexts/session.id stamping
  (the #1 gap), rate-limit surfacing, tracking-consent sequencing. (The raw-error forwarding
  item was dropped from this list after review: `forwardErrorsToLogs` is a Logs SDK option, the
  Logs SDK collects its own errors, and no RUM→logs forwarding exists to break.)

## v3 — open handles in the history, no single-view rule in the internal API (plan-v3.md)

The follow-up challenge: v2 still hardcodes "single view at a time, always a view active" in
the internal API (`currentView`, draft→promotion, supersede). The RUM model may evolve toward
multiple simultaneous views or events without any view — those futures should not require
redesigning the API. v3 moves the rule to the consumers: open handles live on history entries
(`RumEventHistoryEntry.handle`, findable via `findEvents({ open: true })`), views are plain started
events (one unified `EventHandle` family — the ViewEventHandle/NonViewEventHandle split is gone,
views regained `stop(finalEvent, { endClocks })` with API-derived finals), expiry endings are
API-owned for ALL open views, and the whole draft/promotion/supersede machine evaporated from
the core. The single-view policy is written once, in a shared `startViewSuperseding` helper
(stop the open view(s) at the new start, then startEvent) used by the public API `startView`,
trackViews automatic starts, both router plugins and the Shopify bindings.

The public API owns the policy: the initial view is started unconditionally at the clock origin
(bare kickoff: current location + `initial_load`), the current view is looked up from the
history on every mutation (`findEvents({ type: 'view', open: true })` — no cached handle: views
are started by BOTH the public API and the automatic tracking, and a cached handle went stale
after an automatic route change, dropping setViewName/context/timings on an ended view —
review finding, fixed with a regression spec), and the first `startView` ADOPTS the initial
view (update-merge: primitives overwrite, so the user's url/name/service/version win;
loading_type untouched; the config identity is applied at init when not adopted). trackViews
attaches metrics by catching up on the open views at construction (`findEvents({ open: true })`
— the initial view's `event_started` fired before its subscription) and updates them through
the views' live handles, looked up by id.

A further review pass moved the child event counts off the history entries onto the events
themselves: `view.error.count` / `view.action.count` / ... / `action.error.count` / ... are
API-owned fields seeded at start and incremented in place as children assemble (every
assembled version carries them, zeros included, as in main). Side effects: the counts maps, the
`entry.counts` field and the `EventCounts` type are deleted, the click frustration computation
reads the click's own event fields, and the "delete the action counts before / after the final
assembly" ordering hazard (a v1 bug class) is structurally gone — the counts live on the event
the final assembly clones.

A second review pass trimmed two surface items: `originalError` left the event baggage — it was
write-only (no reader in the pipeline) and every writer already carries the same raw error in
`domainContext`, which is where any future consumer needing the derived-from value will read
it; and `eventRateLimit` left `ConfigureOptions` — no caller ever passed it, so rate limiting now
uses browser-core's default (3000 events by type and by minute). Tests needing a low limit will
override a mutable constant, as SEGMENT_BYTES_LIMIT in segmentCollection.ts.

### v3 validation

- Suites: browser-rum-core 1248 (11 state-machine specs rewritten for v3), browser-rum 674,
  react 166 + vue 39 + angular 26 + nuxt 33 + nextjs 34 + shopify 19 — all green on the first
  run after the migration; typecheck + eslint clean. The smoke spec passed unchanged: behavior
  parity held without touching it.
- Shopify bundle: 54,533 → 54,126 bytes (the removed draft/supersede machinery costs a bit more
  than the added helper + entry handles; still −66% vs the full-SDK wrapper's 159,422).

### v3 corner-cuts / behavior deviations (recorded, by design or deferred)

- An ADOPTED initial view ships an extra document version (the bare origin version, then the
  named one) — the price of adopting instead of re-kicking off.
- Automatic-mode initial view url is read at API-creation time (module load), not at init time
  as in v2 — identical unless the SPA routed between SDK load and init().
- Manual mode with no `startView` ever: a bare initial view now EXISTS (url from location,
  `initial_load`, no name) — v2 kept an invisible draft and main shipped no view. Accepted
  consequence of "create the first view unconditionally".
- The Shopify SDK does NOT start an eager initial view (its checkout-only filter would
  double-track storefront pages): the first `page_viewed` starts the first view.
- The overlap guard is a telemetry debug (monitor-until 2026-10-14), not asserted in specs —
  the mockable-wrap for `addTelemetryDebug` was not done.
- trackViews metrics catch up at init: metrics are observed from init onward (loading times
  still read the navigation timings, so the initial view metrics are complete).
- The v2 corner-cuts still standing: `setViewContext` merge-not-replace, pre-init
  `setViewLoadingTime` dropped, `stopSession` pre-init no-op, unthrottled context updates,
  approximate metrics view-end times, contexts/session.id stamping (#1 gap), rate-limit
  surfacing, tracking-consent sequencing.
