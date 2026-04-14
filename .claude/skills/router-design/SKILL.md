---
name: router-design
description: 'Stage 2: Analyze reference implementations and produce design decisions document from router concepts. Reads 01-router-concepts.md and reference code.'
---

# Stage 2: Design Decisions

## Context

You are Stage 2 of the router integration pipeline. Your job is to read the router concepts extracted in Stage 1, analyze the existing reference implementations, and produce a concrete design document that will guide code generation.

## Input

1. Read `docs/integrations/<framework>/01-router-concepts.md`
2. Read the reference implementations to understand the SDK contract:
   - Plugin interface: `packages/rum-core/src/domain/plugins.ts`
   - Public API: `packages/rum-core/src/boot/rumPublicApi.ts`
   - Angular router: `packages/rum-angular/src/domain/angularRouter/` (all files)
   - React router: `packages/rum-react/src/domain/reactRouter/` (all files)
   - Vue router: `packages/rum-vue/src/domain/router/` (all files)
3. Read reference entry points and package configs:
   - Angular entry point: `packages/rum-angular/src/entries/main.ts`
   - Vue entry point: `packages/rum-vue/src/entries/main.ts`
   - React entry point: `packages/rum-react/src/entries/main.ts`
   - Vue package.json: `packages/rum-vue/package.json`
   - Angular package.json: `packages/rum-angular/package.json`

Find the `<framework>` directory by listing `docs/integrations/`.

## Process

For each concept in `01-router-concepts.md`, find the closest equivalent in the reference implementations. Every mapping MUST include inline links to both:

- The framework doc source (from 01-router-concepts.md links)
- The specific file and line range in the reference implementation

### Required Sections

**Architecture Overview**
2-3 sentences describing the overall approach. Which reference implementation is closest and why.

**Public API**
Exactly what the user imports and calls. Show the complete setup code example:

```typescript
// What the user writes in their app
import { ... } from '@datadog/browser-rum-<framework>'
```

**File Structure**
The exact file tree for `packages/rum-<framework>/` with one-line descriptions per file. Follow the convention from reference packages:

- `src/entries/main.ts` — public exports
- `src/domain/<framework>Plugin.ts` — plugin + subscriber pattern
- `src/domain/<framework>Router/` — router integration files
- `src/test/` — test helpers
- `package.json`, `tsconfig.json`, `README.md`

**Navigation Hook Decision**
Which framework hook/event to subscribe to, and which reference implementation it's most similar to. Justify the choice based on the lifecycle timing analysis from Stage 1 (after redirects, before data fetches, before render).

IMPORTANT: The navigation hook choice directly affects what data is available to `computeViewName()`. Different hooks may expose different route objects, matched route arrays, or URL representations. If the framework has multiple candidate hooks, show how the view name computation differs for each option:

- What route data each hook provides (e.g. matched route records vs. raw URL vs. route config)
- How that changes the `computeViewName()` implementation
- Whether one hook gives better data for view name computation (e.g. access to parameterized route patterns vs. only resolved URLs)

This analysis should reinforce or challenge the hook choice — if a hook that fires later provides significantly better route data, that trade-off must be documented.

**View Name Algorithm**
Pseudocode or step-by-step description of how `computeViewName()` will work for this framework. Cover:

- How to access the matched route records after navigation
- How dynamic segments appear in the route definition (and whether they need normalization)
- How catch-all/wildcard routes should be substituted with actual path segments
- Normal routes, dynamic segments, nested routes, catch-all/wildcard routes
- Edge cases specific to this framework
- Link to the most similar existing `computeViewName` implementation and note differences

**Wrapping Strategy**
How the integration hooks into the framework. Reference implementations:

- Angular: [`ENVIRONMENT_INITIALIZER` provider](packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.ts)
- React: [wrapper around `createRouter`](packages/rum-react/src/domain/reactRouter/createRouter.ts) and [`useRoutes` hook](packages/rum-react/src/domain/reactRouter/useRoutes.ts)
- Vue: [wrapper around `createRouter`](packages/rum-vue/src/domain/router/vueRouter.ts)

Determine which pattern fits this framework and why.

**Type Strategy**
Whether to define minimal local types (like Angular's [`RouteSnapshot`](packages/rum-angular/src/domain/angularRouter/types.ts)) to avoid runtime framework imports, or import types directly from the framework package.

**Plugin Configuration**
How the plugin will be configured. All reference implementations use the same pattern:

- [`VuePluginConfiguration`](packages/rum-vue/src/domain/vuePlugin.ts) with `router?: boolean`
- `onInit` sets `trackViewsManually = true` when `router: true`

**Peer Dependencies**
Which framework packages are required as peer dependencies, with version ranges.

**Navigation Filtering**
How to handle:

- Failed navigations (guards blocking, cancellations)
- Duplicate navigations (same path)
- Query-only changes
- Initial navigation

Reference the filtering logic in existing implementations:

- Vue: [lines 15-22 of vueRouter.ts](packages/rum-vue/src/domain/router/vueRouter.ts)
- React: subscribe callback in [createRouter.ts](packages/rum-react/src/domain/reactRouter/createRouter.ts)

**Test Strategy**
List every test case to implement, grouped by file:

- `<framework>Plugin.spec.ts`: plugin structure, subscriber callbacks, telemetry, trackViewsManually
- `start<Framework>View.spec.ts`: all view name computation cases (static, dynamic, nested, catch-all, edge cases)
- Router integration spec: navigation event handling, filtering, deduplication

**Trade-offs and Alternatives**
Document any decisions where multiple valid approaches existed. For each, state what was chosen, what was rejected, and why.

### Unmapped Concepts

For any framework concept that has no SDK equivalent, create a section:

```markdown
### Unmapped: <concept name>

**Severity:** critical | minor
**Reason:** <why there's no equivalent>
**Impact:** <what this means for the integration>
```

- `critical`: the integration cannot work without this (e.g. no way to get route matches) — **stop the pipeline**
- `minor`: the integration works but this feature isn't supported (e.g. named outlets not tracked)

## Exit Criteria

If any unmapped concept has severity `critical`, stop the pipeline. Write an exit note at the top of the output explaining which concepts could not be mapped and why.

## Output

Write the result to `docs/integrations/<framework>/02-design-decisions.md`.
