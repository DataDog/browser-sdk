# Generation Manifest — sveltekit

## Generated Files

### Phase 1: Plugin + Wrapping Strategy

- `packages/rum-sveltekit/package.json` — package config: name, version, deps, peerDeps, scripts
  - Reference: `packages/rum-vue/package.json`
  - Deviations: peerDependencies are `@sveltejs/kit ^2.0.0` and `svelte ^5.0.0` instead of Vue; no `vue-router-v4` sub-path directory (SvelteKit component distributed separately as `.svelte` file)

- `packages/rum-sveltekit/src/domain/sveltekitPlugin.ts` — plugin lifecycle, subscriber pattern, configuration
  - Reference: `packages/rum-vue/src/domain/vuePlugin.ts`
  - Deviations: no `onRumStart`/`addError` subscribers (SvelteKit package has no error-tracking feature); exported type is `Required<Omit<RumPlugin, 'onRumStart'>>` rather than `Required<RumPlugin>`

- `packages/rum-sveltekit/src/domain/sveltekitPlugin.spec.ts` — plugin structure tests
  - Reference: `packages/rum-vue/src/domain/vuePlugin.spec.ts`
  - Deviations: omits `onRumStart` tests (not applicable)

- `packages/rum-sveltekit/src/entries/main.ts` — package entry point exporting plugin types and factory
  - Reference: `packages/rum-vue/src/entries/main.ts`
  - Deviations: no `addVueError` equivalent; no router sub-path entry (router component is a `.svelte` file distributed outside the TypeScript entry tree)

- `packages/rum-sveltekit/test/initializeSveltekitPlugin.ts` — test helper that bootstraps the plugin for unit tests
  - Reference: `packages/rum-vue/test/initializeVuePlugin.ts`
  - Deviations: no `addError` parameter (not needed)

- `packages/rum-sveltekit/src/domain/sveltekitRouter/DatadogRumRouter.svelte` — renderless Svelte component; users place `<DatadogRumRouter />` in their root `+layout.svelte`
  - Reference: `packages/rum-vue/src/domain/router/vueRouter.ts` (structural analogue)
  - Deviations: Svelte component instead of a factory-wrap; uses `onMount` for initial page load (onNavigate does not fire on first render) + `onNavigate` for subsequent navigations; reads `page.route.id` from `$app/state`; guards against `navigation.to === null` (leave navigations)

### Phase 2: View Name Algorithm

- `packages/rum-sveltekit/src/domain/sveltekitRouter/startSveltekitView.ts` — `computeViewName()` + `startSveltekitRouterView()`
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.ts`
  - Deviations: `route-id` family — takes `string | null` directly instead of `RouteLocationMatched[]`; single regex transform to strip parameter matchers (`[page=fruit]` → `[page]`); no catch-all substitution needed (SvelteKit route.id already uses parameterized `[...rest]`)

- `packages/rum-sveltekit/src/domain/sveltekitRouter/types.ts` — minimal local type declarations for navigation shape
  - Reference: none (new for this integration)
  - Deviations: n/a

- `packages/rum-sveltekit/src/domain/sveltekitRouter/startSveltekitView.spec.ts` — view name computation and `startSveltekitRouterView` tests
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.spec.ts`
  - Deviations: test cases adapted for route-id family (direct string input rather than `RouteLocationMatched[]`); covers all five `routeSyntax.concepts`: static-path, dynamic-segments, optional-segments, catch-all, nested-routes plus parameter-matcher stripping

## Validation

**Status:** pass
**Iterations:** 1 / 5

### Iteration 1 — typecheck pass, lint fail → pass, unit tests pass

- Removed unused `noop` import from `test/initializeSveltekitPlugin.ts`; the VuePlugin reference uses `noop` as the default for the `addError` parameter, but `SveltekitPlugin` has no `addError` subscriber so the import was dead code.

### Iteration 2 — typecheck pass, lint pass, unit tests pass (22/22)

<!-- All checks green after single lint fix. -->
