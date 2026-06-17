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

Every export must work in both Node.js and browser environments without throwing. Do not add hard
dependencies on platform-specific APIs. Graceful fallbacks are acceptable — for example, reading
`performance.timing?.navigationStart` with optional chaining and falling back to
`performance.timeOrigin` for environments (Service Workers, Node.js) that lack it.

Do not add:

- DOM APIs (`document`, `window`, `navigator`, etc.) without a safe fallback
- Node.js built-in modules (`fs`, `path`, `process`, etc.)
- Any API that throws or produces incorrect results in a non-browser environment

### Sub-path exports

All APIs live under a named sub-path (e.g. `@datadog/js-core/time`). There is no root entry
point. Each sub-path corresponds to a single entry file under `src/entries/` — either the
implementation itself, or a thin barrel that re-exports from sibling implementation files under
`src/<name>/` (e.g. `src/entries/util.ts` re-exports from `src/util/display.ts` and
`src/util/debug.ts`).

Each sub-path is exposed **two ways** for maximum compatibility:

- **`exports` field** (root `package.json`) — used by modern resolvers (webpack 5, Vite, esbuild,
  Rollup, native Node ESM/CJS, TypeScript `node16`/`nodenext`/`bundler`). Maps the sub-path to the
  correct `import` (ESM, `.mjs`), `require` (CJS, `.js`), and `types` targets. ESM output uses the
  `.mjs` extension, so Node.js treats it as an ES module natively without needing an
  `esm/package.json`.
- **Physical `<name>/package.json` fallback** — used by legacy resolvers that ignore `exports`
  (webpack 4, old Node, older Jest/ts-node). Relative `main`/`module`/`types` pointing at the
  same built files.

When adding a new sub-path:

1. Create `src/entries/<name>.ts` (the implementation itself, or a barrel re-exporting from sibling
   files under `src/<name>/`)
2. Add `"./<name>"` to the `exports` field in `package.json` with `import`, `require`, and `types`
   conditions
3. Add a physical `<name>/package.json` with relative `main`/`module`/`types` (see
   `time/package.json`), and add `"<name>"` to the `files` array so it ships in the package
4. Add `"@datadog/js-core/<name>"` to the `paths` map in the root `tsconfig.base.json`, pointing at
   `./packages/js-core/src/entries/<name>`
5. Add a section for the new sub-path in `README.md` (see below)

### README maintenance

Every sub-path must have a corresponding section in `README.md`. When adding or changing exports:

- Add or update the sub-path section in `README.md` with an import example and API table(s)
- **Sort all entries within each API table alphabetically** (by export name)
- Follow the existing section structure: import example → Types table (if any) → Constants table (if any) → Functions table

## Current sub-paths

| Sub-path                    | Entry file                                              | Description              |
| --------------------------- | ------------------------------------------------------- | ------------------------ |
| `@datadog/js-core/assembly` | `src/entries/assembly.ts` (barrel over `src/assembly/`) | Hook assembly primitives |
| `@datadog/js-core/monitor`  | `src/entries/monitor.ts`                                | Monitor utilities        |
| `@datadog/js-core/time`     | `src/entries/time.ts`                                   | Time utilities           |
| `@datadog/js-core/util`     | `src/entries/util.ts` (barrel over `src/util/`)         | General utilities        |
