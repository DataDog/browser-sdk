# Generation Manifest — sveltekit

## Generated Files

### Phase 1: Plugin + Wrapping Strategy

- `packages/rum-sveltekit/package.json` — package manifest (name, version, peer/dev deps, scripts)
  - Reference: `packages/rum-vue/package.json`
  - Deviations: No `@sveltejs/kit` devDependency (package not in Yarn cache; all SvelteKit types are defined locally so it is not needed for type-checking or unit tests). `@sveltejs/kit >=2.0.0` remains a peer dependency.

- `packages/rum-sveltekit/tsconfig.json` — TypeScript project config
  - Reference: `packages/rum-angular/tsconfig.json`
  - Deviations: none

- `packages/rum-sveltekit/src/domain/sveltekitPlugin.ts` — plugin lifecycle (global state, `onRumInit`/`onRumStart` subscriber queues, `sveltekitPlugin` factory, `resetSvelteKitPlugin` for tests)
  - Reference: `packages/rum-vue/src/domain/vuePlugin.ts`
  - Deviations: none (structural copy with `sveltekit` substituted for `vue` throughout)

- `packages/rum-sveltekit/src/domain/sveltekitPlugin.spec.ts` — plugin unit tests
  - Reference: `packages/rum-vue/src/domain/vuePlugin.spec.ts`
  - Deviations: none

- `packages/rum-sveltekit/src/domain/sveltekitRouter/startSvelteKitView.ts` — integration point (`startSvelteKitRouterView`) and `computeViewName`
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.ts`
  - Deviations: Wrapping strategy is `renderless-component` rather than `wrap-factory`. No actual `.svelte` file is produced (the Svelte compiler is not configured in the webpack/Karma pipeline). Instead, `startSvelteKitRouterView(navigation)` is exported for users to call directly inside `afterNavigate` in their `+layout.svelte`. An SSR guard (`typeof window === 'undefined'`) is applied inside the function rather than relying on `import { browser } from '$app/environment'` to keep the implementation free of runtime SvelteKit imports. `computeViewName` uses the `route-id` family: `navigation.to.route.id` is already the parameterized pattern, so no record-iteration or param-substitution is needed; only `stripRouteGroups` post-processing is applied.

- `packages/rum-sveltekit/src/entries/main.ts` — public entry point
  - Reference: `packages/rum-vue/src/entries/main.ts`
  - Deviations: Exports `startSvelteKitRouterView` and `SvelteKitAfterNavigate` type in addition to plugin exports (no separate router entry file since there is no factory to wrap).

- `packages/rum-sveltekit/test/initializeSvelteKitPlugin.ts` — test helper
  - Reference: `packages/rum-vue/test/initializeVuePlugin.ts`
  - Deviations: none

- `tsconfig.base.json` — added `@datadog/browser-rum-sveltekit` path alias
  - Reference: existing path entries for other packages
  - Deviations: none

### Phase 2: View Name Algorithm

- `packages/rum-sveltekit/src/domain/sveltekitRouter/types.ts` — local `SvelteKitNavigationTarget` and `SvelteKitAfterNavigate` interfaces
  - Reference: `packages/rum-angular/src/domain/angularRouter/types.ts`
  - Deviations: Types are a minimal structural subset of SvelteKit's `AfterNavigate` interface. No runtime import from `@sveltejs/kit` so the package remains compilable without the framework installed.

- `packages/rum-sveltekit/src/domain/sveltekitRouter/startSvelteKitView.ts` (view name algorithm; same file as Phase 1 integration point)
  - Reference: `packages/rum-angular/src/domain/angularRouter/startAngularView.ts` (route-id family)
  - Deviations: `computeViewName(routeId: string | null)` takes the route ID string directly (not a route record tree). Applies `stripRouteGroups` to remove `/(groupName)` segments that appear in `route.id` but not in the URL.

- `packages/rum-sveltekit/src/domain/sveltekitRouter/startSvelteKitView.spec.ts` — `startSvelteKitRouterView` integration tests and `computeViewName` unit tests
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.spec.ts`
  - Deviations: Test cases derived from `routeSyntax.examples` in `01-router-concepts.json`. No router factory tests (no factory in SvelteKit). SSR guard test removed: `typeof window === 'undefined'` cannot be simulated in the browser-based Karma environment. Route group stripping test cases added to cover the SvelteKit-specific post-processing.

## Validation

**Status:** pass
**Iterations:** 2 / 5

### Iteration 1 — typecheck pass, lint pass, unit tests fail

- Duplicate test name: `computeViewName returns "/" for root route` appeared twice — once as a standalone test (`it('returns "/" for root route', ...)`) and once via the cases table (`['root route', '/', '/']`). Removed the redundant standalone test.

### Iteration 2 — typecheck pass, lint pass, unit tests pass

- All 26 unit tests pass. Prettier check clean on all generated files.
