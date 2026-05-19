# Generation Manifest — solid-router

## Generated Files

### Phase 1: Plugin + Wrapping Strategy

- `packages/rum-solid/package.json` — package metadata, peer dependencies on `@solidjs/router >= 0.11.0` and `solid-js ^1.0.0`
  - Reference: `packages/rum-react/package.json`
  - Deviations: uses solid-js peer dependency instead of React; removed `internal` and router-version entry points; version updated to 7.1.0

- `packages/rum-solid/tsconfig.json` — TypeScript project config extending root `tsconfig.base.json`
  - Reference: `packages/rum-nextjs/tsconfig.json`
  - Deviations: none

- `packages/rum-solid/src/domain/solidPlugin.ts` — plugin lifecycle, global subscriber state, `onRumInit`/`onRumStart` exports, `resetSolidPlugin` for tests
  - Reference: `packages/rum-react/src/domain/reactPlugin.ts`
  - Deviations: plugin name `'solid'`; JSDoc updated for Solid; no `addError`-propagating subscriber (Solid integration does not include error boundary feature)

- `packages/rum-solid/src/domain/solidPlugin.spec.ts` — plugin structure and subscriber lifecycle tests
  - Reference: `packages/rum-react/src/domain/reactPlugin.spec.ts`
  - Deviations: none (exact structural match, names changed to Solid equivalents)

- `packages/rum-solid/src/domain/solidRouter/rumSolidRouter.ts` — renderless Solid component; SSR guard via `isServer`; uses `useCurrentMatches()` and `useLocation()` inside `createEffect` to track navigations
  - Reference: `packages/rum-react/src/domain/reactRouter/useRoutes.ts` (closest conceptual analog)
  - Deviations: renderless component pattern instead of hook wrapper; `/* eslint-disable local-rules/disallow-side-effects */` required because framework imports (`solid-js`, `@solidjs/router`) are not in the allow-list; no React `useRef` equivalent needed — Solid's reactive system handles tracking natively

- `packages/rum-solid/src/entries/main.ts` — package entry point exporting plugin and component
  - Reference: `packages/rum-react/src/entries/main.ts`
  - Deviations: exports `RumSolidRouter` instead of error boundary and performance utilities

- `packages/rum-solid/test/initializeSolidPlugin.ts` — test helper that resets state, creates plugin, calls `onInit`/`onRumStart`, and registers cleanup
  - Reference: `packages/rum-react/test/initializeReactPlugin.ts`
  - Deviations: none (structural match)

### Phase 2: View Name Algorithm

- `packages/rum-solid/src/domain/solidRouter/types.ts` — minimal `AnyRouteMatch` interface with `route.originalPath`
  - Reference: `packages/rum-react/src/domain/reactRouter/types.ts`
  - Deviations: uses `originalPath` instead of `path` — in `@solidjs/router`, `RouteDescription.originalPath` carries the parameterized route pattern; `RouteMatch.path` is the evaluated URL path

- `packages/rum-solid/src/domain/solidRouter/startSolidRouterView.ts` — `computeViewName()` + `startSolidRouterView()`; matched-records algorithm iterating `route.originalPath` with absolute/relative path handling
  - Reference: `packages/rum-react/src/domain/reactRouter/startReactRouterView.ts`
  - Deviations: no `substitutePathSplats` — solid-router uses named wildcards (`*any`, `*404`) which are semantically meaningful view names and should not be replaced with evaluated path segments

- `packages/rum-solid/src/domain/solidRouter/startSolidRouterView.spec.ts` — view name computation tests covering all 5 route concepts from Stage 1
  - Reference: `packages/rum-react/src/domain/reactRouter/startReactRouterView.spec.ts`
  - Deviations: no in-browser router instantiation (solid-router has no `createMemoryRouter` equivalent accessible in JSDOM unit tests); test cases drive `computeViewName()` directly with mock `AnyRouteMatch[]` objects; uses `originalPath` key in fixtures

## Validation

**Status:** pass
**Iterations:** 2 / 5

### Iteration 1 — typecheck fail, lint not run, unit tests not run

- `rumSolidRouter.ts` cast `matches() as AnyRouteMatch[]` failed typecheck: `RouteDescription` has no `path` property — the actual API uses `originalPath`. Fixed `types.ts`, `startSolidRouterView.ts`, `rumSolidRouter.ts` (removed cast — `RouteMatch` now structurally compatible with updated `AnyRouteMatch`), and `startSolidRouterView.spec.ts` to use `originalPath` throughout.

### Iteration 2 — typecheck pass, lint fail, unit tests pass

- `rumSolidRouter.ts` triggered `local-rules/disallow-side-effects` on imports of `solid-js/web`, `solid-js`, and `@solidjs/router` (none in the rule's allow-list). Added `/* eslint-disable local-rules/disallow-side-effects */` file-level comment, matching the pattern used by `reactRouterV6.ts` and `reactRouterV7.ts` for the same reason. All 24 unit tests passed in this iteration already.

### Iteration 2 (final) — typecheck pass, lint pass, unit tests pass (24/24)
