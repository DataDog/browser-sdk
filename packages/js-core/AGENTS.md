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

### Sub-path exports only

All APIs live under a named sub-path (e.g. `@datadog/js-core/time`). There is no root entry
point. Each sub-path corresponds to a single source file under `src/`.

Each sub-path is exposed two ways so it resolves in both modern and legacy tooling:

- The `"exports"` field — used by modern resolvers (webpack 5, Vite, esbuild, Rollup, Node ≥12.7,
  TS `node16`/`nodenext`/`bundler`). Gives encapsulation and explicit `import`/`require`/`types`
  conditions.
- A physical `<name>/package.json` fallback (relative `main`/`module`/`types`) — used by resolvers
  that ignore `"exports"` (webpack 4, old Node, older Jest/ts-node). `"exports"` takes precedence
  wherever it's understood, so this only kicks in for legacy tooling. This package is published
  transitively to all Browser SDK consumers, so the fallback protects customers on older bundlers.

When adding a new sub-path:

1. Create `src/<name>.ts`
2. Add `"./<name>"` to the `exports` field in `package.json`
3. Add a physical fallback `<name>/package.json` with relative `main`/`module`/`types` (see
   `time/package.json`), and add `"<name>"` to the `files` array so it ships in the package
4. Add `"@datadog/js-core/<name>"` to the `paths` map in the root `tsconfig.base.json`

## Current sub-paths

| Sub-path                | Source file   | Description    |
| ----------------------- | ------------- | -------------- |
| `@datadog/js-core/time` | `src/time.ts` | Time utilities |
