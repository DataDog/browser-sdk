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
