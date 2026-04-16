---
name: router-design
description: 'Stage 2: Analyze reference implementations and produce design decisions from router concepts YAML. Reads 01-router-concepts.yaml and reference code.'
---

# Stage 2: Design Decisions

## Context

You are Stage 2 of the router integration pipeline. Your job is to read the structured router concepts from Stage 1, analyze the existing reference implementations, and produce explicit design decisions that will guide code generation in Stage 3.

## Input

1. Read `docs/integrations/<framework>/01-router-concepts.yaml`
2. Read the reference implementations to understand the SDK patterns:
   - Plugin files: `packages/rum-vue/src/domain/vuePlugin.ts`, `packages/rum-react/src/domain/reactPlugin.ts`, `packages/rum-nextjs/src/domain/nextjsPlugin.ts`
   - Vue router: `packages/rum-vue/src/domain/router/` (all `.ts` files)
   - React router: `packages/rum-react/src/domain/reactRouter/` (all `.ts` files)
   - Next.js router: `packages/rum-nextjs/src/domain/nextJSRouter/` (all `.ts` files)
   - Entry points: `packages/rum-vue/src/entries/main.ts`, `packages/rum-react/src/entries/main.ts`, `packages/rum-nextjs/src/entries/main.ts`
   - Package configs: `packages/rum-vue/package.json`, `packages/rum-react/package.json`, `packages/rum-nextjs/package.json`
   - Plugin interface: `packages/rum-core/src/domain/plugins.ts`

Find the `<framework>` directory by listing `docs/integrations/`.

## Process

### 1. Hook Selection (Deterministic)

Apply these priority rules to the `hooks` array from `01-router-concepts.yaml`.

**The integration must be client-side only.** Only consider hooks that fire on the client. Use the `access` field and `ssr` section from `01-router-concepts.yaml` to determine this.

**Priority rules (in order):**

1. `afterCancellation: true` — **required**. Never start a RUM view for a navigation that didn't occur.
2. `afterRedirects: true` — **prefer**. Report the final destination, not intermediate routes.
3. `afterFetch: false` AND `afterRender: false` — **prefer**. Start the view before data loading and DOM mutation so RUM events (fetch resources, long tasks, interactions) are attributed to the new view, not the previous one.

Apply in order:

- Filter to `afterCancellation: true`. If no hooks pass, flag as critical issue and stop.
- Among those, prefer `afterRedirects: true`.
- Among those, prefer `afterFetch: false` AND `afterRender: false`.
- If rules conflict (no hook satisfies all), higher-priority rule wins.
- If multiple hooks still tie, prefer the one that fires earliest in the lifecycle.

Document which hooks were considered, which rules each passed/failed, and why the selected hook won.

### 2. Wrapping Strategy (LLM Judgment)

Read the selected hook's `access` field from `01-router-concepts.yaml`. Determine the most idiomatic way for users to integrate the plugin in this framework.

Consider:

- How existing plugins/libraries are typically added in this framework's ecosystem
- Whether the hook needs a router instance (→ wrap the factory that creates it)
- Whether the hook needs component context (→ renderless component or hook)
- Whether the hook needs DI (→ provider registration)

Reference patterns from existing implementations:

- Vue: wraps `createRouter()` factory to get router instance for `afterEach`
- React: wraps `createBrowserRouter()` factory OR wraps `useRoutes()` hook
- Angular: provider with `inject(Router)` for `router.events` observable

### 3. View Name Algorithm (LLM Classification)

Read the selected hook's `availableApi` from `01-router-concepts.yaml`. Classify into one of three families (in preference order):

- **`route-id`** — Framework provides the parameterized route pattern as a string. Minimal post-processing needed (e.g. strip route groups). Example: SvelteKit `route.id`.
- **`matched-records`** — Framework provides matched route records (array or tree). Iterate and concatenate path segments. Handle catch-all substitution. Example: Vue `to.matched[]`, React `state.matches[]`.
- **`param-substitution`** — Framework provides only the evaluated pathname + params object. Must reconstruct the route template by substituting values back with placeholders. Least preferred — heuristic and fragile. Example: Next.js `useParams()` + `usePathname()`.

### 4. Target Package (LLM Judgment)

Determine whether this router needs a new package or extends an existing one.

- **`new-package`** — The router belongs to a framework with no existing SDK package (e.g., SvelteKit, Angular). Create `packages/rum-<framework>/`.
- **`extend-existing`** — The router is an alternative router for a framework that already has an SDK package (e.g., TanStack Router is a React router → extends `rum-react`). Add files under a subdirectory within the existing package.

To decide: check if `packages/rum-*` already has a package for the same UI framework (React, Vue, etc.). If yes, extend it. If no, create new.

For extend-existing, also determine the subdirectory path for the new router files (e.g., `src/domain/tanstackRouter/`).

### 5. Reference Implementation

Select the `packages/rum-*` implementation that is closest across:

- Hook subscription pattern
- Wrapping strategy
- Algorithm family

Stage 3 reads this implementation as its primary model for code generation.

### 6. SSR Handling (LLM Judgment)

If `ssr.supported: true` in `01-router-concepts.yaml`, describe how the integration should ensure client-side-only execution. Use the `clientDetection` API from Stage 1 if available.

## Output Schema

Write `docs/integrations/<framework>/02-design-decisions.yaml`.

Read `output.schema.yaml` (next to this SKILL.md) for the schema and field descriptions. See `docs/integrations/_example/02-design-decisions.yaml` for a filled-in example.

## Exit Criteria

If the hook selection process finds no hook with `afterCancellation: true`, this is a critical issue — the framework cannot reliably report navigations. Write `EXIT.md` with the reason and stop.

If during analysis you discover a framework concept that is required for the integration to work but has no SDK equivalent, document it in `notes` and stop the pipeline.
