# PoC debrief — RUM internal API ("thin layer")

**TL;DR: We crash-tested a proposed RUM internal API by building it and migrating six kinds of
real consumers onto it. Every migration removed more code than it added, a minimal-SDK variant
built on it is 66% smaller, and the interface held its tight scope throughout — pre-init support
included, absorbed as buffered events rather than replayed calls. We recommend iterating on the
design: the remaining issues are integration-grade (contexts, event forwarding), not design
flaws.**

- Branch: `benoit.zugmeyer/rum-internal-api` (throwaway PoC branch, not meant for production as-is)
- The proposed interface: [`rum-thin-layer.ts`](./rum-thin-layer.ts) (final revision)
- The pre-init / view-lifecycle redesign plan: [`plan-v2.md`](./plan-v2.md)
- Full phase-by-phase journal with all findings and corner-cuts: [`plan.md`](./plan.md)
- Each phase is a separate commit, so every claim below points at a diff (list at the end)

## What this was about

Today, RUM event assembly is spread across the public API, `preStartRum`, the LifeCycle pipeline
and the collectors: event hierarchy (`view.id` linkage, document versions, event counts) and
sending are everyone's concern. The proposal is a small **internal API** ("thin layer") with a
tight scope — **event assembly, extensibility (hooks), observability (notifications + queries)** —
that everything else (public API, collectors, Replay, Profiling, product variants) drives instead:

- the API is created eagerly (unconfigured); `configure()` binds the validated configuration
  (session manager promise, `beforeSend`, rate limits) at init,
- `startEvent` / `addEvent` / handles build events respecting the hierarchy; the internal API
  owns event ids, counts and document versions,
- the current view is exposed as a handle from creation (a **draft** before the first view
  starts), and views are never stopped by callers: starting a view **supersedes** the active
  one, and session-expiry endings are owned by the API,
- `registerHook` extends assembly; `notifications` (one observable) exposes the event lifecycle;
  `findEvents` queries the event history by time window,
- pre-init support falls out of this shape: calls made before `init()` flow into the API
  directly and buffer **as events** (draft view updates, held assemblies) with their true
  call-time timestamps — nothing is replayed.

The PoC's purpose was to find gaps early and cheaply: implement the interface, port real consumers
to it, and let the migrations (not new specs) be the test.

## What we did

| Phase                     | Consumer migrated                | What it proved / deleted                                                                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| implement                 | the internal API itself          | Assembly + buffering + history in ~5 focused modules; throw-on-misuse, discriminated-union kickoff types; the draft/promotion/supersede/expiry state machine                                                                                                                                       |
| public API                | `rumPublicApi`                   | `preStartRum` **deleted outright**: no per-call buffer, no `firstStartViewCall` dance, no "is RUM started" state machine. `configure()` at init; transport plugs on `event_collected`                                                                                                              |
| views                     | `trackViews` (in place)          | viewCollection / trackViewEventCounts / the startRum view glue deleted. **trackViews stopped owning view events entirely** — it is a pure metrics enricher (per-view metrics attached on `event_started`, cleanup on `event_stopped`, automatic view starts via `startEvent`)                      |
| clicks                    | `trackClickActions` (in place)   | actionCollection / trackManualActions deleted. Frustration reads `handle.current().counts` — no duplicate count pass                                                                                                                                                                               |
| plugins                   | react/vue/angular/nuxt/nextjs    | `onRumStart` deleted; plugins get `internalApi` in `onInit`. Errors via a new `formatErrorEvent` free formatter. Routers start views through the API — the stop-previous boilerplate and the initial `update({})` dance are gone (supersede + API-emitted initial version cover them)              |
| profiling                 | the RUM profiler                 | **Its three histories (longTask/action/vital) are gone entirely**, replaced by `findEvents` time-window queries — the experiment the interface was partly designed for                                                                                                                             |
| pre-init & view lifecycle | the internal API + its consumers | Pre-init support absorbed **into the internal API**: eager creation, draft view, held assemblies. The public-API call buffer (the instinctive rebuild of `preStartRum`) was deleted in favor of buffering events — more concrete, true timestamps, and the `firstStartViewCall` problem stays dead |
| Shopify (bonus)           | `browser-rum-shopify`            | The full RUM SDK removed from the bundle: a standalone minimal SDK (~init + Shopify bindings) built directly on the internal API                                                                                                                                                                   |

Everything runs green where it applies: `yarn typecheck`, eslint, and the unit suites of every
touched package (browser-rum-core 1247 — including 10 unit specs pinning the draft/promotion/
supersede/expiry state machine, browser-rum 674, all five plugin packages + Shopify 269), plus a
smoke spec covering the big lines of the new pipeline.

## Headline results

