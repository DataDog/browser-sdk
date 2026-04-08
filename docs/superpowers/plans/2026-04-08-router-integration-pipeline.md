# Router Integration Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully automated Claude Code skill pipeline that generates draft Browser SDK router integration PRs from framework public documentation.

**Architecture:** Six Claude Code skills (one orchestrator + five stage skills), each in its own subdirectory under `.claude/skills/` with a `SKILL.md` entry point. Each stage reads/writes markdown artifacts in `docs/integrations/<framework>/`. The orchestrator chains stages sequentially with early-exit conditions.

**Tech Stack:** Claude Code skills (markdown), Bash (git/gh CLI), WebFetch (doc fetching), existing SDK reference implementations as examples.

**Spec:** `docs/superpowers/specs/2026-04-08-router-integration-pipeline-design.md`

---

## File Structure

```text
.claude/skills/
├── router-pipeline/SKILL.md       # Orchestrator — /router:pipeline
├── router-fetch-docs/SKILL.md     # Stage 1 — /router:fetch-docs
├── router-analyze/SKILL.md        # Stage 2 — /router:analyze
├── router-design/SKILL.md         # Stage 3 — /router:design
├── router-generate/SKILL.md       # Stage 4 — /router:generate
└── router-pr/SKILL.md             # Stage 5 — /router:pr
```

Runtime artifacts (created per invocation):

```text
docs/integrations/<framework>/
├── 00-pipeline-input.md
├── 01-router-concepts.md
├── 02-sdk-mapping.md
├── 03-design-decisions.md
├── 04-generation-manifest.md
└── EXIT.md               # Only on early exit
```

---

### Task 1: Create the orchestrator skill

**Files:**

- Create: `.claude/skills/router-pipeline/SKILL.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p .claude/skills/router-pipeline
```

- [ ] **Step 2: Write the orchestrator skill**

Create `.claude/skills/router-pipeline/SKILL.md`:

```markdown
---
name: router:pipeline
description: Fully automated pipeline that generates a draft Browser SDK router integration PR from framework public docs. Usage: /router:pipeline <framework> <doc-url> [<doc-url>...]
---

# Router Integration Pipeline

You are an orchestrator that chains five stage skills to generate a complete Browser SDK router integration package and draft PR.

## Input

Parse the arguments: first argument is the framework name (lowercase), remaining arguments are documentation URLs.

Example: `/router:pipeline svelte https://svelte.dev/docs/kit/routing`

## Step 1: Initialize

Create the artifact directory and write the input file:

```bash
mkdir -p docs/integrations/<framework>
```

Write `docs/integrations/<framework>/00-pipeline-input.md`:

```markdown
# Pipeline Input

**Framework:** <framework>
**Documentation URLs:**
- <url1>
- <url2>
**Initiated:** <ISO timestamp>
```

## Step 2: Invoke /router:fetch-docs

Use the Skill tool to invoke `router:fetch-docs`.

After completion, read `docs/integrations/<framework>/01-router-concepts.md` and check the `compatible` field.

If `compatible: false`, write `docs/integrations/<framework>/EXIT.md` with:
- Stage: fetch-docs
- Reason: the incompatibility reason from 01-router-concepts.md
- Artifacts produced: 00-pipeline-input.md, 01-router-concepts.md

Then stop and report the exit to the user.

## Step 3: Invoke /router:analyze

Use the Skill tool to invoke `router:analyze`.

After completion, read `docs/integrations/<framework>/02-sdk-mapping.md` and check for any concept marked `unmapped` with severity `critical`.

If critical unmapped concepts exist, write `EXIT.md` with:
- Stage: analyze
- Reason: which critical concepts could not be mapped and why
- Artifacts produced: 00-pipeline-input.md, 01-router-concepts.md, 02-sdk-mapping.md

Then stop and report the exit to the user.

## Step 4: Invoke /router:design

Use the Skill tool to invoke `router:design`.

## Step 5: Invoke /router:generate

Use the Skill tool to invoke `router:generate`.

## Step 6: Invoke /router:pr

Use the Skill tool to invoke `router:pr`.

