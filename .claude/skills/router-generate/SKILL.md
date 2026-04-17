---
name: router-generate
description: 'Stage 3: Generate the complete router integration package from design artifacts and reference implementations.'
---

# Stage 3: Generate Package

## Context

You are Stage 3 of the router integration pipeline. Your job is to generate a complete, working Browser SDK router integration package based on the design decisions from Stage 2 and the patterns from reference implementations.

## Input

You receive a **framework identifier** as skill param (e.g. `angular`, `vue`, `tanstack-react-router`).

Read:

1. `docs/integrations/<framework>/01-router-concepts.json` — stage 1 CLI wrapper. Extract the router-concepts payload with `jq '.structured_output' <file>`.
2. `docs/integrations/<framework>/02-design-decisions.json` — stage 2 CLI wrapper. Extract the design payload with `jq '.structured_output' <file>`.
3. `.claude/skills/router-fetch-docs/output.schema.json` — field definitions for stage 1 output.
4. `.claude/skills/router-design/output.schema.json` — field definitions for stage 2 output.
5. Reference implementation specified by `referenceImplementation.primary` in the stage 2 payload. Read the source files in `packages/<referenceImplementation.primary>/`:
   - Plugin file: `src/domain/*Plugin.ts`
   - Router files: `src/domain/*Router/` or `src/domain/router/` (all `.ts` files)
   - Tests: corresponding `.spec.ts` files
   - Test helper: `src/test/initialize*Plugin.ts`
   - Package config: `package.json`, `tsconfig.json`
   - Entry point: `src/entries/main.ts`

## Process

Generate files in two phases. Complete each phase before starting the next.

---

### Phase 1: Plugin + Wrapping Strategy

Generate the plugin file and the framework-specific integration point. This phase reads `targetPackage`, `wrappingStrategy`, and `selectedHook` from `02-design-decisions.json`.

**Check `targetPackage.mode` first:**

- **`new-package`**: Create the full package scaffolding (`package.json`, `tsconfig.json`, `README.md`, `src/entries/main.ts`, `src/test/initialize<Framework>Plugin.ts`) by reading from the reference implementation. Then generate plugin + integration files.
- **`extend-existing`**: The package already exists at `packages/<targetPackage.package>/`. Do NOT create package scaffolding. Add router files under `targetPackage.subpath` (e.g., `src/domain/tanstackRouter/`). Update `src/entries/main.ts` to add new exports. Update `package.json` to add new peer dependencies if needed. The existing plugin file may need a new configuration option or the new router may reuse the existing plugin's `onRumInit`/`onRumStart` subscribers.

**Files to generate:**

For `new-package`:

- `src/domain/<framework>Plugin.ts` — plugin lifecycle, subscriber pattern, configuration
- Integration point file — hook subscription
- `src/domain/<framework>Plugin.spec.ts` — plugin structure tests

For `extend-existing`:

- Integration point file under `targetPackage.subpath` — hook subscription
- View name and types files under `targetPackage.subpath`
- Tests under `targetPackage.subpath`
- Modify `src/entries/main.ts` — add exports for the new router
- Modify `package.json` — add peer dependencies if needed

**Plugin file** (only for `new-package`):

- Follow the exact pattern from the reference: global state, subscriber arrays, `onRumInit`/`onRumStart` exports, `reset<Framework>Plugin` for tests
- Plugin name must be the framework name in lowercase
- Configuration interface with `router?: boolean`
- `getConfigurationTelemetry` returning `{ router: !!configuration.router }`

**Integration point file:**

The wrapping strategy from `02-design-decisions.json` determines what this file looks like:

- `wrap-factory` → wrap the framework's router creation function, subscribe to hook inside
- `renderless-component` → Svelte/React component that calls the hook during lifecycle
- `provider` → DI provider that injects the router and subscribes to events
- `wrap-hook` → wrap a user-facing hook to intercept route data

Read the selected hook's `access` and `availableApi` from `01-router-concepts.json` to understand what data is available and how to reach it.

If `ssr.handling` is not "N/A", add the client-side guard described there.

---

### Phase 2: View Name Algorithm

Generate the view name computation, types, and tests. This phase reads `viewNameAlgorithm` and `routeSyntax` from the design artifacts.

