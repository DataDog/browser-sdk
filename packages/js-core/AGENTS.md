# `@datadog/js-core` package

`@datadog/js-core` is a **stable, runtime-agnostic** utility package consumed by various Datadog
JavaScript SDKs such as `electron-sdk`, `openfeature-js-client` as well as the Browser SDK packages.
It is versioned **independently** from the `@datadog/browser-*` release cadence.

## Non-negotiable rules

### No breaking changes

This package is consumed externally and has a semver stability guarantee. Never make a breaking
change in a patch or minor release. Breaking changes require a major version bump and must be
coordinated with all known consumers before release.

A breaking change includes:

- Removing or renaming an exported symbol
- Changing a function's signature (parameter types, return type, arity)
- Narrowing a previously accepted input type
- Changing observable runtime behavior that consumers depend on

When in doubt, add a new export rather than modifying an existing one.

### JSDoc on every export

Every exported function, type, and constant must have a JSDoc comment that covers:

- What it does (one-line summary)
- Why it exists / when to prefer it over the obvious alternative (if non-obvious)
- `@param` for each parameter (if the name alone is not self-explanatory)
- `@returns` describing the return value and its unit/format

### Runtime-agnostic exports only

Every export must work in both Node.js and browser environments. Do not add:

- DOM APIs (`document`, `window`, `navigator`, `performance.timing`, etc.)
- Node.js built-in modules (`fs`, `path`, `process`, etc.)
- Any API that is not available in both runtimes

### Sub-path exports

All APIs live under a named sub-path (e.g. `@datadog/js-core/time`). There is no root entry
point. Each sub-path corresponds to a single source file under `src/`.

Each sub-path is exposed **two ways** for maximum compatibility:

- **`exports` field** (root `package.json`) — used by modern resolvers (webpack 5, Vite, esbuild,
  Rollup, native Node ESM/CJS, TypeScript `node16`/`nodenext`/`bundler`). Maps the sub-path to the
  correct `import` (ESM), `require` (CJS), and `types` targets. The build emits `esm/package.json`
  with `{"type":"module"}` so Node.js correctly treats `esm/*.js` as ES modules (pass
  `--esm-type-module` to `build-package.ts`).
- **Physical `<name>/package.json` fallback** — used by legacy resolvers that ignore `exports`
  (webpack 4, old Node, older Jest/ts-node). Relative `main`/`module`/`types` pointing at the
  same built files.

When adding a new sub-path:

1. Create `src/<name>.ts`
2. Add `"./<name>"` to the `exports` field in `package.json` with `import`, `require`, and `types`
   conditions
3. Add a physical `<name>/package.json` with relative `main`/`module`/`types` (see
   `time/package.json`), and add `"<name>"` to the `files` array so it ships in the package
4. Add `"@datadog/js-core/<name>"` to the `paths` map in the root `tsconfig.base.json`

## Current sub-paths

| Sub-path                | Source file   | Description    |
| ----------------------- | ------------- | -------------- |
| `@datadog/js-core/time` | `src/time.ts` | Time utilities |
