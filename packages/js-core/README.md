# @datadog/js-core

> **Internal package.** This package is intended for use by Datadog SDKs only and is not designed
> for direct consumption by end users. APIs may change without notice outside of Datadog SDK
> releases.

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

For the full API reference, see the [generated API documentation](https://datadoghq.dev/browser-sdk/).

| Sub-path                   | Description              |
| -------------------------- | ------------------------ |
| `@datadog/js-core/time`    | Time utilities           |
| `@datadog/js-core/monitor` | Error-monitoring helpers |
| `@datadog/js-core/util`    | General utilities        |
