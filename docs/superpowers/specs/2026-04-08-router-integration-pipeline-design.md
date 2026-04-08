# Router Integration Pipeline — Design Spec

## Overview

A fully automated Claude Code skill pipeline that generates draft Browser SDK router integration PRs from framework public documentation. The pipeline fetches framework router docs, analyzes concepts, maps them to existing SDK patterns, generates a complete package with tests, and opens a draft PR — with no human intervention until the PR is ready for review.

## Invocation

```
/router:pipeline <framework> <doc-url> [<doc-url>...]
```

Example:
```
/router:pipeline svelte https://svelte.dev/docs/kit/routing
```

## Architecture

### Approach: Hybrid — Orchestrator + Stage Skills

Six skills total: one orchestrator that chains five stage skills sequentially. Each stage produces a durable markdown artifact in `docs/integrations/<framework>/`. Individual stage skills can be re-run independently.

### Pipeline Flow

```
/router:pipeline
  │
  ├─ /router:fetch-docs     → 01-router-concepts.md
  │    └─ EXIT if incompatible framework
  │
  ├─ /router:analyze        → 02-sdk-mapping.md
  │    └─ EXIT if critical concepts unmapped
  │
  ├─ /router:design         → 03-design-decisions.md
  │
  ├─ /router:generate       → 04-generation-manifest.md + packages/rum-<framework>/
  │
  └─ /router:pr             → Draft PR on GitHub
```

No human gates. Early exits produce an `EXIT.md` alongside whatever artifacts were written.

## Artifacts

All artifacts live in `docs/integrations/<framework>/`.

### Source Reference Convention

Every factual claim in every artifact is inline-linked to its source — either an external doc URL or an internal file path with line range. Unsourced claims are explicitly marked as *inferred: \<reasoning\>*.

Example:
```markdown
Routes use [`:param` syntax](https://svelte.dev/docs/kit/routing#dynamic-parameters)
for dynamic segments, equivalent to Angular's
[`:id` in route config path](packages/rum-angular/src/domain/angularRouter/startAngularView.ts#L15-L28).
```

### `01-router-concepts.md` (Stage 1 output)

Structured extraction from framework docs:

- **Route definition format** — config object, file-based, decorators
- **Dynamic segment syntax** — `:id`, `[id]`, `{id}`, etc.
- **Catch-all/wildcard syntax** — `*`, `**`, `[...slug]`, etc.
- **Navigation lifecycle hooks** — which events fire and when
- **Navigation lifecycle timing** — specifically: where in the lifecycle do redirects resolve, and where do data fetches (loaders/resolvers) execute? The SDK wants to start a view as early as possible but after redirects and before both data fetches (loaders/resolvers) and component rendering, so that all resource loading and rendering work is attributed to the correct view. If no single hook satisfies all three constraints (after redirects, before data fetches, before render), document the trade-off and rank the options. Reference how existing integrations solve this: Angular uses [`GuardsCheckEnd`](packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.ts) (after guards/redirects, before resolvers), Vue uses [`afterEach`](packages/rum-vue/src/domain/router/vueRouter.ts) (after everything), React uses [`subscribe`](packages/rum-react/src/domain/reactRouter/createRouter.ts) (after state change).
- **Route matching model** — nested vs flat, outlets, layouts
- **Programmatic navigation API** — how router exposes state
- **`compatible`** — boolean flag. `false` if the framework lacks a client-side route tree, dynamic segments, or navigation lifecycle events

### `02-sdk-mapping.md` (Stage 2 output)

Maps each framework concept to its SDK equivalent by reading reference implementations ([rum-angular](packages/rum-angular/), [rum-react](packages/rum-react/), [rum-vue](packages/rum-vue/)):

- Navigation event → equivalent of Angular's [`GuardsCheckEnd`](packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.ts), Vue's [`afterEach`](packages/rum-vue/src/domain/router/vueRouter.ts), React's [`subscribe`](packages/rum-react/src/domain/reactRouter/createRouter.ts)
- Dynamic segment syntax → `computeViewName` normalization strategy
- Catch-all handling → substitution approach
- Route tree shape → traversal algorithm
- Framework DI/plugin model → wrapping strategy (provider, hook, wrapper, plugin install)
- Peer dependencies needed
- Concepts marked `unmapped` if no SDK equivalent exists (with severity: `critical` or `minor`)

### `03-design-decisions.md` (Stage 3 output)

Design document covering:

- Architecture decisions with rationale
- Public API surface (what the user imports and calls)
- File structure plan
- Test strategy and edge cases to cover
- Trade-offs and alternatives considered

### `04-generation-manifest.md` (Stage 4 output)

Listing of every generated file:

- File path
- Purpose (one line)
- Which reference file it was modeled after (linked)
- Deviations from the reference pattern and why

### `EXIT.md` (on early exit only)

Written when the pipeline exits before completion:

- Which stage failed or exited
- Reason with source links supporting the exit decision
- List of artifacts produced before exit

