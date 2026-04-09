---
name: router:analyze
description: "Stage 2: Map framework router concepts to existing SDK patterns. Reads 01-router-concepts.md and reference implementations."
---

# Stage 2: Analyze and Map to SDK Patterns

## Context

You are Stage 2 of the router integration pipeline. Your job is to read the router concepts extracted in Stage 1 and map each one to the equivalent pattern in the existing Browser SDK framework integrations.

## Input

1. Read `docs/integrations/<framework>/01-router-concepts.md` for the framework's router concepts
2. Read the reference implementations to understand the SDK contract:
   - Plugin interface: `packages/rum-core/src/domain/plugins.ts`
   - Public API: `packages/rum-core/src/boot/rumPublicApi.ts`
   - Angular router: `packages/rum-angular/src/domain/angularRouter/` (all files)
   - React router: `packages/rum-react/src/domain/reactRouter/` (all files)
   - Vue router: `packages/rum-vue/src/domain/router/` (all files)

Find the `<framework>` directory by listing `docs/integrations/`.

## Process

For each concept in `01-router-concepts.md`, find the closest equivalent in the reference implementations. Every mapping MUST include inline links to both:
- The framework doc source (from 01-router-concepts.md links)
- The specific file and line range in the reference implementation

### Required Mappings

**Navigation Event Mapping**
Which framework hook/event to subscribe to, and which reference implementation it's most similar to. Justify the choice based on the lifecycle timing analysis from Stage 1 (after redirects, before data fetches, before render). If the chosen hook involves trade-offs, document them here with links to the Stage 1 analysis.

**View Name Computation**
How to build the `computeViewName()` function:
- How to access the matched route records after navigation
- How dynamic segments appear in the route definition (and whether they need normalization)
- How catch-all/wildcard routes should be substituted with actual path segments
- Link to the most similar existing `computeViewName` implementation and note differences

**Wrapping Strategy**
How the integration hooks into the framework:
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

### Unmapped Concepts

For any framework concept that has no SDK equivalent, create a section:

```markdown
### Unmapped: <concept name>

**Severity:** critical | minor
**Reason:** <why there's no equivalent>
**Impact:** <what this means for the integration>
```

- `critical`: the integration cannot work without this (e.g. no way to get route matches)
- `minor`: the integration works but this feature isn't supported (e.g. named outlets not tracked)

## Output

Write the result to `docs/integrations/<framework>/02-sdk-mapping.md`.
