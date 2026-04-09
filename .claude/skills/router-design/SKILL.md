---
name: router:design
description: "Stage 3: Produce design decisions document from router concepts and SDK mapping. Reads 01 and 02 artifacts."
---

# Stage 3: Design Decisions

## Context

You are Stage 3 of the router integration pipeline. Your job is to synthesize the router concepts (Stage 1) and SDK mapping (Stage 2) into a concrete design document that will guide code generation.

## Input

1. Read `docs/integrations/<framework>/01-router-concepts.md`
2. Read `docs/integrations/<framework>/02-sdk-mapping.md`
3. Read reference implementations for structural patterns:
   - Angular entry point: `packages/rum-angular/src/entries/main.ts`
   - Vue entry point: `packages/rum-vue/src/entries/main.ts`
   - React entry point: `packages/rum-react/src/entries/main.ts`
   - Vue package.json: `packages/rum-vue/package.json`
   - Angular package.json: `packages/rum-angular/package.json`

Find the `<framework>` directory by listing `docs/integrations/`.

## Process

Produce a design document with these sections. Every decision MUST link back to the concept or mapping that informed it.

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
Which hook to use, with the full trade-off analysis from Stage 1 and the mapping from Stage 2. This is the most important architectural decision — make it explicit.

**View Name Algorithm**
Pseudocode or step-by-step description of how `computeViewName()` will work for this framework. Cover:
- Normal routes
- Dynamic segments
- Nested routes
- Catch-all/wildcard routes
- Edge cases specific to this framework

IMPORTANT: The navigation hook choice directly affects what data is available to `computeViewName()`. Different hooks may expose different route objects, matched route arrays, or URL representations. If the framework has multiple candidate hooks (from the Navigation Hook Decision section), show how the view name computation differs for each option:
- What route data each hook provides (e.g. matched route records vs. raw URL vs. route config)
- How that changes the `computeViewName()` implementation
- Whether one hook gives better data for view name computation (e.g. access to parameterized route patterns vs. only resolved URLs)

This analysis should reinforce or challenge the hook choice made above — if a hook that fires later provides significantly better route data, that trade-off must be documented.

**Navigation Filtering**
How failed, duplicate, query-only, and initial navigations are handled.

**Test Strategy**
List every test case to implement, grouped by file:
- `<framework>Plugin.spec.ts`: plugin structure, subscriber callbacks, telemetry, trackViewsManually
- `start<Framework>View.spec.ts`: all view name computation cases (static, dynamic, nested, catch-all, edge cases)
- Router integration spec: navigation event handling, filtering, deduplication

**Trade-offs and Alternatives**
Document any decisions where multiple valid approaches existed. For each, state what was chosen, what was rejected, and why.

## Output

Write the result to `docs/integrations/<framework>/03-design-decisions.md`.
