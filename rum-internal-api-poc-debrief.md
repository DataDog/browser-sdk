# PoC debrief — RUM internal API ("thin layer")

**TL;DR: We crash-tested a proposed RUM internal API by building it and migrating six kinds of
real consumers onto it. Every migration removed more code than it added, a minimal-SDK variant
built on it is 66% smaller, and the interface held its tight scope throughout — pre-init support
included, absorbed as buffered events rather than replayed calls. We recommend iterating on the
design: the remaining issues are integration-grade (contexts, collectors), not design
flaws.**

- Branch: `benoit.zugmeyer/rum-internal-api` (throwaway PoC branch, not meant for production as-is)
- The proposed interface: [`rum-thin-layer.ts`](./rum-thin-layer.ts) (final revision)
- The pre-init / view-lifecycle redesign plan: [`plan-v2.md`](./plan-v2.md)
- The open-handles / no-single-view-rule redesign plan: [`plan-v3.md`](./plan-v3.md)
- Full phase-by-phase journal with all findings and corner-cuts: [`plan.md`](./plan.md)
- Each phase is a separate commit, so every claim below points at a diff (list at the end)

## What this was about

Today, RUM event assembly is spread across the public API, `preStartRum`, the LifeCycle pipeline
and the collectors: event hierarchy (`view.id` linkage, document versions, event counts) and
sending are everyone's concern. The proposal is a small **internal API** ("thin layer") with a
tight scope — **event assembly, extensibility (hooks), observability (notifications + queries)** —
that everything else (public API, collectors, Replay, Profiling, product variants) drives instead:

- the API is created eagerly (unconfigured); `configure()` binds the validated configuration
  (session manager promise, `beforeSend`) at init — rate limiting is internal, driven by a
  default constant, not a configuration option,
- `startEvent` / `addEvent` / handles build events respecting the hierarchy; the internal API
  owns event ids, counts and document versions,
- open event handles live **on the history entries** (`findEvents({ open: true })`), the API
  encodes no "single view at a time" rule — the view-tracking policy is written once in a
  consumer helper (`startViewSuperseding`), and only session-expiry endings are owned by the
  API (all open views are ended),
- `registerHook` extends assembly; `notifications` (one observable) exposes the event lifecycle;
  `findEvents` queries the event history by time window,