- **`preStartRum` deleted**, not shrunk — and pre-init support ended up **inside the internal
  API**: the public API creates the instance eagerly and binds the configuration with
  `configure()` at init; calls made before init buffer as events (draft view updates, held
  assemblies) with their true call-time timestamps. Two-buffer designs and call replay are gone.
- **Views never stop.** Starting a view supersedes the active one (the API closes its activity
  window at the new start and assembles its final version — `is_active: false`, `time_spent`
  derived), and session-expiry endings are owned by the API. Consequences: the stop-previous
  boilerplate disappeared from every view consumer (trackViews, both router plugins, Shopify),
  the double-view misuse class became unrepresentable, and view `stop()`/`cancel()` left the
  interface entirely — less surface than the original draft.
- **The transport-flush ordering became structural.** The final view version must be upserted
  before the batch flushes on session expiry; since the API originates the expiry notification
  and ends the view itself (after giving consumers a synchronous last-update slot), no
  subscription-order contract is needed anymore — it is a property of the code.
- **The profiler's three event histories deleted**, replaced by time-window `findEvents` queries —
  the observability scope carried its weight.
- **Counting is owned in one place**: view/action event counts live on history entries and
  `handle.current()`; the click port reads them instead of re-counting collected events.
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
  fix is to make it unrepresentable — that is exactly what supersede semantics do: views
  hand over implicitly, and the throw (plus its silent-failure risk) is gone.

### Did `preStartRum` actually simplify?

**Yes — it died, and its job moved somewhere better.** The "is RUM started" state machine,
per-call buffering and the `firstStartViewCall` dance are gone. The design discussion tested
three shapes for pre-init support: loud errors (best DX for misuse, but a behavior break),
replaying buffered calls on the public API (faithful to the old behavior, but calls are a
concrete-less buffering unit — and replay executes them at replay time, losing timestamps),
and buffering events in the internal API (the winner): a draft view absorbs early view
mutations, early child events are held assemblies with true call-time timestamps, and
`configure()` is the single "RUM actually starts" moment. The remaining rollout decision:
tracking consent is assumed granted in the PoC — the session-manager-promise shape already
supports the real consent sequencing.

### What's missing before betting auto-instrumentation and Replay on it?

Ordered by risk:

1. **Contexts** — session/user/global/view/feature-flag/geo/display attributes. Without
   `session.id` these are not RUM events. Biggest blocker.
2. **Raw-error forwarding** — errors collected via the internal API no longer notify
   `RAW_ERROR_COLLECTED`, so `forwardErrorsToLogs` (RUM → logs) is broken on those paths. Needs a
   decision (a `raw_error_collected` notification, or a hook). Same class of decision: rate-limit
   reach and transport-error surfacing (both no-op in the PoC).
3. **Collectors + old pipeline teardown** — resources, long tasks, runtime errors, vitals must
   port for auto-instrumentation. The old startRum pipeline is kept compiling but inert; deleting
   it requires porting **Replay first** (it is the last consumer of the zombie lifecycle events
   and viewHistory).
4. **View metrics completeness** — the metrics modules run on a private idle LifeCycle, so
   loading times don't see request activity until the collectors feed it again.
5. **Interface hardening before freeze**: `beforeSend` re-wrapped in `limitModification`;
   baggage shape validation (malformed clocks create NaN history bounds that match every
   `findEvents` query); `ddtags` / urlContexts granularity / `view.referrer`. (Two earlier
   findings were already folded in: `event_started` carries the kickoff event — no `findEvents`
   correlation — and the initial view version is emitted at view start.)
6. **Spec debt** (deliberate, inventoried per phase) — old-architecture specs were deleted with
   their architecture: trackViews, trackClickActions, the 1484-line profiler spec, rumPublicApi.
   Fine-grained coverage must be rebuilt on the new architecture before rollout. The internal API
   itself now has state-machine unit coverage; the consumers are smoke-level.

## Settled design decisions (the ones the discussion had to make)

1. **Eager creation + deferred configuration** — `configure()` binds the validated
   configuration at init; events collected before are held, like events before the session
   manager resolves.
2. **Draft view** — `currentView` exists from creation: pre-assigned id, history entry at the
   clock origin, `update()` accepted immediately, no `event_started` and no assembly until
   promotion. Early `setViewName` / view context / `addTiming` / `setViewLoadingTime` buffer for
   free.
3. **First view always starts at origin**, no matter when the promotion call happens; early
   child events link to it.
4. **Promotion kickoff wins** over buffered draft updates (main's `startView({name})`
   precedence).
5. **Supersede** — starting a view while one is active closes the previous activity window at
   the new start (end-exclusive) and assembles its final version.
