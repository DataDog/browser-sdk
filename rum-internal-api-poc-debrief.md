# PoC debrief — RUM internal API ("thin layer")

**TL;DR: We crash-tested a proposed RUM internal API by building it and migrating six kinds of
real consumers onto it. Every migration removed more code than it added, a minimal-SDK variant
built on it is 67% smaller, and the interface needed only additive changes. We recommend
iterating on the design — the issues found are integration-grade (contexts, event forwarding,
ordering guarantees), not design flaws.**

- Branch: `benoit.zugmeyer/rum-internal-api` (throwaway PoC branch, not meant for production as-is)
- The proposed interface: [`rum-thin-layer.ts`](./rum-thin-layer.ts) (final revision)
- Full phase-by-phase journal with all findings and corner-cuts: [`plan.md`](./plan.md)
- Each phase is a separate commit, so every claim below points at a diff (list at the end)

## What this was about

Today, RUM event assembly is spread across the public API, `preStartRum`, the LifeCycle pipeline
and the collectors: event hierarchy (`view.id` linkage, document versions, event counts) and
sending are everyone's concern. The proposal is a small **internal API** ("thin layer") with a
tight scope — **event assembly, extensibility (hooks), observability (notifications + queries)** —
that everything else (public API, collectors, Replay, Profiling, product variants) drives instead:

- `startEvent` / `addEvent` / handles (`update`, `stop`, `cancel`, `current`) build events
  respecting the hierarchy; the internal API owns event ids, counts and document versions.
- `registerHook` extends assembly; `notifications` (one observable) exposes the event lifecycle;
  `findEvents` queries the event history by time window.
- Deliberately out of scope (passed alongside as dependencies): session manager, configuration,
  transport, telemetry, contexts.

The PoC's purpose was to find gaps early and cheaply: implement the interface, port real consumers
to it, and let the migrations (not new specs) be the test.

## What we did

| Phase           | Consumer migrated              | What it proved / deleted                                                                                                                                                                                         |
| --------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — implement   | the internal API itself        | Assembly + buffering + history in ~5 focused modules; throw-on-misuse, discriminated-union kickoff types                                                                                                         |
| 2 — public API  | `rumPublicApi`                 | `preStartRum` **deleted outright**: its per-call buffer is replaced by one generalized assembly buffer (session manager promise + view coverage). Transport plugs on `event_collected` (`startInternalApiBatch`) |
| 3a — views      | `trackViews` (in place)        | viewCollection / trackViewEventCounts / the startRum view glue deleted. Session renewal & expiry via notifications; counts owned by the API                                                                      |
| 3b — clicks     | `trackClickActions` (in place) | actionCollection / trackManualActions deleted. Frustration reads `handle.current().counts` — no duplicate count pass                                                                                             |
| 4 — plugins     | react/vue/angular/nuxt/nextjs  | `onRumStart` deleted; plugins get `internalApi` in `onInit`. Errors via a new `formatErrorEvent` free formatter. Routers start views through the API; the two-level subscriber queue collapsed                   |
| 5 — profiling   | the RUM profiler               | **Its three histories (longTask/action/vital) are gone entirely**, replaced by `findEvents` time-window queries — the experiment the interface was partly designed for                                           |
| bonus — Shopify | `browser-rum-shopify`          | The full RUM SDK removed from the bundle: a standalone minimal SDK (~init + Shopify bindings) built directly on the internal API                                                                                 |

Everything runs green where it applies: `yarn typecheck`, eslint, and the unit suites of every
touched package (browser-rum-core 1236, browser-rum 674, all five plugin packages, browser-rum-shopify 19),
plus a smoke spec covering the big lines of the new pipeline.

## Headline results

- **`preStartRum` deleted**, not shrunk: the "is RUM started" state machine, per-call buffering and
  the `firstStartViewCall` dance are gone, replaced by one buffering rule (assemble once the
  session manager resolved and a view covers the event).
- **The profiler's three event histories deleted**, replaced by time-window `findEvents` queries —
  the observability scope carried its weight.
- **Counting is owned in one place**: view/action event counts live on history entries and
  `handle.current()`; the click port reads them instead of re-counting collected events.
- **Minimal SDK quantified**: `browser-rum-shopify` went from a wrapper around the full RUM SDK to
  a standalone SDK on the internal API — bundle 159,422 → **52,474 bytes (−67%)**. The glue it
  needed: `createRumInternalApi` + `formatErrorEvent` + 4 plumbing exports
  (validate configuration, start session manager, start transport batch).
- Every port was done **in place** (no parallel implementations survived review), and each deleted
  more than it added.

## The debrief — answers