## Error Handling

If any stage fails (fetch timeout, parse error, tool failure), write `EXIT.md` with:
- Stage: which stage failed
- Reason: error details
- Artifacts produced: list of files written before failure

All artifacts written before the failure are preserved. Stop and report the failure to the user.
```

- [ ] **Step 3: Verify the skill is discoverable**

```bash
head -5 .claude/skills/router-pipeline/SKILL.md
```

Expected: the frontmatter with `name: router:pipeline`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/router-pipeline/SKILL.md
git commit -m "✨ Add router:pipeline orchestrator skill"
```

---

### Task 2: Create the fetch-docs skill (Stage 1)

**Files:**

- Create: `.claude/skills/router-fetch-docs/SKILL.md`

- [ ] **Step 1: Create the skill directory and write the skill**

```bash
mkdir -p .claude/skills/router-fetch-docs
```

Create `.claude/skills/router-fetch-docs/SKILL.md`:

```markdown
---
name: router:fetch-docs
description: "Stage 1: Fetch framework router documentation and extract structured routing concepts. Reads input from docs/integrations/<framework>/00-pipeline-input.md."
---

# Stage 1: Fetch Router Documentation

## Context

You are Stage 1 of the router integration pipeline. Your job is to fetch framework router documentation, extract structured routing concepts, and assess compatibility with the Browser SDK router integration model.

## Input

Read `docs/integrations/<framework>/00-pipeline-input.md` to get the framework name and documentation URLs. Find the `<framework>` directory by listing `docs/integrations/` and finding the most recently created subdirectory.

## Process

### 1. Fetch Documentation

Use the WebFetch tool to fetch each documentation URL. If a URL fails, note it and continue with remaining URLs. If all URLs fail, write EXIT.md and stop.

### 2. Extract Router Concepts

Analyze the fetched documentation and produce a structured summary covering these sections. Every factual claim MUST be inline-linked to the source URL and section where you found it.

Unsourced claims must be marked as *inferred: <reasoning>*.

#### Required Sections

**Route Definition Format**
How routes are declared: config object, file-based routing, decorators, or other. Include code examples from the docs.

**Dynamic Segment Syntax**
What syntax the framework uses for parameterized route segments (e.g. `:id`, `[id]`, `{id}`). Include examples.

**Catch-All / Wildcard Syntax**
What syntax the framework uses for catch-all or wildcard routes (e.g. `*`, `**`, `[...slug]`, `/:pathMatch(.*)*`). Include examples. If the framework has no catch-all syntax, state that explicitly.

**Navigation Lifecycle Hooks**
List every navigation lifecycle event/hook the framework exposes, in the order they fire. For each, describe:
- When it fires relative to other hooks
- What data is available at that point
- Whether it can cancel/redirect navigation

**Navigation Lifecycle Timing**
This is the most critical section. Determine:
- Where in the lifecycle do **redirects** resolve?
- Where do **data fetches** (loaders, resolvers) execute?
- Where does **component rendering** begin?

The SDK wants to start a view **as early as possible** but:
1. **After redirects** — so the view name reflects the final destination
2. **Before data fetches** — so loader/resolver network requests are attributed to the correct view
3. **Before component rendering** — so rendering work is attributed to the correct view

Identify the ideal hook point. If no single hook satisfies all three constraints, document the trade-off and rank the available options from best to worst, explaining what is lost with each.

Reference how existing integrations solve this:
- Angular uses [`GuardsCheckEnd`](packages/rum-angular/src/domain/angularRouter/provideDatadogRouter.ts) (after guards/redirects, before resolvers)
- Vue uses [`afterEach`](packages/rum-vue/src/domain/router/vueRouter.ts) (after everything including render)
- React uses [`subscribe`](packages/rum-react/src/domain/reactRouter/createRouter.ts) (after state change)

**Route Matching Model**
How the framework matches URLs to routes: nested vs flat, layout routes, named outlets/slots, parallel routes.

**Programmatic Navigation API**
How the router exposes current route state and navigation methods. What objects/hooks are available to read the current route, its params, and matched route records.

### 3. Compatibility Assessment

At the end of the document, include a `## Compatibility` section with:

