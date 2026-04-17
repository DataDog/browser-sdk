# Generation Manifest — angular

## Generated Files

### Phase 1: Plugin + Wrapping Strategy

- `packages/rum-angular/package.json` — package manifest with main + `angular-router` subpath entries, optional `@angular/*` peer deps
  - Reference: `packages/rum-vue/package.json`
  - Deviations: peer deps are `@angular/common`, `@angular/core`, `@angular/router`, `rxjs` (all optional) instead of `vue`/`vue-router`; added `zone.js`/`tslib` to devDependencies per Angular runtime requirements.

- `packages/rum-angular/angular-router/package.json` — subpath package entry pointer
  - Reference: `packages/rum-vue/vue-router-v4/package.json`
  - Deviations: none (rename-only).

- `packages/rum-angular/angular-router/typedoc.json` — docs entry config
  - Reference: `packages/rum-vue/vue-router-v4/typedoc.json`
  - Deviations: none.

- `packages/rum-angular/typedoc.json` — docs entry for main
  - Reference: `packages/rum-vue/typedoc.json`
  - Deviations: none.

- `packages/rum-angular/README.md` — package overview, setup, router tracking docs
  - Reference: n/a (written against design + routeSyntax.examples)
  - Deviations: n/a.

- `packages/rum-angular/src/entries/main.ts` — public main entry exporting `angularPlugin` and config types
  - Reference: `packages/rum-vue/src/entries/main.ts`
  - Deviations: none (rename-only).

- `packages/rum-angular/src/entries/angularRouter.ts` — router subpath entry exporting `provideDatadogRouter`
  - Reference: `packages/rum-vue/src/entries/vueRouter.ts`
  - Deviations: exports `provideDatadogRouter` (DI provider array) instead of `createRouter` (factory wrapper), per `wrappingStrategy.pattern = "provider"`.

- `packages/rum-angular/src/domain/angularPlugin.ts` — plugin lifecycle, subscriber pattern, configuration
  - Reference: `packages/rum-vue/src/domain/vuePlugin.ts`
  - Deviations: identifier renames only (`vue`→`angular`).

- `packages/rum-angular/src/domain/angularPlugin.spec.ts` — plugin structure tests
  - Reference: `packages/rum-vue/src/domain/vuePlugin.spec.ts`
  - Deviations: identifier renames only.

- `packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.ts` — integration point: `ENVIRONMENT_INITIALIZER` provider subscribing to `Router.events` and filtering by `ResolveStart`
  - Reference: `packages/rum-vue/src/domain/router/vueRouter.ts`
  - Deviations: per `wrappingStrategy.pattern = "provider"` — DI provider array instead of factory wrap. Uses `inject(Router)` and `isPlatformBrowser(inject(PLATFORM_ID))` for SSR guard (design `ssr.handling`). Filter uses a `isResolveStart` type predicate over `EventType.ResolveStart` (instead of `instanceof ResolveStart`) so `startAngularRouterTracking` is testable with plain-object fakes, preserving design intent (same runtime semantics).

- `packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.spec.ts` — provider + subscription tests
  - Reference: `packages/rum-vue/src/domain/router/vueRouter.spec.ts`
  - Deviations: test fake is a minimal `events.subscribe` object (vue spec uses a real `createRouter` + `createMemoryHistory`). Reason: Angular's `Router` requires a full DI bootstrap; the provider shape is covered with a dedicated `provideDatadogRouter` suite. First line imports `@angular/compiler` to satisfy JIT requirement when `@angular/router` modules load under Karma.

- `packages/rum-angular/test/initializeAngularPlugin.ts` — shared test helper
  - Reference: `packages/rum-vue/test/initializeVuePlugin.ts`
  - Deviations: identifier renames only.

### Phase 2: View Name Algorithm

- `packages/rum-angular/src/domain/angularRouter/startAngularView.ts` — `computeViewName()` + `startAngularRouterView()` walking `ActivatedRouteSnapshot.firstChild` chain and substituting `**` catch-all
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.ts`
  - Deviations: input is a root `ActivatedRouteSnapshot` with `firstChild` chain (walked recursively) instead of Vue's flat `matched[]` array. Catch-all marker is `/**` (Angular) instead of `/:pathMatch(.*)*` (Vue Router). `substituteCatchAll` additionally strips query/fragment from the URL before splitting, matching Angular's `urlAfterRedirects` format.

- `packages/rum-angular/src/domain/angularRouter/types.ts` — minimal `AngularActivatedRouteSnapshot` local type
  - Reference: n/a (no Vue analogue — Vue imports `RouteLocationMatched` at runtime since `vue-router` is allowlisted for side-effects)
  - Deviations: local type mirrors only `routeConfig.path` and `firstChild` to avoid runtime coupling to `@angular/router` in the main entry and keep tests simple.

- `packages/rum-angular/src/domain/angularRouter/startAngularView.spec.ts` — view name tests
  - Reference: `packages/rum-vue/src/domain/router/startVueRouterView.spec.ts`
  - Deviations: test helper builds a snapshot tree via nested `firstChild` links (instead of a `matched[]` array). Test cases translated from `routeSyntax.examples`: static paths, dynamic `:id`, nested routes, `**` catch-all (with + without prefix params), and URL query/fragment stripping. Every `routeSyntax.concept` has coverage.

## Validation

**Status:** pass
**Iterations:** 2 / 5

### Iteration 1 — typecheck fail, lint fail, unit tests not reached

- Typecheck: `RouterEventsEmitter.events.subscribe` typed its observer parameter as `Event` (from `@angular/router`), incompatible with the test fake's `(event: unknown) => void` subscriber under `strictFunctionTypes`. Fixed by widening the callback parameter to `unknown` and replacing the inline type assertion with an `isResolveStart` type-predicate function.
- Lint `local-rules/disallow-side-effects`: `@angular/core`, `@angular/common`, `@angular/router` are not in the repo's allowlist of side-effect-free packages. Added all three alongside the existing `vue`/`vue-router`/`react` entries in `eslint-local-rules/disallowSideEffects.js` — the canonical precedent for adding a new framework integration.
- Lint `@typescript-eslint/no-unnecessary-type-assertion`: `event as ResolveStart` became redundant once the type predicate was in place — removed.
- Lint `@typescript-eslint/no-empty-function`: fake router's `unsubscribe() {}` method replaced with `unsubscribe: noop` (imported from `@datadog/browser-core`).
- Lint `prefer-const`: changed `let root` to `const root` in the fake-event builder (only the reference is reassigned; the object literal itself is not).

### Iteration 2 — typecheck fail, lint pass, unit tests fail

- Unit tests: Karma load failed with `JIT compilation failed for injectable PlatformNavigation` because importing `@angular/router` in the spec file transitively pulls `@angular/common`'s partially-compiled decorators that need the JIT compiler. Added `import '@angular/compiler'` as the first import of the spec file. `@angular/compiler` was already a devDependency of `rum-angular`.

### Iteration 3 — typecheck pass, lint pass, unit tests pass (37 / 37)

