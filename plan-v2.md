# plan-v2 — internal API v2: pre-init support, draft view, never-stop views

Follow-up to the PoC debrief (plan.md phase 6, `rum-internal-api-poc-debrief.md`). This is a plan,
not a commitment: the shape below was worked out in the debrief discussion; the starred open
questions (*) should go to the team before implementation starts.

## Origin — what the discussion settled

The PoC kept pre-init public API support (calls made before `init()`) by replaying buffered
_calls_ at init — the `preStartRum` mechanism, rebuilt as a thin generic wrapper on the public
API. Two problems with that:

- two buffering layers (public API calls + internal API assemblies), with a subtle split;
- replay-at-init executes calls at replay time (lossy timestamps), and `preStartRum`'s
  `firstStartViewCall` dance is still with us in spirit.

v2 moves pre-init support **into the internal API**, and buffers **events** (event drafts and
event mutations), not arbitrary calls. Along the way, views get a simpler lifecycle.

### Decisions (settled in discussion)

1. **Eager creation + deferred configuration.** The internal API is created immediately (at
   `makeRumPublicApi` time); the validated configuration (`beforeSend`, rate limits, the session
   manager promise) is bound by a `configure()` step at init. Events collected before configure
   are held, exactly like events collected before the session manager resolves today. If
   configure never happens, nothing is ever assembled — RUM does not start.
2. **Draft view.** `internalApi.currentView` exists from creation: a pre-assigned id, an
   entry in the event history starting at `clocksOrigin`, accepting `update()` immediately — but
   no `event_started` and no assembly until it is started (promoted). Early `setViewName`,
   `setViewContext`, `addTiming`, `setViewLoadingTime` land on it and buffer for free.
3. **First view always starts at origin.** No matter when the promoting call happens (pre-init or
   `t=5s`), the first view's start clocks are `clocksOrigin`. Pre-init child events link to the
   draft's view id.
4. **Promotion kickoff wins.** Buffered draft updates are merged first, the promoting
   `startView` kickoff over them — the same precedence as main's `startView({name})` today.
5. **Views never stop.** Only start and update. Starting a view while one is active
   **supersedes**: the previous view's activity window closes at the new view's start, and the
   internal API assembles its final version (`is_active: false`, `time_spent` derived from the
   activity bounds). Consequences:
   - the stop-previous boilerplate disappears from every view consumer (trackViews, router
     plugins, Shopify);
   - the double-view misuse class disappears (the PoC's first real bug was exactly it);
   - `stop()` leaves the view handle entirely — views' final version is derivable, unlike
     actions/resources/vitals whose final data genuinely belongs to the stop call.
6. **Session expiry endings are owned by the API.** On expiry the internal API notifies
   `session_expired` synchronously (consumers may send a last fresh update during the notify),
   then stamps the current view's final version. The phase-4 ordering guarantee (final view
   version before batch flush) becomes structural: the API originates the notification and ends
   the view itself, before any consumer can flush.
7. **Uniform pre-init `startView` rule.** A `startView` before init promotes the draft as the
   initial view, in **both** automatic and manual modes (main's auto-mode behavior was "extra
   view" — calling `startView` before init in auto mode was already a misuse; deviation recorded
   in the debrief).
8. **Initial version at promotion.** The v1 recommendation (starting a view emits its initial
   version, no `update({})` dance) folds into promotion.
9. **`loading_type`.** The initial view's is always `initial_load` — fixed, no kickoff
   ambiguity. Subsequent views keep it as a kickoff field (trackViews knows ROUTE_CHANGE /
   SESSION_RENEWAL / BF_CACHE).
10. **Draft is visible in `findEvents`.** Entries exist from start by design; a never-promoted
    draft (manual mode, no `startView` ever) stays visible-but-incomplete forever — assemblies
    simply never fire.
11. **`stopSession()` before init is a no-op.** No session manager exists yet (old behavior
    replayed it and expired the fresh session — pointless). Accepted deviation, documented in
    the debrief.

### Open questions for the team (*)

- `startEvent({type:'view'})` vs a static `startView()` — converged during the discussion
  (the draft handle and static functions are the same design); the plan below keeps the
  `startEvent` shape + a `currentView` getter, the sugar is cosmetic.
- `setViewContext` replace-vs-merge semantics: draft updates use the standard deep-merge, but
  the public `setViewContext` must REPLACE the view context. Deferred as a follow-up (not a
  v2 blocker): until decided, pre-init `setViewContext` lands on the draft via the standard
  merge semantics.

## Part 1 — interface: `rum-thin-layer.ts`

Itemized changes to the current draft:

