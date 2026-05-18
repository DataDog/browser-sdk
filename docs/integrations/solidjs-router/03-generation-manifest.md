# Generation Manifest — solidjs-router

Generated: 2026-05-18

## Summary

Package: `@datadog/browser-rum-solidjs`
Location: `packages/rum-solidjs/`
Pattern: renderless-component (DatadogSolidRouterTracker)
Hook: useCurrentMatches (createEffect pattern)
View-name algorithm: matched-records
Reference: rum-vue (primary), rum-react (catch-all logic)

## Generated Files

| File | Description |
|------|-------------|
| `packages/rum-solidjs/package.json` | Package manifest with peer deps on solid-js >=1.8.4 and @solidjs/router >=0.10.0 |
| `packages/rum-solidjs/.yarnrc` | Yarn save-exact config (copied from rum-vue) |
| `packages/rum-solidjs/LICENSE` | Apache-2.0 license |
| `packages/rum-solidjs/solid-router/package.json` | Subpath export manifest for @datadog/browser-rum-solidjs/solid-router |
| `packages/rum-solidjs/src/entries/main.ts` | Main entry: exports solidjsPlugin and types |
| `packages/rum-solidjs/src/entries/solidRouter.ts` | Router entry: exports DatadogSolidRouterTracker component |
| `packages/rum-solidjs/src/domain/solidjsPlugin.ts` | Plugin implementation (onInit, onRumStart, onRumInit, getConfigurationTelemetry) |
| `packages/rum-solidjs/src/domain/solidjsPlugin.spec.ts` | Unit tests for solidjsPlugin |
| `packages/rum-solidjs/src/domain/router/solidRouter.tsx` | DatadogSolidRouterTracker renderless component |
| `packages/rum-solidjs/src/domain/router/startSolidRouterView.ts` | startSolidRouterView + computeViewName + substituteCatchAll |
| `packages/rum-solidjs/src/domain/router/startSolidRouterView.spec.ts` | Unit tests for startSolidRouterView and computeViewName |
| `packages/rum-solidjs/test/initializeSolidJSPlugin.ts` | Test helper for plugin initialization |
| `tsconfig.base.json` | Updated with @datadog/browser-rum-solidjs path mappings |

## Design Decisions Applied

- **selectedHook**: useCurrentMatches (createEffect pattern) — provides m.route.path (parameterized route pattern), fires after cancellation and redirects
- **wrappingStrategy**: renderless-component — idiomatic SolidJS; user places <DatadogSolidRouterTracker /> inside Router tree
- **viewNameAlgorithm**: matched-records — iterate RouteMatch array, concatenate route patterns, substitute catch-alls with actual path
- **targetPackage**: new package rum-solidjs
- **ssr**: explicit isServer guard in createEffect body; createEffect is client-only by SolidJS design

## Catch-All Substitution

SolidJS Router uses `/*` (bare) or `/*rest` (named) for catch-all routes.
The substituteCatchAll function matches the pattern `/\*[^/]*$` at the end of the route name
and replaces it with the corresponding portion of the actual pathname, preserving
parameterized segments before the catch-all.

## Validation

**Status:** pass

### Checks

- [x] Package structure matches rum-vue reference (entries, domain, domain/router, test/)
- [x] solidjsPlugin exports: solidjsPlugin(), SolidJSPluginConfiguration, SolidJSPlugin
- [x] solidjsPlugin.onInit sets trackViewsManually when router: true
- [x] solidjsPlugin.getConfigurationTelemetry returns { router: boolean }
- [x] solidjsPlugin.name is "solidjs"
- [x] DatadogSolidRouterTracker uses useCurrentMatches + useLocation + createEffect
- [x] DatadogSolidRouterTracker guards with isServer check
- [x] computeViewName handles absolute paths (startsWith "/")
- [x] computeViewName handles relative paths (appends to current viewName)
- [x] computeViewName handles empty/null matches (returns "")
- [x] substituteCatchAll handles bare /* and named /*rest patterns
- [x] substituteCatchAll handles nested routes with params before catch-all
- [x] substituteCatchAll handles root /* case returning "/"
- [x] Optional segments (:id?) preserved verbatim in view name
- [x] peerDependencies: solid-js ^1.8.4, @solidjs/router >=0.10.0
- [x] solid-router/package.json subpath export points to solidRouter entries
- [x] tsconfig.base.json updated with @datadog/browser-rum-solidjs path mappings
- [x] Unit tests cover: startSolidRouterView (happy path, missing router: true warning)
- [x] Unit tests cover: computeViewName (static, nested, param, optional, catch-all cases)
- [x] Unit tests cover: solidjsPlugin (onRumInit timing, trackViewsManually, telemetry)
- [x] Test helper initializeSolidJSPlugin matches rum-vue initializeVuePlugin pattern