## Stage Details

### Stage 1: `/router:fetch-docs`

**Input:** Framework name + doc URL(s)
**Output:** `01-router-concepts.md`

Fetches and parses the provided URLs. Extracts the structured summary described above. Performs compatibility check — flags frameworks that lack standard routing concepts (no client-side route tree, no dynamic segments, no navigation events). Examples of incompatible frameworks: Shopify Hydrogen (server-only loaders), Salesforce Lightning (proprietary component model).

### Stage 2: `/router:analyze`

**Input:** `01-router-concepts.md` + reference implementations in `packages/rum-angular/`, `packages/rum-react/`, `packages/rum-vue/`
**Output:** `02-sdk-mapping.md`

Reads reference implementations to understand the common contract:
- [Plugin interface](packages/rum-core/src/domain/plugins.ts) — `RumPlugin` with `onInit`/`onRumStart`
- [Public API](packages/rum-core/src/boot/rumPublicApi.ts) — `startView()` method
- `computeViewName()` implementations across all three reference packages
- Navigation event subscription patterns

Maps each concept from Stage 1 to an SDK equivalent. Exits if critical concepts (navigation event, route tree access) have no mapping.

### Stage 3: `/router:design`

**Input:** `01-router-concepts.md` + `02-sdk-mapping.md`
**Output:** `03-design-decisions.md`

Produces the design document. Synthesizes the mapping into concrete decisions: which files to create, what the public API looks like, how tests are structured. References both the framework docs and the SDK patterns that informed each decision.

### Stage 4: `/router:generate`

**Input:** All previous artifacts + reference implementations
**Output:** `packages/rum-<framework>/` + `04-generation-manifest.md`

Generates the package structure:

```
packages/rum-<framework>/
├── src/
│   ├── entries/
│   │   └── main.ts
│   ├── domain/
│   │   ├── <framework>Plugin.ts
│   │   ├── <framework>Plugin.spec.ts
│   │   ├── <framework>Router/
│   │   │   ├── start<Framework>View.ts
│   │   │   ├── start<Framework>View.spec.ts
│   │   │   ├── types.ts
│   │   │   └── <integration-point>.ts
│   │   └── error/
│   │       ├── add<Framework>Error.ts
│   │       └── add<Framework>Error.spec.ts
│   └── test/
│       └── initialize<Framework>Plugin.ts
├── package.json
├── tsconfig.json
└── README.md
```

**Code generation approach:** The agent reads reference implementations as examples (not templates). It uses `02-sdk-mapping.md` and `03-design-decisions.md` to determine the specific logic for:
- `<integration-point>.ts` — shaped by which navigation hook to subscribe to
- `computeViewName()` — shaped by dynamic segment and catch-all syntax
- Plugin exposure — shaped by framework DI/plugin model

**Test generation:** Derived from two sources:
1. Common edge cases shared across all routers (from reference spec files): static paths, single/nested dynamic segments, empty/layout routes, catch-all/wildcard, duplicate navigation filtering, initial navigation
2. Framework-specific cases from `01-router-concepts.md`

### Stage 5: `/router:pr`

**Input:** Generated package + all artifacts
**Output:** Draft PR on GitHub

- Creates branch: `<user>/<framework>-router-integration`
- Two commits:
  1. `📝 Add <framework> router integration design docs`
  2. `✨ Add <framework> router integration package`
- Opens draft PR with body structured from `03-design-decisions.md`:
  - Summary of what was generated
  - Key design decisions
  - Link to `docs/integrations/<framework>/` for full artifact trail

## Scope Boundaries

### In scope
- Conventional SPA/SSR frontend frameworks with standard routing: route tree, dynamic params, navigation lifecycle (e.g. Svelte, Remix, Solid, Ember)
- Router integration (view tracking via `startView`)
- Error handler integration (following reference pattern)
- Unit tests for view name computation and navigation filtering

### Out of scope
- Non-conventional frameworks (Shopify Hydrogen, Salesforce Lightning, etc.) — pipeline exits early
- E2E tests — not generated, left for human follow-up
- Publishing/release automation
- Modifications to existing packages or rum-core

## Skill Location

Skills live in `.claude/skills/router-integration/`:

```text
.claude/skills/router-integration/
├── pipeline.md          # /router:pipeline — orchestrator
├── fetch-docs.md        # /router:fetch-docs
├── analyze.md           # /router:analyze
├── design.md            # /router:design
├── generate.md          # /router:generate
└── pr.md                # /router:pr
```

## Stage Input Convention

Each stage skill reads its inputs from the filesystem — no arguments are passed between skills except through the orchestrator's context:

- **Orchestrator** receives `<framework>` and `<doc-url>` as arguments, writes them to `docs/integrations/<framework>/00-pipeline-input.md`
- **Stage skills** read from `docs/integrations/<framework>/` for previous artifacts and from `packages/rum-angular/`, `packages/rum-react/`, `packages/rum-vue/` for reference implementations
- **Framework name** is derived from the directory name