- `compatible: true` or `compatible: false`
- If false, a `reason:` field explaining why

A framework is **incompatible** if it lacks:
- A client-side route tree or route matching mechanism
- Dynamic segment parameters
- Navigation lifecycle events that can be hooked into
- Examples: Shopify Hydrogen (server-only loaders), Salesforce Lightning (proprietary component model)

A framework is **compatible** even if:
- It uses file-based routing (as long as there's a runtime route representation)
- Some hooks fire later than ideal (trade-off is documented, not a blocker)

## Output

Write the result to `docs/integrations/<framework>/01-router-concepts.md`.
```

- [ ] **Step 2: Verify the skill file**

```bash
head -5 .claude/skills/router-fetch-docs/SKILL.md
```

Expected: frontmatter with `name: router:fetch-docs`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/router-fetch-docs/SKILL.md
git commit -m "✨ Add router:fetch-docs skill (Stage 1)"
```

---

### Task 3: Create the analyze skill (Stage 2)

**Files:**

- Create: `.claude/skills/router-analyze/SKILL.md`

- [ ] **Step 1: Create the skill directory and write the skill**

```bash
mkdir -p .claude/skills/router-analyze
```

Create `.claude/skills/router-analyze/SKILL.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/router-analyze/SKILL.md
git commit -m "✨ Add router:analyze skill (Stage 2)"
```

---

### Task 4: Create the design skill (Stage 3)

**Files:**

- Create: `.claude/skills/router-design/SKILL.md`

- [ ] **Step 1: Create the skill directory and write the skill**

```bash
mkdir -p .claude/skills/router-design
```

Create `.claude/skills/router-design/SKILL.md`:

```markdown
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
- `src/domain/error/` — error handling files
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

**Navigation Filtering**
How failed, duplicate, query-only, and initial navigations are handled.

**Error Handler Integration**
How the framework's error handling mechanism will be integrated, following the pattern from reference implementations:
- Angular: [`provideDatadogErrorHandler`](packages/rum-angular/src/domain/error/provideDatadogErrorHandler.ts)
- Vue: [`addVueError`](packages/rum-vue/src/domain/error/addVueError.ts)
- React: [`ErrorBoundary`](packages/rum-react/src/domain/error/errorBoundary.ts)

**Test Strategy**
List every test case to implement, grouped by file:
- `<framework>Plugin.spec.ts`: plugin structure, subscriber callbacks, telemetry, trackViewsManually
- `start<Framework>View.spec.ts`: all view name computation cases (static, dynamic, nested, catch-all, edge cases)
- Router integration spec: navigation event handling, filtering, deduplication
- Error handler spec: error reporting, context merging

**Trade-offs and Alternatives**
Document any decisions where multiple valid approaches existed. For each, state what was chosen, what was rejected, and why.

## Output

Write the result to `docs/integrations/<framework>/03-design-decisions.md`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/router-design/SKILL.md
git commit -m "✨ Add router:design skill (Stage 3)"
```

---

### Task 5: Create the generate skill (Stage 4)

**Files:**

- Create: `.claude/skills/router-generate/SKILL.md`

- [ ] **Step 1: Create the skill directory and write the skill**

```bash
mkdir -p .claude/skills/router-generate
```

Create `.claude/skills/router-generate/SKILL.md`:

```markdown
---
name: router:generate
description: "Stage 4: Generate the complete router integration package from design artifacts and reference implementations."
---

# Stage 4: Generate Package

## Context

You are Stage 4 of the router integration pipeline. Your job is to generate a complete, working Browser SDK router integration package based on the design decisions from Stage 3 and the patterns from reference implementations.

## Input

1. Read `docs/integrations/<framework>/01-router-concepts.md`
2. Read `docs/integrations/<framework>/02-sdk-mapping.md`
3. Read `docs/integrations/<framework>/03-design-decisions.md` — this is your primary guide
4. Read reference implementations for code patterns (read the actual source files, not summaries):
   - The reference implementation identified as "closest" in the design doc
   - Plugin: e.g. `packages/rum-vue/src/domain/vuePlugin.ts`
   - Router: e.g. `packages/rum-vue/src/domain/router/`
   - Error: e.g. `packages/rum-vue/src/domain/error/`
   - Tests: corresponding `.spec.ts` files
   - Test helper: e.g. `packages/rum-vue/src/test/initializeVuePlugin.ts`
   - Package config: e.g. `packages/rum-vue/package.json`, `packages/rum-vue/tsconfig.json`
   - Entry point: e.g. `packages/rum-vue/src/entries/main.ts`

Find the `<framework>` directory by listing `docs/integrations/`.

## Process

### 1. Generate Each File

Follow the file structure defined in `03-design-decisions.md`. For each file:

1. Read the corresponding reference implementation file
2. Adapt it to the target framework using the mappings from `02-sdk-mapping.md` and decisions from `03-design-decisions.md`
3. Write the file using the Write tool

**Code conventions** (from `AGENTS.md`):
- Use **camelCase** for all internal variables and object properties
- Conversion to snake_case happens at serialization boundary only
- Use TypeScript type narrowing over runtime assertions
- Follow existing patterns exactly — match import style, export style, comment style

**Plugin file** (`<framework>Plugin.ts`):
- Follow the exact pattern from the reference: global state, subscriber arrays, `onRumInit`/`onRumStart` exports, `reset<Framework>Plugin` for tests
- Plugin name must be the framework name in lowercase
- Configuration interface with `router?: boolean`
- `getConfigurationTelemetry` returning `{ router: !!configuration.router }`

**Router integration files**:
- `types.ts`: minimal interface for route-related types, avoiding runtime framework imports where possible
- `start<Framework>View.ts`: `computeViewName()` + `start<Framework>RouterView()` calling `onRumInit`
- Integration point file: the framework-specific wrapper/provider/hook

**Error files**:
- Follow the reference pattern: capture error + stack + timing, defer via `onRumStart`
- Include `dd_context` merging from original error

**Test files**:
- Follow Jasmine conventions: `describe`/`it` blocks
- Use `registerCleanupTask()` for cleanup, NOT `afterEach()`
- Use the test helper for plugin initialization
- Cover every test case listed in `03-design-decisions.md`

**package.json**:
- Follow the reference `package.json` structure exactly
- Set version to match current monorepo version (read from a reference package)
- Set correct peer dependencies from `02-sdk-mapping.md`
- Include both ESM and CJS entry points

**tsconfig.json**:
- Copy from nearest reference package, adjust paths

**README.md**:
- Follow the reference README structure
- Include setup instructions matching the public API from `03-design-decisions.md`

### 2. Write Generation Manifest

After all files are generated, write `docs/integrations/<framework>/04-generation-manifest.md`:

```markdown
# Generation Manifest

## Generated Files

| File | Purpose | Modeled After | Deviations |
|------|---------|---------------|------------|
| `packages/rum-<fw>/src/domain/<fw>Plugin.ts` | Plugin + subscriber pattern | [`vuePlugin.ts`](packages/rum-vue/src/domain/vuePlugin.ts) | None |
| ... | ... | ... | ... |
```

For each file, link to the reference file it was modeled after. If there are deviations from the reference pattern, explain why.

## Output

- Generated package in `packages/rum-<framework>/`
- Manifest at `docs/integrations/<framework>/04-generation-manifest.md`
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/router-generate/SKILL.md
git commit -m "✨ Add router:generate skill (Stage 4)"
```

---

### Task 6: Create the PR skill (Stage 5)

**Files:**

- Create: `.claude/skills/router-pr/SKILL.md`

- [ ] **Step 1: Create the skill directory and write the skill**

```bash
mkdir -p .claude/skills/router-pr
```

Create `.claude/skills/router-pr/SKILL.md`:

```markdown
---
name: router:pr
description: "Stage 5: Create a git branch, commit artifacts and generated code, and open a draft PR on GitHub."
---

# Stage 5: Create Draft PR

## Context

You are Stage 5 of the router integration pipeline. Your job is to create a branch, commit all generated artifacts and code, and open a draft PR on GitHub.

## Input

1. Read `docs/integrations/<framework>/03-design-decisions.md` for PR body content
2. Read `docs/integrations/<framework>/04-generation-manifest.md` for the list of generated files
3. Determine the current git user name from `git config user.name` (for branch naming)

Find the `<framework>` directory by listing `docs/integrations/`.

## Process

### 1. Create Branch

```bash
# Get the current user's branch prefix
USER=$(git config user.name | tr ' ' '.' | tr '[:upper:]' '[:lower:]')
BRANCH="${USER}/<framework>-router-integration"

git checkout -b "$BRANCH"
```

### 2. Commit Artifacts

First commit: design documentation only.

```bash
git add docs/integrations/<framework>/
git commit -m "📝 Add <framework> router integration design docs

Generated by the router integration pipeline.
Artifacts: pipeline input, router concepts, SDK mapping, design decisions, generation manifest."
```

### 3. Commit Generated Package

Second commit: the generated package.

```bash
git add packages/rum-<framework>/
git commit -m "✨ Add <framework> router integration package

Auto-generated from framework documentation using the router integration pipeline.
See docs/integrations/<framework>/ for design artifacts and decision rationale."
```

### 4. Push and Create Draft PR

```bash
git push -u origin "$BRANCH"
```

Then use `gh pr create` with this structure:

```bash
gh pr create --draft --title "✨ Add <framework> router integration" --body "$(cat <<'PREOF'
## Summary

Auto-generated router integration for <framework> using the router integration pipeline.

- Router view tracking via `startView()` on route changes
- Error handler integration
- Unit tests for view name computation and navigation filtering

## Design Artifacts

Full design trail at `docs/integrations/<framework>/`:
- `01-router-concepts.md` — extracted routing concepts from framework docs
- `02-sdk-mapping.md` — mapping to existing SDK patterns
- `03-design-decisions.md` — architecture and API decisions
- `04-generation-manifest.md` — list of generated files with lineage

## Key Decisions

<Summarize the 3-4 most important decisions from 03-design-decisions.md here, with one sentence each>

## Test plan

- [ ] Review design artifacts in `docs/integrations/<framework>/`
- [ ] Review generated code against reference implementations
- [ ] Run `yarn typecheck` to verify type correctness
- [ ] Run `yarn test:unit --spec packages/rum-<framework>/` to verify tests pass
- [ ] Manual review of `computeViewName()` edge cases

🤖 Generated with the router integration pipeline
PREOF
)"
```

Replace `<framework>` with the actual framework name. Replace the key decisions placeholder with actual content from `03-design-decisions.md`.

## Output

Report the PR URL to the user.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/router-pr/SKILL.md
git commit -m "✨ Add router:pr skill (Stage 5)"
```