- pre-init support falls out of this shape: calls made before `init()` flow into the API
  directly and buffer **as events** (the initial view's updates, held assemblies) with their
  true call-time timestamps — nothing is replayed.

The PoC's purpose was to find gaps early and cheaply: implement the interface, port real consumers
to it, and let the migrations (not new specs) be the test.

## What we did

| Phase                     | Consumer migrated                | What it proved / deleted                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| implement                 | the internal API itself          | Assembly + buffering + history in ~5 focused modules; throw-on-misuse, discriminated-union kickoff types; one unified handle family with live handles on history entries and API-owned expiry endings                                                                                                                                              |
| public API                | `rumPublicApi`                   | `preStartRum` **deleted outright**: no per-call buffer, no `firstStartViewCall` dance, no "is RUM started" state machine. `configure()` at init; transport plugs on `event_collected`                                                                                                                                                              |
| views                     | `trackViews` (in place)          | viewCollection / trackViewEventCounts / the startRum view glue deleted. **trackViews stopped owning view events entirely** — it is a pure metrics enricher (per-view metrics attached on `event_started`, cleanup on `event_stopped`, automatic view starts via `startEvent`)                                                                      |
| clicks                    | `trackClickActions` (in place)   | actionCollection / trackManualActions deleted. Frustration reads the click's own event count fields — no duplicate count pass                                                                                                                                                                                                                      |
| plugins                   | react/vue/angular/nuxt/nextjs    | `onRumStart` deleted; plugins get `internalApi` in `onInit`. Errors via a new `formatErrorEvent` free formatter. Routers start views through the API — the stop-previous boilerplate and the initial `update({})` dance are gone (the shared supersede helper + API-emitted initial version cover them)                                            |
| profiling                 | the RUM profiler                 | **Its three histories (longTask/action/vital) are gone entirely**, replaced by `findEvents` time-window queries — the experiment the interface was partly designed for                                                                                                                                                                             |
| pre-init & view lifecycle | the internal API + its consumers | Pre-init support absorbed **into the internal API**: eager creation, held assemblies. The public-API call buffer (the instinctive rebuild of `preStartRum`) was deleted in favor of buffering events — more concrete, true timestamps, and the `firstStartViewCall` problem stays dead. The single-view rule also moved out of the API (see below) |
| Shopify (bonus)           | `browser-rum-shopify`            | The full RUM SDK removed from the bundle: a standalone minimal SDK (~init + Shopify bindings) built directly on the internal API                                                                                                                                                                                                                   |

Everything runs green where it applies: `yarn typecheck`, eslint, and the unit suites of every
touched package (browser-rum-core 1248 — including 11 unit specs pinning the handle/stop/
expiry state machine, browser-rum 674, react 166 + vue 39 + angular 26 + nuxt 33 + nextjs 34 +
shopify 19), plus a
smoke spec covering the big lines of the new pipeline.

## Headline results

- **`preStartRum` deleted**, not shrunk — and pre-init support ended up **inside the internal
  API**: the public API creates the instance eagerly and binds the configuration with
  `configure()` at init; calls made before init buffer as events (the initial view's updates,
  held assemblies) with their true call-time timestamps. Two-buffer designs and call replay are
  gone.
- **The API encodes no "single view at a time" rule.** Views are plain started events with a
  live handle on their history entry; consumers stop them explicitly — the supersede policy
  (stop the open view at the new view's start, end pinned) is written once, in the shared
  `startViewSuperseding` helper used by the public API, trackViews, both router plugins and
  Shopify. The API still derives the final view fields (`is_active: false`, `time_spent`) at
  assembly and owns the session-expiry endings (all open views, after a last-update slot).
  Consequences: the stop-previous boilerplate did not come back (the helper is one call), the
  handle types unified (`ViewEventHandle`/`NonViewEventHandle` are one `EventHandle` family),
  and multi-view is representable — a possible future model instead of a redesign.
- **The public API owns the policy.** The initial view is started unconditionally at the clock
  origin (bare kickoff: current location + `initial_load`), the current view is looked up from
  the history on every mutation (`findEvents({ type: 'view', open: true })` — no cached handle:
  views are started by both the public API and the automatic tracking, and a cached handle went
  stale after an automatic route change — a review finding, fixed with a regression spec), and
  the first `startView` adopts the initial view (update-merge: the user's kickoff wins over the
  bare origin kickoff). trackViews attaches metrics by catching up
  on the open views at init (`findEvents({ open: true })`) — the history is the source of truth,
  notifications are live updates.
- **The transport-flush ordering became structural.** The final view version must be upserted
  before the batch flushes on session expiry; since the API originates the expiry notification
  and ends the view itself (after giving consumers a synchronous last-update slot), no
  subscription-order contract is needed anymore — it is a property of the code.
- **The profiler's three event histories deleted**, replaced by time-window `findEvents` queries —
  the observability scope carried its weight.
- **Counting is owned in one place**: child event counts live directly on the event
  (`view.error.count`, `action.error.count`, ... — API-owned fields seeded at start,
  incremented in place as children assemble), so the live event and every assembled version
  carry them; the click port reads them instead of re-counting collected events.
- **Minimal SDK quantified**: `browser-rum-shopify` went from a wrapper around the full RUM SDK to
  a standalone SDK on the internal API — bundle 159,422 → **54,533 bytes (−66%)**. The glue it
  needed: `createRumInternalApi` + `formatErrorEvent` + 4 plumbing exports (validate
  configuration, start session manager, start transport batch).
- Every port was done **in place** (no parallel implementations survived review), and each deleted
  more than it added.

## The debrief — answers

### Is the tight scope (assembly + extensibility + observability) the right call?

**Yes.** Consumers that needed `sessionManager` or `configuration` (profiler, Shopify glue,
trackViews metrics) received them as constructor dependencies, never as internal-API surface. No
consumer had to bypass the API — including the pre-init redesign, which absorbed `preStartRum`'s
whole job without growing escape hatches (it grew `configure()`, and it _shrank_ the view handle
surface). The scope hole the PoC exposed instead is **context assembly**: contexts were cut from
the PoC pipeline, so events currently ship **without `session.id`** — the biggest item to fix
before anything else (contexts as default hooks with a documented registration order, or the API
owns the session stamp).

### Was throw-on-misuse workable?

**Yes — and it earned its keep, with two lessons.** It forced explicit caller contracts
(discarded clicks cancel; non-view events validate their kickoff fields at stop) and it caught
real bugs during the ports: the double-view check running against the wrong clocks, action
counts deleted before the final assembly snapshot, one-shot actions never closed in history,
and stale draft-update clones replaying after promotion as "latest" view versions (caught by
the state-machine unit specs). The two lessons:

- a throw inside caller flow fails _silently_ — the double-view throw ate new views until a
  frozen-clock smoke test caught it. SDK-internal callers must guard their start sequences
  (`callMonitored`); the public surface stays guarded as today.
- when a misuse class is structural (a caller forgetting to stop the previous view), the better
  fix is to make it unrepresentable or cheap to get right — the shared supersede helper is that
  fix for view hand-over: consumers stop the previous view through one call, and the double-view
  misuse became a telemetry debug rather than a silent throw (overlap is a possible future
  model, not necessarily a misuse).

### Did `preStartRum` actually simplify?

**Yes — it died, and its job moved somewhere better.** The "is RUM started" state machine,
per-call buffering and the `firstStartViewCall` dance are gone. The design discussion tested
three shapes for pre-init support: loud errors (best DX for misuse, but a behavior break),
replaying buffered calls on the public API (faithful to the old behavior, but calls are a
concrete-less buffering unit — and replay executes them at replay time, losing timestamps),
and buffering events in the internal API (the winner): the initial view (started eagerly at
the clock origin) absorbs early view mutations, early child events are held assemblies with
true call-time timestamps, and
`configure()` is the single "RUM actually starts" moment. The remaining rollout decision:
tracking consent is assumed granted in the PoC — the session-manager-promise shape already
supports the real consent sequencing.

### What's missing before betting auto-instrumentation and Replay on it?

Ordered by risk:

1. **Contexts** — session/user/global/view/feature-flag/geo/display attributes. Without
   `session.id` these are not RUM events. Biggest blocker.
2. **Collectors + old pipeline teardown** — resources, long tasks, runtime errors, vitals must
   port for auto-instrumentation. The old startRum pipeline is kept compiling but inert; deleting
   it requires porting **Replay first** (it is the last consumer of the zombie lifecycle events
   and viewHistory).
3. **View metrics completeness** — the metrics modules run on a private idle LifeCycle, so
   loading times don't see request activity until the collectors feed it again.
4. **Interface hardening before freeze**: `beforeSend` re-wrapped in `limitModification`;
   baggage shape validation (malformed clocks create NaN history bounds that match every
   `findEvents` query); `ddtags` / urlContexts granularity / `view.referrer`; rate-limit reach
   and transport-error surfacing (both no-op in the PoC — wiring details, not interface surface:
   the limit itself is a default constant, overridable in tests as a mutable one). (Two earlier
   findings were already folded in: `event_started` carries the kickoff event — no `findEvents`
   correlation — and the initial view version is emitted at view start.)
5. **Spec debt** (deliberate, inventoried per phase) — old-architecture specs were deleted with
   their architecture: trackViews, trackClickActions, the 1484-line profiler spec, rumPublicApi.
   Fine-grained coverage must be rebuilt on the new architecture before rollout. The internal API
   itself now has state-machine unit coverage; the consumers are smoke-level.

## Settled design decisions (the ones the discussion had to make)

1. **Eager creation + deferred configuration** — `configure()` binds the validated
   configuration at init; events collected before are held, like events before the session
   manager resolves.
2. **One handle family, live handles in the history** — every started event gets an
   `EventHandle { current, update, stop(finalEvent, { endClocks }) }` (the former
   view/non-view split is gone), and the handle is exposed on its history entry while the event
   is open (`findEvents({ open: true })`). The history is the source of truth; notifications are
   live updates — late subscribers catch up by querying (trackViews attaches metrics to the
   initial view at init that way).
3. **No single-view rule in the API** — views are plain started events; consumers stop them
   explicitly. The supersede policy (stop the open view(s) at the new view's start,
   end-exclusive) is written once, in the shared `startViewSuperseding` helper. Starting a view
   while another is open logs a telemetry debug (no throw: overlap is a possible future model,
   not necessarily a misuse).
4. **The public API owns the policy** — the initial view is started unconditionally at the
   clock origin (bare kickoff: current location + `initial_load`, so the first view always
   covers early child events), the current view is looked up from the history on every mutation
   (no cached handle — a cached one went stale after an automatic route change, a review
   finding), and the first `startView` ADOPTS the initial view (update-merge: the user's kickoff
   wins over the bare origin kickoff, main's `startView({name})` precedence; loading_type
   untouched). Later calls supersede. Deviation accepted: an adopted initial view ships an extra
   document version, and a manual-mode session with no `startView` ever still has a bare
   initial view.
5. **The API derives view finals** — `is_active: false` and `time_spent` are computed at
   assembly from the activity bounds when the stop payload doesn't provide them; only views get
   this (their endings are derivable — non-view final data genuinely belongs to the stop call).
6. **API-owned expiry endings** — notify `session_expired` (synchronous last-update slot),
   then end ALL open views and assemble their final versions before any consumer can react; the
   transport's expiry flush subscribes after and cannot race it.
7. **`loading_type`** is the caller's — `initial_load` on the eager initial view (public API),
   ROUTE_CHANGE / SESSION_RENEWAL / BF_CACHE on subsequent kickoffs (view tracking); the API
   stamps nothing.
8. **The view-coverage assembly gate stays** (child events assemble once a started view covers
   their start) — a consumer-guaranteed invariant today, and the single relaxation point if a
   no-view model materializes.
9. **`stopSession()` before init is a no-op** (accepted deviation).

Open questions left to the team: the `startEvent({type:'view'})` vs static `startView()` sugar
(cosmetic — both shapes converged to the same design), and `setViewContext` replace-vs-merge
semantics (view contexts currently deep-merge; the public contract is a REPLACE).

## Recommendation

**Iterate the interface; don't rethink it.** Across six consumer kinds it needed only additive
changes, nothing was reverted, each port was net-negative in code — and the pre-init redesign
_absorbed_ a whole subsystem (`preStartRum`), then the view-rule redesign deleted the API's
draft/promotion/supersede machine while unifying its handle types. The found issues are
addressable within the design. Suggested next steps, in order:

1. **Contexts as default hooks + session stamping** (the rollout blocker).
2. **Port one collector** — resources are the best exercise (start/stop pairs, tracing, request /
   page-activity flow).
3. **Rebuild the spec debt list** on the new architecture.
4. **Replay as the final gate** — its migration is what allows deleting the old pipeline and the
   zombie lifecycle events.

## Follow-ups (tracked items)

- [ ] Decide context strategy: default hook set vs internal API owning the session stamp; define
      hook registration order.
- [ ] Wire rate-limit reach and transport-error surfacing (implementation details, not interface
      surface — the limit is a default constant).
- [ ] Re-wrap `beforeSend` in `limitModification`; add baggage shape validation.
- [ ] Restore tracking consent sequencing (pre-init buffering already lives in the internal API).
- [ ] Decide the view API sugar (`startEvent({type:'view'})` vs static `startView()`) — cosmetic.
- [ ] Decide `setViewContext` replace-vs-merge semantics (view contexts currently deep-merge).
- [ ] Port collectors (resources first), then vitals / long tasks / runtime errors.
- [ ] Port Replay; delete the old startRum pipeline and the zombie lifecycle events.
- [ ] Rebuild fine-grained spec coverage (views, clicks, profiler quota/visibility, public API).
- [ ] Adapt the Shopify live-store e2e scenario (storefront path currently removed in the PoC
      variant); confirm profiler action labels with the backend (assembled-event names vs the
      always-empty labels stored today).
- [ ] Re-measure bundle size for the full SDK once auto-instrumentation is ported (the −66% is for
      the minimal Shopify variant).

A correction from review, for the record: an earlier revision of the "what's missing" list
claimed `forwardErrorsToLogs` (RUM → logs) was broken on internal-API paths. That was wrong —
`forwardErrorsToLogs` is a Logs SDK init option, the Logs SDK collects its own errors
independently of RUM, and RUM's `RAW_ERROR_COLLECTED` notification only ever fed RUM's own
error event creation, the piece the internal API replaces. RUM never fed Logs, so there was
nothing to break; the raw error rides `domainContext` for any future consumer.

## Appendix — where to look

All commits on the PoC branch (the middle ones are the iteration history; the last ones are the
final shape):

| Commit     | What it contains                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `893fcf04` | first implementation of the internal API                                                          |
| `d6c8211f` | public API wired to the internal API + first trackViews port                                      |
| `e0882ec3` | trackClickActions port                                                                            |
| `5f191231` | in-place replacement of the old view/action glue                                                  |
| `ca01f642` | plugins on `onInit({internalApi})`, `formatErrorEvent`, router views                              |
| `318cb5ca` | profiler on the internal API (histories → `findEvents`)                                           |
| `e0f16077` | browser-rum-shopify standalone minimal SDK                                                        |
| `7e324706` | this debrief (first version) + interface revision                                                 |
| `f4287d93` | pre-init call replay on the public API (later replaced by buffering events in the internal API)   |
| `3a24b8d5` | pre-init & view-lifecycle redesign plan (plan-v2.md)                                              |
| `ad29e2ca` | `rum-thin-layer.ts` revision (draft view, supersede, `configure()`)                               |
| `0aebf8bc` | internal API core: draft/promotion/supersede/expiry + state machine unit specs                    |
| `74c36040` | consumers on the revised API: public API, trackViews metrics enricher, plugins, Shopify, profiler |
| `e1f1ce4e` | validation results + corner-cuts recorded in plan.md                                              |
| `0bb9e947` | view-rule iteration plan (plan-v3.md: open handles, no single-view rule in the API)               |
| `fef5e759` | `rum-thin-layer.ts` final revision (open handles in history, unified EventHandle)                 |
| `51f25c12` | internal API final core: unified handles in history, plain starts, expiry ends all open views     |
| `3d0d8676` | consumers on the final API: public API owns the single-view policy, shared supersede helper       |
| `3d836cd8` | validation results + corner-cuts recorded in plan.md (this debrief reflects the final shape)      |

The final shape (last five rows, plan-v3.md): the single-view rule moved to the consumers, open
handles live in the history, and the draft/promotion/supersede machine was deleted from the API
core. The interface proposal file (`rum-thin-layer.ts`) matches it.
