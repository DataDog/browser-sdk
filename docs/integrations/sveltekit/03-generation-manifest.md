# Generation Manifest — sveltekit

## Generated Files

### Phase 1: Plugin + Wrapping Strategy

- `packages/rum-sveltekit/package.json` — Package manifest for `@datadog/browser-rum-sveltekit` with `@sveltejs/kit ^2.12.0` and `svelte ^5.0.0` optional peer deps.
  - Reference: `packages/rum-vue/package.json`
  - Deviations: peer deps point to `@sveltejs/kit` / `svelte` instead of `vue` / `vue-router`; no `devDependencies` (no browser-only runtime needed for tests — the integration point is mocked in TS).
- `packages/rum-sveltekit/typedoc.json` — Typedoc entry point.
  - Reference: `packages/rum-vue/typedoc.json`
  - Deviations: none.
- `packages/rum-sveltekit/LICENSE` — Apache 2.0 license (verbatim copy).
  - Reference: `packages/rum-vue/LICENSE`
  - Deviations: none.
- `packages/rum-sveltekit/README.md` — Setup + router view tracking guide with SSR-safe init pattern.
  - Reference: `packages/rum-vue/README.md`
  - Deviations: SvelteKit initialization must be gated with `if (browser)` because the framework renders every layout on the server by default — documented prominently. Router section shows both the renderless component and an imperative `afterNavigate(trackSvelteKitNavigation)` alternative. Route-tracking table lists `route.id` patterns rather than colon-param syntax.
- `packages/rum-sveltekit/sveltekit-router/package.json` — Subpath package pointer.
  - Reference: `packages/rum-vue/vue-router-v4/package.json`
  - Deviations: adds a `svelte` field pointing at `DatadogRumRouter.svelte` so Svelte-aware bundlers resolve the renderless component via the subpath import.
- `packages/rum-sveltekit/src/entries/main.ts` — Main entry re-exporting the plugin.
  - Reference: `packages/rum-vue/src/entries/main.ts`
  - Deviations: no `addVueError` equivalent (error integration is out of scope for Stage 3).
- `packages/rum-sveltekit/src/entries/svelteKitRouter.ts` — Subpath entry re-exporting the tracker function and navigation types.
  - Reference: `packages/rum-vue/src/entries/vueRouter.ts`
  - Deviations: exports a `trackSvelteKitNavigation` callback (designed to be passed to `afterNavigate`) and local `Navigation` / `NavigationTarget` types, rather than a wrapped `createRouter` factory — SvelteKit routing is framework-owned, so there is nothing to wrap.
- `packages/rum-sveltekit/src/domain/svelteKitPlugin.ts` — Plugin lifecycle, onRumInit/onRumStart subscriber queues, `resetSvelteKitPlugin`, `getConfigurationTelemetry`.
  - Reference: `packages/rum-vue/src/domain/vuePlugin.ts`
  - Deviations: plugin name is `'sveltekit'`; identifiers renamed (`SvelteKitPluginConfiguration`, `svelteKitPlugin`, `resetSvelteKitPlugin`). Shape is otherwise line-for-line identical.
- `packages/rum-sveltekit/src/domain/svelteKitPlugin.spec.ts` — Plugin structure tests (`name`, onInit subscriber behaviour, `trackViewsManually`, telemetry).
  - Reference: `packages/rum-vue/src/domain/vuePlugin.spec.ts`
  - Deviations: none (same six cases, renamed symbols).
- `packages/rum-sveltekit/src/domain/svelteKitRouter/svelteKitRouter.ts` — Integration point: filters navigation events (null `to`, query-only changes) and delegates to `startSvelteKitRouterView`.
  - Reference: `packages/rum-vue/src/domain/router/vueRouter.ts`
  - Deviations: no `createRouter` wrapper. Exports a `trackSvelteKitNavigation(navigation)` callback designed for `afterNavigate`. Skip rules: (a) `navigation.to === null` (e.g. `type === 'leave'`), (b) `from.url.pathname === to.url.pathname` (query-only change). The initial-navigation guard from `vueRouter.ts` (`from.matched.length > 0`) is not needed — SvelteKit guarantees `from === null` on initial mount, so the skip rule never matches.