---

### Task 7: End-to-end validation

**Files:**

- No new files — validation only

- [ ] **Step 1: Verify all six skill directories exist**

```bash
ls -d .claude/skills/router-*/
```

Expected: `router-pipeline/`, `router-fetch-docs/`, `router-analyze/`, `router-design/`, `router-generate/`, `router-pr/`

- [ ] **Step 2: Verify each skill has correct frontmatter**

```bash
for f in .claude/skills/router-*/SKILL.md; do
  echo "=== $f ==="
  head -4 "$f"
  echo
done
```

Expected: each file has `---` delimiters with `name:` and `description:` fields. Names should be: `router:pipeline`, `router:fetch-docs`, `router:analyze`, `router:design`, `router:generate`, `router:pr`.

- [ ] **Step 3: Verify the orchestrator references all stage skills**

```bash
grep -n "router:" .claude/skills/router-pipeline/SKILL.md
```

Expected: references to all five stage skill names (`router:fetch-docs`, `router:analyze`, `router:design`, `router:generate`, `router:pr`).

- [ ] **Step 4: Commit if any uncommitted changes remain**

```bash
git status
```

If there are uncommitted changes:

```bash
git add .claude/skills/router-*/SKILL.md
git commit -m "🔧 Final adjustments to router integration pipeline skills"
```