1. **Header**: bump to "PROPOSAL v2 — revised after the v2 design discussion (plan-v2.md)". Drop
   "starting a view while another is active" from the throw-on-misuse examples (supersede makes
   it unrepresentable).
2. **Creation**: `createRumInternalApi()` takes no options. New `configure(options)` member:
   `sessionManager` (same promise shape as today), `beforeSend?`, rate-limiting thresholds.
   Document the pre-configure hold (bounded, never assembled if configure never happens). The
   ORDERING GUARANTEE comment is rewritten: no longer a first-subscriber contract — the API
   itself ends views on expiry, the transport subscribes on notifications, the final version is
   upserted before anything can flush.
3. **`currentView: ViewEventHandle`** (getter): the draft before the first view start, the
   current view afterwards. Document the draft contract: id assigned at creation, history entry
   at `clocksOrigin`, `update()` accepted immediately (deep-merged, buffered as part of the
   eventual kickoff state), no `event_started`, no assembly until promotion.
4. **`startEvent` view overload**: becomes the promotion/supersede call. First call promotes the
   draft (kickoff over buffered updates, start stays origin, `event_started` fires, the initial
   version is assembled + notified with `loading_type: 'initial_load'` — absorbing the v1
   INITIAL VIEW VERSION recommendation). Later calls start a new view at the given baggage
   clocks (default now) and supersede the previous one. Views no longer need to be complete at
   start: the draft starts incomplete and the promotion kickoff must provide `view.url`
   (validated at promotion) — relax the "views must start complete" rule accordingly.
5. **`ViewEventHandle`**: `current()` + `update()` only. `stop()` and `cancel()` removed —
   endings are API-owned (supersede / expiry). Non-view handles keep `stop()`/`cancel()`
   unchanged.
6. **Expiry contract** (on the notifications doc): `session_expired` notifies synchronously;
   consumers may update the current view during the notify; when it returns, the API assembles
   the final view version and closes the activity window. `event_stopped` fires for it — "view
   end" subscribers unchanged.
7. **`addEvent` doc**: pre-configure joins pre-session as a first-class hold case.
8. Keep everything else (hooks, findEvents, history entries, `handle.current()`, baggage
   robustness note, session notifications).

## Part 2 — PoC implementation

One phase per commit, mirroring how v1 ran. Each phase: green suites + typecheck + eslint, and
record corner-cuts in plan.md.

### Phase A — internal API core (`domain/internalApi/`)

- `rumInternalApi.types.ts`: `ViewEventHandle` without stop/cancel; `configure()` signature;
  `currentView`.
- `rumInternalApi.ts`: creation/configure split; draft view state (pre-assigned id, origin
  entry, update-accepting, not started); promotion path; supersede path (close previous activity
  at new start, assemble its final version with `is_active:false` + derived `time_spent`);
  session-expiry path (notify → end-after-return).
- `eventHistory.ts`: draft entries (covering from origin for `findViewAt` linkage); activity
  close on supersede; promotion does not collide with the draft (the draft IS the first view).
- `assembleRumEvent.ts`: readiness = configured + session resolved + view coverage (draft
  started). API-owned final-version stamping for views.
- **New unit specs** — the internal API directory currently has none (big-lines coverage only,
  flagged in the debrief): the v2 state machine is subtle (draft → promoted → superseded/expired,
  expiry ordering), so add `domain/internalApi/*.spec.ts` covering the lifecycle, supersede
  boundaries (end-exclusive), expiry last-update slot, kickoff-wins merge, and the
  never-configured hold.

### Phase B — public API (`boot/rumPublicApi.ts`)

- Delete the pre-init call wrapper entirely: `PRE_INIT_CALLS_LIMIT`, `preInitCalls`, the
  `started` flag, the replay loop, the `addTelemetryDebug` import, and `assertStarted`
  (the internal API always exists now).
- `internalApi = createRumInternalApi()` eagerly in `makeRumPublicApi`; `doInit` validates then
  calls `internalApi.configure({...})` (session manager promise, `catchUserErrors`-wrapped
  `beforeSend`, rate limits).
- Route methods directly: `setViewName`/`setViewContext`/`addTiming`/`setViewLoadingTime` →
  `currentView.update(...)`; `startView` → `startEvent({type:'view'})`; `addAction`/`addError`
  etc. unchanged (they now just work pre-init). Note: `setViewContext` uses the standard merge
  semantics until the replace-vs-merge follow-up is decided.
- `!trackViewsManually` → the public API promotes the draft at init (default kickoff with the
  current location url), so the auto initial view exists even with no `startView` call. Manual
  mode: the draft stays pending until the customer calls `startView` (old "RUM doesn't start"
  behavior).