- `packages/rum-sveltekit/src/domain/svelteKitRouter/svelteKitRouter.spec.ts` — Integration tests: initial navigation, subsequent navigation, query-only skip, null-`to` skip, 404 fallback, route-group preservation.
  - Reference: `packages/rum-vue/src/domain/router/vueRouter.spec.ts`
  - Deviations: uses `makeNavigation` / `makeTarget` helpers that build SvelteKit-shaped `Navigation` objects directly, rather than driving a real router via `createMemoryHistory` + `router.push()`. Rationale: SvelteKit's `afterNavigate` requires a running Svelte app in a browser, which is out of reach for Karma/Jasmine; the integration point is a pure function over `Navigation`, so calling it with a synthesised `Navigation` matches reference coverage (6 tests, same intent).
- `packages/rum-sveltekit/src/domain/svelteKitRouter/DatadogRumRouter.svelte` — Renderless Svelte 5 component that calls `afterNavigate(trackSvelteKitNavigation)` during initialization.
  - Reference: _new file_ — reference integrations ship `.ts` / `.tsx` only.
  - Deviations: this is the SvelteKit-idiomatic "attach app-wide lifecycle behaviour" pattern. Tested indirectly via `svelteKitRouter.spec.ts` (the callback it passes to `afterNavigate` is unit-tested in isolation); the Svelte component itself is out of Karma's reach.
- `packages/rum-sveltekit/test/initializeSvelteKitPlugin.ts` — Test helper that initialises the plugin, wires `onInit` / `onRumStart`, and registers a cleanup task.
  - Reference: `packages/rum-vue/test/initializeVuePlugin.ts`
  - Deviations: none (renamed symbols).

### Phase 2: View Name Algorithm

- `packages/rum-sveltekit/src/domain/svelteKitRouter/types.ts` — Local `NavigationTarget` / `Navigation` interfaces matching the fields used from SvelteKit's `afterNavigate` callback.
  - Reference: _new file_ — `rum-vue` imports `RouteLocationMatched` from `vue-router` directly.
  - Deviations: defines types locally rather than importing from `@sveltejs/kit`, because `@sveltejs/kit`'s public type tree depends on a running Kit project (virtual `$app/*` modules) and adding it as a `devDependency` would pull the entire framework into unit tests. Only the four fields actually touched (`url`, `route.id`, `params`, `from` / `to` / `type` / `willUnload` / `complete`) are declared.
- `packages/rum-sveltekit/src/domain/svelteKitRouter/startSvelteKitView.ts` — `startSvelteKitRouterView(to)` + `computeViewName(to)`.
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.ts`
  - Deviations: `route-id` family — `computeViewName` is a one-liner (`to.route.id ?? to.url.pathname`) because SvelteKit hands us the collapsed pattern directly; no `matched` iteration, no catch-all substitution. The `onRumInit` + `rumPublicApi.startView` + `display.warn` scaffolding around it is identical in shape to the Vue reference.
- `packages/rum-sveltekit/src/domain/svelteKitRouter/startSvelteKitView.spec.ts` — View-name tests.
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.spec.ts`
  - Deviations: same `describe` / `cases` layout; cases sourced from the Stage 1 `routeSyntax.examples` (every `routeSyntax.concept` — `static-path`, `dynamic-segments`, `optional-segments`, `catch-all`, `nested-routes`, plus matchers, route groups, and hex-escaped names — has at least one case). Also covers the `route.id === null` pathname fallback that the Vue reference has no analogue for (Vue Router always supplies a matched array).

## Validation

**Status:** pass
**Iterations:** 1 / 5

### Iteration 1 — typecheck pass, lint pass, unit tests pass (27/27)