**Files to generate:**

- `src/domain/<framework>Router/start<Framework>View.ts` — `computeViewName()` + `start<Framework>RouterView()`. Driven by `viewNameAlgorithm.family`.
- `src/domain/<framework>Router/types.ts` — minimal local types for route data. Driven by `selectedHook.availableApi`.
- `src/domain/<framework>Router/start<Framework>View.spec.ts` — view name computation tests. Driven by `routeSyntax.examples`.

**`computeViewName()` implementation by family:**

- **`route-id`**: Framework provides route pattern as string. Implementation is minimal — mostly cleanup (e.g., strip route groups). Model after the simplest reference.
- **`matched-records`**: Iterate matched route records, concatenate `.path` fields. Handle absolute vs relative paths. Substitute catch-all patterns with actual path segments. Model after `packages/rum-vue/src/domain/router/startVueRouterView.ts` or `packages/rum-react/src/domain/reactRouter/startReactRouterView.ts`.
- **`param-substitution`**: Reverse-engineer route template from pathname + params. Two-pass: catch-all arrays first, then string params. Model after `packages/rum-nextjs/src/domain/nextJSRouter/computeViewNameFromParams.ts`.

**Test cases:**

Read the reference implementation's test files first. Match the same coverage and writing style:

- Same `describe`/`it` structure and naming conventions
- Same test case table format (e.g., `const cases = [...]` with inline comments)
- Same helper patterns (mock setup, cleanup)
- Same level of edge case coverage

Then adapt test cases for the target framework:

- Start from `routeSyntax.examples` in `01-router-concepts.json` — each example maps to a test case
- Add edge cases by looking at what the reference test covers and translating to the target framework's syntax
- Every `routeSyntax.concept` must have at least one test case

**Types file:**

- Define minimal interfaces matching what the selected hook's `availableApi` exposes
- Avoid runtime framework imports — use local type definitions
- Only type what `computeViewName()` and the integration point actually need

---

### Phase 3: Validate & Fix

Run the monorepo toolchain against the generated code. Fix failures in a bounded loop. Only modify files you generated in Phase 1 and Phase 2 — never touch reference implementations, core packages, or config files outside the generated package.

**1. Register the package in the workspace:**

```bash
yarn
```

For `new-package` mode, verify it appears in `yarn workspaces list`.

**2. Run all checks, fix, repeat — up to 5 iterations:**

```
checks = [typecheck, lint, unit tests]

for iteration in 1..5:
    run `yarn format`
    run `yarn typecheck` → capture errors
    run `yarn lint` → capture errors
    run `yarn test:unit --spec packages/rum-<framework>/` → capture errors

    if all pass → done, break

    analyze ALL errors together
    apply fixes to generated files only
    log what was fixed and why

if iteration 5 still has failures → stop, document in manifest
```

**Checks (run all three every iteration):**

| Command                                           | What it catches                                          |
| ------------------------------------------------- | -------------------------------------------------------- |
| `yarn typecheck`                                  | Wrong imports, missing properties, mismatched interfaces |
| `yarn lint`                                       | Naming, formatting (mostly auto-fixed by `yarn format`)  |
| `yarn test:unit --spec packages/rum-<framework>/` | Wrong mock shapes, assertion mismatches, missing cleanup |

Running all three every iteration (instead of gating sequentially) lets you see the full error surface and fix multiple categories at once.

**Fix strategy:**

- Read ALL errors before making any changes — fixes often overlap
- Compare with the reference implementation's source and test files to spot pattern mismatches
- Prefer the smallest change that fixes the error

**Anti-rules — never do these to "fix" a failure:**

- Add `// @ts-ignore`, `as any`, or type casts to silence type errors
- Delete or skip failing test cases

## After All Phases: Write Generation Manifest

Write `docs/integrations/<framework>/03-generation-manifest.md` using the template at `output.template.md` (next to this SKILL.md). Fill in every placeholder. The validation section documents all fix loop iterations.

If validation status is `fail`, the pipeline orchestrator must stop before creating a PR.

## Output

- Generated package in `packages/rum-<framework>/`
- Manifest at `docs/integrations/<framework>/03-generation-manifest.md`