- `stopSession` pre-init → no-op (recorded deviation).
- Smoke spec (`rumPublicApiInternalApi.spec.ts`): the "buffers public API calls before init"
  test becomes "calls before init flow directly into the internal API" — same assertions
  (pre-init view/action/error all sent after init + session, linked to the origin view), no
  replay involved. Add a pre-init `setViewName` case (renames the initial view, main parity).

### Phase C — trackViews restructure (`domain/view/trackViews.ts`)

The big simplification: trackViews stops creating/owning view events and becomes a pure
metrics enricher:

- Subscribe `event_started` (views) → attach per-view metrics (common/initial/bfcache modules
  keyed off `loading_type`: `initial_load` for the promoted draft, kickoff field —
  ROUTE_CHANGE / SESSION_RENEWAL / BF_CACHE — for subsequent views); subscribe
  `event_stopped` (views) → schedule the KEEP_TRACKING_AFTER_VIEW_DELAY cleanup.
- `session_renewed` → `startEvent` a new view (supersede ends the previous — no explicit end).
- `session_expired` → one last fresh-metrics `update` during the notify (the expiry slot), no
  explicit end.
- Location change → `startEvent` (supersedes); BFCache restore → `startEvent` at the pageshow
  clocks (supersedes).
- `setViewName`/`setViewContext`/`addTiming`/`setViewLoadingTime`/`getViewContext` now target
  `currentView` — much of the current-view bookkeeping collapses (the public API can bypass
  trackViews entirely for these).
- The `activeViews` set / `stopObservable` cleanup machinery shrinks accordingly; metrics
  modules keep their private idle LifeCycle (unchanged corner-cut until collectors port).

### Phase D — trackClickActions + plugins + shopify

- `trackClickActions`: actions keep `stop()`; verify no view-stop dependency. Expected: no
  functional change.
- Router plugins (react/vue/angular/nuxt/nextjs): delete the stop-previous-then-start boilerplate
  (`currentViewHandle?.stop(undefined, {endClocks: startClocks})`) — supersede covers it with
  identical semantics (previous view closed at the new start clocks). Update
  `createFakeInternalApi` in `browser-rum-core/test` to the v2 handle shape.
- Shopify (`browser-rum-shopify`): `page_viewed` → `startEvent` (supersede handles checkout
  navigation); drop any explicit previous-view stop. `makeShopifyRumApi`: creation/configure
  split (configure after validation — same shape as the public API).

### Phase E — profiler (`browser-rum`)

- Expected low-touch: `findEvents` windows keep working (activity still closes at supersede),
  session notifications unchanged. Verify the session-expiry enrichment still sees a started
  view during its last-update slot, and the expiry test still ends the view via the API now.

### Phase F — validation sweep

- Full suites: browser-rum-core, browser-rum, the five plugin packages, browser-rum-shopify;
  typecheck; eslint.
- Re-measure the Shopify bundle (expect slightly smaller: no pre-init wrapper, smaller
  trackViews/public view glue).
- Record every corner-cut and behavior deviation in plan.md (v2 section), including:
  auto-mode pre-init `startView` = initial view (vs main's extra view), `stopSession` pre-init
  no-op, contexts still the #1 gap (untouched by this plan).

## Part 3 — debrief doc (`rum-internal-api-poc-debrief.md`)

- **Q3 ("Did preStartRum actually simplify?")**: rewrite the tail — the loud-error episode and
  the call-replay fix stay as history, then v2: pre-init support lives in the internal API, as
  buffered events (draft view updates + held assemblies), true call-time timestamps, and the
  public wrapper is deleted. Two buffers → one.
- **"What's missing before betting"**: remove the "decide pre-init behavior" item; reword the
  ordering-guarantee item as structurally resolved by v2 (API-owned view endings); keep
  contexts as the #1 item.
- **New section "v2 design directions (settled after the debrief)"**: the eleven decisions
  above, the remaining open questions (the startEvent/startView sugar; the deferred
  `setViewContext` replace-vs-merge follow-up), and what v2 removes (stop boilerplate
  ×3 consumers, double-view misuse class, phase-4 ordering footnote, `update({})` dance).
- **Follow-ups**: add the v2 spike results to reference; keep contexts / raw-error forwarding /
  collectors / Replay / spec debt items unchanged.
- **Recommendation**: unchanged (iterate) — v2 strengthens it: the interface absorbed
  pre-init support without new escape hatches.

## Non-goals (v2 does not attempt)

- Contexts / session.id stamping (still the #1 rollout blocker, separate work).
- Collectors (resources, long tasks, errors, vitals) and Replay migration.
- Tracking-consent sequencing (the promise shape already supports it; wiring unchanged).
