# @datadog/js-core

Runtime-agnostic core utilities shared across Datadog JavaScript SDKs.

## Installation

```sh
npm install @datadog/js-core
# or
yarn add @datadog/js-core
```

## API

The package exposes named sub-paths (e.g. `@datadog/js-core/time`). Import only what you need.
There is no root entry point — always import from a sub-path.

Sub-paths are resolved via the `exports` field in `package.json` (for modern bundlers and native
Node ESM/CJS) with a physical `<name>/package.json` fallback for legacy resolvers (webpack 4, etc.).

TypeScript users need `"moduleResolution": "bundler"`, `"node16"`, or `"nodenext"` in their
`tsconfig.json` to resolve sub-path exports correctly.

### `@datadog/js-core/time`

Time utilities that work in any JavaScript runtime.

| Export      | Description                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| `dateNow()` | Returns the current Unix timestamp in milliseconds. Prefer over `Date.now()` to guard against broken polyfills. |
