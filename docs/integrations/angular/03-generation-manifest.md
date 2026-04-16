# Generation Manifest — Angular Router Integration

## Generated Files

### Phase 1: Plugin + Wrapping Strategy

| File | Purpose | Reference |
|------|---------|-----------|
| `packages/rum-angular/package.json` | Package metadata, dependencies, build config | `packages/rum-vue/package.json` |
| `packages/rum-angular/typedoc.json` | TypeDoc entry point config | `packages/rum-vue/typedoc.json` |
| `packages/rum-angular/README.md` | Usage documentation and setup guide | `packages/rum-vue/README.md` |
| `packages/rum-angular/src/entries/main.ts` | Public API entry point (exports plugin + provider) | `packages/rum-vue/src/entries/main.ts` |
| `packages/rum-angular/test/initializeAngularPlugin.ts` | Test helper for plugin initialization | `packages/rum-vue/test/initializeVuePlugin.ts` |
| `packages/rum-angular/src/domain/angularPlugin.ts` | Plugin lifecycle, subscriber pattern, configuration | `packages/rum-vue/src/domain/vuePlugin.ts` |
| `packages/rum-angular/src/domain/angularPlugin.spec.ts` | Plugin structure tests | `packages/rum-vue/src/domain/vuePlugin.spec.ts` |
| `packages/rum-angular/src/domain/angularRouter/angularRouter.ts` | `provideDatadogRouter()` provider + `trackRouterViews()` subscription | `packages/rum-vue/src/domain/router/vueRouter.ts` |
| `packages/rum-angular/src/domain/angularRouter/angularRouter.spec.ts` | Router provider + event subscription tests | `packages/rum-vue/src/domain/router/vueRouter.spec.ts` |

### Phase 2: View Name Algorithm

| File | Purpose | Reference |
|------|---------|-----------|
| `packages/rum-angular/src/domain/angularRouter/types.ts` | Minimal local types for ActivatedRouteSnapshot shape | N/A (Angular-specific) |
| `packages/rum-angular/src/domain/angularRouter/startAngularView.ts` | `computeViewName()` + `startAngularView()` | `packages/rum-vue/src/domain/router/startVueRouterView.ts` |
| `packages/rum-angular/src/domain/angularRouter/startAngularView.spec.ts` | View name computation tests | `packages/rum-vue/src/domain/router/startVueRouterView.spec.ts` |

## Deviations from Reference (rum-vue)

### Wrapping strategy: provider instead of wrap-factory

- **Vue**: Wraps `createRouter()` factory, attaches `afterEach` hook on the returned router instance.
- **Angular**: Uses `provideDatadogRouter()` returning `EnvironmentProviders` with `ENVIRONMENT_INITIALIZER`. Injects `Router` via Angular DI and subscribes to `Router.events`.
- **Why**: Angular's DI system is the standard integration point. `provideDatadogRouter()` follows the `provideRouter()` / `provideHttpClient()` convention.

### SSR guard

- **Vue**: No SSR guard — Vue Router's `afterEach` only fires client-side when the app is mounted.
- **Angular**: Guards `ENVIRONMENT_INITIALIZER` factory with `isPlatformBrowser(inject(PLATFORM_ID))`. Skips subscription on server.
- **Why**: Angular Universal/SSR runs the full DI initialization server-side. The guard prevents unnecessary subscription setup.

### Selected hook: ResolveStart instead of afterEach

- **Vue**: `router.afterEach` — fires after navigation completes (afterRender=true).
- **Angular**: `ResolveStart` — fires after guards pass but before resolvers (afterFetch=false, afterRender=false).
- **Why**: ResolveStart is the earliest Angular event that satisfies all three selection rules (afterCancellation, afterRedirects, has route state). Chosen over NavigationEnd for earlier view tracking.

### Catch-all pattern: `**` instead of `/:pathMatch(.*)*`

- **Vue**: Catch-all uses `/:pathMatch(.*)*` regex pattern.
- **Angular**: Catch-all uses `**` wildcard.
- **Why**: Different framework syntax. The `substituteCatchAll()` function matches `/**` instead of `/:pathMatch(.*)*`.

### View name construction: segment concatenation instead of last-match

- **Vue**: `matched[]` array contains absolute paths (`/foo`, `/foo/bar`). The last record's path is effectively the view name.
- **Angular**: `pathFromRoot[]` contains relative segments (`foo`, `bar`). Segments are concatenated with `/` separators.
- **Why**: Angular's `ActivatedRouteSnapshot.routeConfig.path` is always a relative segment, not an absolute path.

### Test approach: RxJS Subject instead of real router

- **Vue**: Tests create a real `vue-router` instance with `createMemoryHistory()` and call `router.push()`.
- **Angular**: Tests use an RxJS `Subject<ResolveStartLike>` to push mock events. `trackRouterViews()` is exported for direct testing without Angular DI.
- **Why**: Angular Router requires the full DI container (TestBed) to instantiate. Using a Subject keeps tests lightweight and avoids heavy Angular testing infrastructure.

### types.ts: local type definitions

- **Vue**: Imports `RouteLocationMatched` type from `vue-router`.
- **Angular**: Defines `AngularActivatedRouteSnapshot` and `AngularRouteConfig` locally.
- **Why**: Avoids compile-time dependency on `@angular/router` types in the view name computation module. The local types mirror the subset of Angular's types actually used.

### No error handler

- **Vue**: Includes `addVueError` for Vue's global error handler integration.
- **Angular**: Does not include an error handler equivalent.
- **Why**: Angular error handling (ErrorHandler class) is a separate concern not covered by the router integration pipeline. Can be added independently.

### Entry point: single main.ts instead of sub-path export

- **Vue**: Router is exported from `@datadog/browser-rum-vue/vue-router-v4` sub-path.
- **Angular**: `provideDatadogRouter` is exported from the main entry point `@datadog/browser-rum-angular`.
- **Why**: Angular has one canonical router (`@angular/router`), so there's no need for version-specific sub-paths.