6. **API-owned expiry endings** — notify `session_expired` (synchronous last-update slot), then
   assemble the final view version before any consumer can react; the transport's expiry flush
   subscribes after and cannot race it.
7. **Uniform pre-init `startView`** — promotes the draft as the initial view in both automatic
   and manual modes (main's auto-mode "extra view" was already a misuse; deviation accepted).
8. **`loading_type`** — always `initial_load` for the initial view (stamped by the API);
   subsequent views carry it in the kickoff (ROUTE_CHANGE / SESSION_RENEWAL / BF_CACHE).
9. **The draft is visible in `findEvents`** — a never-promoted draft (manual views, no
   `startView` ever) stays visible-but-incomplete forever; its held children never assemble,
   matching "RUM does not start".
10. **`stopSession()` before init is a no-op** (accepted deviation).
11. **Non-view events keep `stop()`/`cancel()`** — their final data genuinely belongs to the
    stop call (resource status codes, action loading time); only views' endings are derivable,
    which is exactly why only views lost their stop.

Open questions left to the team: the `startEvent({type:'view'})` vs static `startView()` sugar
(cosmetic — both shapes converged to the same design), and `setViewContext` replace-vs-merge
semantics (draft contexts currently deep-merge; the public contract is a REPLACE).

## Recommendation

**Iterate the interface; don't rethink it.** Across six consumer kinds it needed only additive
changes, nothing was reverted, each port was net-negative in code — and the pre-init redesign
_absorbed_ a whole subsystem (`preStartRum`) while removing API surface (view `stop()`/
`cancel()`). The found issues are addressable within the design. Suggested next steps, in order:

1. **Contexts as default hooks + session stamping** (the rollout blocker).
2. **Raw-error forwarding + rate-limit surfacing decisions** (affects product behavior).
3. **Port one collector** — resources are the best exercise (start/stop pairs, tracing, request /
   page-activity flow).
4. **Rebuild the spec debt list** on the new architecture.
5. **Replay as the final gate** — its migration is what allows deleting the old pipeline and the
   zombie lifecycle events.

## Follow-ups (tracked items)

- [ ] Decide context strategy: default hook set vs internal API owning the session stamp; define
      hook registration order.
- [ ] Decide raw-error forwarding shape (`raw_error_collected` notification vs hook); restore
      `forwardErrorsToLogs` on internal-API paths.
- [ ] Decide rate-limit reach and transport-error surfacing (currently no-op).
- [ ] Re-wrap `beforeSend` in `limitModification`; add baggage shape validation.
- [ ] Restore tracking consent sequencing (pre-init buffering already lives in the internal API).
- [ ] Decide the view API sugar (`startEvent({type:'view'})` vs static `startView()`) — cosmetic.
- [ ] Decide `setViewContext` replace-vs-merge semantics (draft contexts currently deep-merge).
- [ ] Port collectors (resources first), then vitals / long tasks / runtime errors.
- [ ] Port Replay; delete the old startRum pipeline and the zombie lifecycle events.
- [ ] Rebuild fine-grained spec coverage (views, clicks, profiler quota/visibility, public API).
- [ ] Adapt the Shopify live-store e2e scenario (storefront path currently removed in the PoC
      variant); confirm profiler action labels with the backend (assembled-event names vs the
      always-empty labels stored today).
- [ ] Re-measure bundle size for the full SDK once auto-instrumentation is ported (the −66% is for
      the minimal Shopify variant).

## Appendix — where to look

All commits on the PoC branch (the middle ones are the iteration history; the last ones are the
final shape):

| Commit     | What it contains                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `893fcf04` | first implementation of the internal API                                                            |
| `d6c8211f` | public API wired to the internal API + first trackViews port                                        |
| `e0882ec3` | trackClickActions port                                                                              |
| `5f191231` | in-place replacement of the old view/action glue                                                    |
| `ca01f642` | plugins on `onInit({internalApi})`, `formatErrorEvent`, router views                                |
| `318cb5ca` | profiler on the internal API (histories → `findEvents`)                                             |
| `e0f16077` | browser-rum-shopify standalone minimal SDK                                                          |
| `7e324706` | this debrief (first version) + interface revision                                                   |
| `f4287d93` | pre-init call replay on the public API (later replaced by buffering events in the internal API)     |
| `3a24b8d5` | pre-init & view-lifecycle redesign plan (plan-v2.md)                                                |
| `ad29e2ca` | `rum-thin-layer.ts` final revision (draft view, supersede, `configure()`)                           |
| `0aebf8bc` | internal API final core: draft/promotion/supersede/expiry + state machine unit specs                |
| `74c36040` | all consumers on the final API: public API, trackViews metrics enricher, plugins, Shopify, profiler |
| `e1f1ce4e` | validation results + corner-cuts recorded in plan.md                                                |
