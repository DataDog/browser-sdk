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

### `@datadog/js-core/time`

Time utilities that work in any JavaScript runtime.

| Export      | Description                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| `dateNow()` | Returns the current Unix timestamp in milliseconds. Prefer over `Date.now()` to guard against broken polyfills. |
