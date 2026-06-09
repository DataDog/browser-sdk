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

```ts
import {
  dateNow,
  timeStampNow,
  relativeNow,
  clocksNow,
  clocksOrigin,
  elapsed,
  addDuration,
  toServerDuration,
  relativeToClocks,
  timeStampToClocks,
  toRelativeTime,
  toTimeStamp,
  getTimeOrigin,
  isRelativeTime,
  clockDrift,
  ONE_SECOND,
  ONE_MINUTE,
  ONE_HOUR,
  ONE_DAY,
  ONE_YEAR,
} from '@datadog/js-core/time'
import type { Duration, ServerDuration, TimeStamp, RelativeTime, ClocksState } from '@datadog/js-core/time'
```

#### Types

| Export           | Description                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `ClocksState`    | Pair of `{ relative: RelativeTime, timeStamp: TimeStamp }`.                                            |
| `Duration`       | Branded `number` — duration in ms.                                                                     |
| `RelativeTime`   | Branded `number` — time relative to navigation/process start in ms (sourced from `performance.now()`). |
| `ServerDuration` | Branded `number` — duration in ns (server intake format).                                              |
| `TimeStamp`      | Branded `number` — Unix epoch timestamp in ms.                                                         |

#### Constants

| Export       | Value            | Description       |
| ------------ | ---------------- | ----------------- |
| `ONE_DAY`    | `86_400_000`     | One day in ms.    |
| `ONE_HOUR`   | `3_600_000`      | One hour in ms.   |
| `ONE_MINUTE` | `60_000`         | One minute in ms. |
| `ONE_SECOND` | `1000`           | One second in ms. |
| `ONE_YEAR`   | `31_536_000_000` | One year in ms.   |

#### Functions

| Export                       | Description                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addDuration(a, b)`          | Adds two time values, preserving the branded type (`TimeStamp`, `RelativeTime`, or `Duration`).                                                    |
| `clockDrift()`               | Clock drift in ms between `Date.now()` and `performance.now()` relative to navigation start.                                                       |
| `clocksNow()`                | Current time as a `ClocksState` (both relative and absolute).                                                                                      |
| `clocksOrigin()`             | Origin clocks state: `relative = 0`, `timeStamp = getTimeOrigin()`.                                                                                |
| `dateNow()`                  | Current Unix timestamp in ms. Prefer over `Date.now()` to guard against broken polyfills.                                                          |
| `elapsed(start, end)`        | Duration between two timestamps or relative times.                                                                                                 |
| `getTimeOrigin()`            | Time origin as a `TimeStamp` (cached). Falls back to `performance.timeOrigin` when `performance.timing` is unavailable (Service Workers, Node.js). |
| `isRelativeTime(time)`       | Heuristic type guard: returns `true` if the value is likely a `RelativeTime` (< one year).                                                         |
| `relativeNow()`              | Current relative time in ms since navigation/process start (`performance.now()`).                                                                  |
| `relativeToClocks(relative)` | Converts a `RelativeTime` to a `ClocksState` with a drift-corrected `TimeStamp`.                                                                   |
| `timeStampNow()`             | Current Unix timestamp as a `TimeStamp`.                                                                                                           |
| `timeStampToClocks(ts)`      | Converts a `TimeStamp` to a `ClocksState` with its corresponding `RelativeTime`.                                                                   |
| `toRelativeTime(ts)`         | Returns the `RelativeTime` for a given absolute `TimeStamp`.                                                                                       |
| `toServerDuration(d)`        | Converts a `Duration` (ms) to a `ServerDuration` (ns). Returns `undefined` if the input is `undefined`.                                            |
| `toTimeStamp(relative)`      | Returns the absolute `TimeStamp` for a given `RelativeTime`.                                                                                       |

### `@datadog/js-core/monitor`

Error-monitoring utilities that wrap callbacks to catch, report, and suppress SDK-internal exceptions.

Each consumer creates its own isolated monitor via `createMonitor(display, onMonitorErrorCollected)`,
so error-collection state is not shared between SDKs. The `display` (from `createDisplay` in
`@datadog/js-core/util`) controls the log prefix. Both arguments are required and fixed for the
lifetime of the monitor. Caught errors are logged via the display's `ifDebugEnabled` facet, so they
only reach the console when debug mode is on (toggled globally via `setDebugMode` from
`@datadog/js-core/util`).

```ts
import { createMonitor } from '@datadog/js-core/monitor'
import { createDisplay, setDebugMode } from '@datadog/js-core/util'

const display = createDisplay('Datadog Browser SDK:')
const { monitor, callMonitored, monitored, monitorError } = createMonitor(display, (error) => reportToTelemetry(error))

setDebugMode(true) // global: also log caught errors to the console
```

#### Functions

| Export                            | Description                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `createMonitor(display, onError)` | Creates an isolated monitor using the given `Display` for debug output and required error callback. Returns instance methods. |

#### Monitor instance (returned by `createMonitor`)

| Method                               | Description                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `callMonitored(fn, context?, args?)` | Calls `fn` with error handling. Returns the function's result, or `undefined` if it throws.     |
| `monitor(fn)`                        | Wraps a function so that any thrown exception is caught and reported instead of propagating.    |
| `monitored`                          | Legacy class-method decorator equivalent to wrapping the method with `monitor`.                 |
| `monitorError(e)`                    | Reports an error directly: logs it if debug mode is on, then forwards it to the error callback. |

### `@datadog/js-core/util`

General-purpose utilities.

```ts
import { createDisplay, setDebugMode } from '@datadog/js-core/util'
import type { Display } from '@datadog/js-core/util'
```

#### Types

| Export    | Description                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Display` | Console methods pre-bound to the original (unpatched) console. Top-level methods always emit; `Display.ifDebugEnabled.*` emit only in debug mode. |

#### Functions

| Export                  | Description                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createDisplay(prefix)` | Returns a `Display` bound to the original console methods, prefixing every message with `prefix`. Guards against patched console. |
| `setDebugMode(enabled)` | Global toggle. When `true`, every display's `ifDebugEnabled.*` methods emit to the console; otherwise they stay silent.           |
