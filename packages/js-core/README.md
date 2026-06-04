# @datadog/js-core

Runtime-agnostic core utilities shared across Datadog JavaScript SDKs.

## Installation

```sh
npm install @datadog/js-core
# or
yarn add @datadog/js-core
```

## API

The package uses sub-path exports. Import only what you need.

### `@datadog/js-core/time`

Time utilities that work in any JavaScript runtime.

| Export      | Description                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| `dateNow()` | Returns the current Unix timestamp in milliseconds. Prefer over `Date.now()` to guard against broken polyfills. |