### Is the tight scope (assembly + extensibility + observability) the right call?

**Yes.** Consumers that needed `sessionManager` or `configuration` (profiler, Shopify glue) received
them as constructor dependencies, never as internal-API surface. No consumer had to bypass the
API. The scope hole the PoC exposed instead is **context assembly**: contexts were cut from the
PoC pipeline, so events currently ship **without `session.id`** — the biggest item to fix before
anything else (contexts as default hooks with a documented registration order, or the API owns the
session stamp).

### Was throw-on-misuse workable?

**Yes, with one production lesson.** It forced explicit caller contracts (routers stop the previous
view at the new view's start time; discarded clicks cancel) and it caught three real internal API
bugs during the ports (double-view check against the wrong clocks, action counts deleted before
the final assembly snapshot, one-shot actions never closed in history). The lesson: a throw inside
caller flow fails _silently_ — the double-view throw ate new views until a frozen-clock smoke test
caught it. SDK-internal callers must guard their start sequences (`callMonitored`); the public
surface stays guarded as today.

### Did `preStartRum` actually simplify?

**Yes, more than planned.** Two behavior changes to decide at rollout: public calls before
`init()` now error loudly instead of being silently replayed (arguably better DX), and tracking
consent is assumed granted in the PoC (the interface's session-manager-promise shape already
supports the real consent sequencing). One new fragility found and encoded as a guarantee:
**subscription order on the session manager promise** — the transport must not flush the batch on
session expiry before the final view version is upserted. See the ordering guarantee in
`rum-thin-layer.ts`; consider making the transport flush on `session_expired` so it lives in one
place.

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
   it requires porting **Replay first** (it is the last consumer of the zombie lifecycle events and
   viewHistory).
4. **View metrics completeness** — the metrics modules currently run on a private idle LifeCycle,
   so loading times don't see request activity until the collectors feed it again.
5. **Interface adjustments before freeze** (all encoded in the final `rum-thin-layer.ts`):
   `event_started` should carry the kickoff event (the profiler had to correlate it with a
   `findEvents` lookup — same correlation problem that produced `handle.current()`); the initial
   view version should be emitted by `startEvent` itself (three consumers do the same
   `update({})` dance — the evidence); the session-promise ordering guarantee; `beforeSend`
   re-wrapped in `limitModification`; baggage shape validation (malformed clocks create NaN
   history bounds that match every query).
6. **Spec debt** (deliberate, inventoried per phase) — old-architecture specs were deleted with
   their architecture: trackViews, trackClickActions, the 1484-line profiler spec, rumPublicApi.
   Fine-grained coverage must be rebuilt on the new architecture before rollout.

## Recommendation

**Iterate the interface; don't rethink it.** Across six consumer kinds it needed only additive
changes, nothing was reverted, and each port was net-negative in code. The found issues are
addressable within the design. Suggested next steps, in order:

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
- [ ] Encode the three interface adjustments (kickoff on `event_started`, initial view version at
      `startEvent`, transport flushing on `session_expired`).
- [ ] Re-wrap `beforeSend` in `limitModification`; add baggage shape validation.
- [ ] Decide pre-init public-call behavior (loud error vs silent replay) and restore tracking
      consent sequencing.
- [ ] Port collectors (resources first), then vitals / long tasks / runtime errors.
- [ ] Port Replay; delete the old startRum pipeline and the zombie lifecycle events.
- [ ] Rebuild fine-grained spec coverage (views, clicks, profiler quota/visibility, public API).
- [ ] Adapt the Shopify live-store e2e scenario (storefront path currently removed in the PoC
      variant); confirm profiler action labels with the backend (assembled-event names vs the
      always-empty labels stored today).
- [ ] Re-measure bundle size for the full SDK once auto-instrumentation is ported (the -67% is for
      the minimal Shopify variant).

## Appendix — where to look

All commits on the PoC branch, one per phase:

| Commit                  | Phase                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| `ac1836db` / `893fcf04` | 1 — implement the internal API (initial + iteration)                     |
| `d6c8211f`              | 2 + 3a — public API wiring, trackViews port                              |
| `e0882ec3`              | 3b — trackClickActions port                                              |
| `5f191231`              | 3 consolidation — in-place replacement, old glue deleted                 |
| `ca01f642`              | 4 — plugins on `onInit({internalApi})`, `formatErrorEvent`, router views |
| `318cb5ca`              | 5 — profiler on the internal API (histories → `findEvents`)              |
| `e0f16077`              | bonus — browser-rum-shopify standalone minimal SDK                       |
| `ed7a2e26`              | 6 — debrief (this document + final `rum-thin-layer.ts`)                  |
