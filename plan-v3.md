# Plan v3 — open handles in the history, no single-view rule in the internal API

Design iteration following the v2 implementation. Everything below was settled in discussion
(see the debrief thread); this plan records it and sequences the work.

## Why

v2 still hardcodes **"single view at a time, always a view active"** inside the internal API:
`currentView`, the draft→promotion machine, supersede, API-owned endings for _the_ current view.
The RUM model may evolve toward multiple simultaneous views (embedded webviews, popovers,
dual-pane apps) or events with no view at all. Those futures should not require redesigning the
internal API. The challenge: store open event handles in the history, let the public API create
the first view unconditionally, and let view tracking close/create views by looking them up.

The nice surprise: this shrinks the API core. The whole draft/promotion machine
(~150 lines in the orchestrator) exists only because the API owns the single-view rule — move
the rule to the consumers and it evaporates. Net API surface removed: `currentView`,
`ViewEventHandle` (as a separate type), promotion, supersede. Net consumer cost: one local
variable in `rumPublicApi` and a shared supersede helper.

## Settled decisions

1. **Handles live in the history.** `RumEventHistoryEntry.handle` is the live handle while the
   event is open, cleared on stop/cancel. The history is the source of truth; notifications are
   live updates. `FindEventsQuery` gains an `open` filter (only entries with a live handle) —
   any consumer can look up "the open view(s)", including late subscribers.
2. **One handle family.** The `ViewEventHandle` / `NonViewEventHandle` split is deleted:
   `EventHandle { current(), update(), stop(baseRumEvent?, { endClocks? }) }` for every event
   type. Views regain `stop()` — with explicit end clocks, so the superseder pins the activity end
   (end-exclusive at the new start). The API still derives view finals (`is_active: false`,
   `time_spent`) at assembly when stop didn't provide them — the only view-specific assembly
   behavior left.
3. **No `currentView`, no draft, no promotion, no supersede, no single-view rule in the API.**
   Views are events like the others: started by `startEvent`, ended by explicit `stop()` or by
   the API-owned expiry path.
4. **The public API owns the policy.** `makeRumPublicApi` creates the initial view
   unconditionally right after `createRumInternalApi()` — bare kickoff, startClocks at the clock
   origin, `initial_load`, initial version held (like every assembly) until configure + session —
   and keeps a local `currentViewHandle` variable. The single-view policy is one consumer
   variable, in the one place allowed to have it.
5. **The first `startView` adopts the eager view** via update-merge (primitives overwrite, so the
   user's kickoff still wins over the bare origin kickoff; context merges per the standing
   merge question). Later `startView` calls supersede. Deviation accepted: an adopted initial
   view ships two document versions (bare v1 at origin, named v2).
6. **One shared supersede helper** — `stop(previous, { endClocks: newStart })` + `startEvent` —
   used by the public API's manual `startView`, trackViews' automatic starts, the router
   plugins and Shopify, so the policy is written once.
7. **Query catch-up.** The initial view's `event_started` fires at creation, pre-init —
   `trackViews` subscribes later and would miss it. Instead of notification tricks, consumers
   catch up by querying: at init, find open views via `findEvents` and attach metrics. This is
   the design's real strength: state is queryable, not just event-driven.
8. **Expiry endings stay API-owned, pluralized**: notify `session_expired` synchronously
   (last-update slot during the notify), then end **all** open views and assemble their final
   versions before any consumer can react. The structural ordering guarantee survives unchanged.
9. **Misuse guard: telemetry debug, no throw.** A view starting while another is open logs
   `addTelemetryDebug` (no user-visible event; monitor-until comment). No throw: the
   silent-failure lesson, and overlapping views are a possible future model, not necessarily a
   misuse.
10. **The view-coverage assembly gate stays** (child events assemble when configured + session
    resolved + a started view covers their start). Today it is a consumer-guaranteed invariant
    (the public API creates the initial view at origin); it stays as the single deliberate
    relaxation point if a no-view model materializes.
11. **`loading_type` ownership moves to the public API** (`initial_load` on the eager initial
    view; the API stamps nothing).

## Open questions (none blocking)

- `FindEventsQuery.open` filter vs consumers filtering `entry.handle !== undefined` themselves —
  pick the query param if it reads cleanly (cosmetic).
- Naming of the shared helper (`startViewSuperseding` vs a method on the public API's internal
  module) — settle during phase B.

## Parts

1. This plan + the `rum-thin-layer.ts` v3 revision (delete `currentView`/draft/supersede
   contracts, unified `EventHandle`, entry handles, `open` filter, expiry pluralized, public-API
   ownership notes). One commit each.
2. Implementation, one commit per phase (merge where entangled, as in v2):
   - **Phase A — internal API core**: types (unified `EventHandle`, `RumEventHistoryEntry.handle`,
     `FindEventsQuery.open`, `configure()` unchanged), `eventHistory.ts` (handle storage, no
     unstarted-view tracking), `rumInternalApi.ts` (delete the draft/promotion/supersede
     machine; expiry ends all open views; telemetry debug guard). The 10 state-machine specs pin
     the draft machine — rewrite them around start/stop/expiry; keep the stale-clone regression
     coverage where it still applies.
   - **Phase B — public API + trackViews**: eager initial view + local `currentViewHandle`,
     first-`startView` adoption, the shared supersede helper, `trackViews` query catch-up,
     `createFakeInternalApi` update. These are entangled like v2's B–E; expect one commit.
   - **Phase C — plugins, routers, Shopify, profiler**: supersede via the shared helper; spec
     updates. Expect to land with phase B in the same commit.
   - **Phase D — validation sweep**: full suites of touched packages, typecheck, eslint, Shopify
     bundle re-measure; record corner-cuts and deviations in `plan.md` (v3 section); update the
     debrief doc's final story (it currently says "views never stop" and `currentView` in several
     places — it must reflect the final design, not the v2 one).
3. Non-goals (unchanged from the previous lists): the multi-view model itself (only
   representability), no-view events, contexts/session stamping, collectors, Replay, tracking
   consent.

## Validation gates (same as v2)

- `yarn typecheck` after each phase; eslint; full unit suites for touched packages.
- The smoke spec (`rumPublicApiInternalApi.spec.ts`) keeps guarding behavior parity: pre-init
  calls buffer, the initial view starts at origin, expiry flushes final versions, a second
  `startView` supersedes.
