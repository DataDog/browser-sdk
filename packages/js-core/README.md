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
lifetime of the monitor. Caught errors are logged to the console via the given `display`, but only
when debug mode is on (toggled globally via `setDebugMode` from `@datadog/js-core/util`).

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

General-purpose utilities: console/display helpers, deep merge, deep clone, and type utilities.

```ts
import {
  createDisplay,
  setDebugMode,
  getDebugMode,
  ConsoleApiName,
  globalConsole,
  originalConsoleMethods,
  mergeInto,
  deepClone,
  combine,
  getType,
  isIndexableObject,
} from '@datadog/js-core/util'
import type { Display } from '@datadog/js-core/util'
```

#### Types

| Export    | Description                                                              |
| --------- | ------------------------------------------------------------------------ |
| `Display` | Console methods pre-bound to the original (unpatched) console, prefixed. |

#### Constants

| Export                   | Description                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `ConsoleApiName`         | Enum-like map of the console method names (`log`, `debug`, `info`, `warn`, `error`). |
| `globalConsole`          | Alias for the global `console`, resilient to bundler `console.*` stripping.          |
| `originalConsoleMethods` | The original (unpatched) console methods, captured at module load.                   |

#### Functions

| Export                     | Description                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createDisplay(prefix)`    | Returns a `Display` bound to the original console methods, prefixing every message with `prefix`. Guards against patched console. |
| `getDebugMode()`           | Returns whether debug mode is currently enabled.                                                                                  |
| `setDebugMode(enabled)`    | Global debug-mode toggle. SDKs check `getDebugMode()` to decide whether to emit internal diagnostic logs to the console.          |
| `mergeInto(dest, src)`     | Recursively merges `src` into `dest` in place and returns the result. Prefer `combine` for non-mutating use.                      |
| `deepClone(value)`         | Returns a deep copy of `value`. Caveats: no prototype chains, no `Map`/`Set` support.                                             |
| `combine(a, b, ...)`       | Non-mutating deep merge of two or more values. Objects merged by key, arrays by index, `undefined` skipped.                       |
| `getType(value)`           | Like `typeof`, but distinguishes `'null'` and `'array'` from `'object'`.                                                          |
| `isIndexableObject(value)` | Returns `true` if `value` can be safely used as a plain object (i.e. not `null`, not an array, not a primitive).                  |

### `@datadog/js-core/assembly`

Primitives for the hook-based event assembly pattern used across Datadog SDKs.

A `Hook` is a typed publish/subscribe channel. Multiple callbacks are registered and invoked
together when the hook is triggered. Each callback may contribute a partial result (`Result`),
opt out (`SKIPPED`), or abort the entire event (`DISCARDED`). Results from all callbacks are
deep-merged via `combine`.

```ts
import { createHook, DISCARDED, SKIPPED } from '@datadog/js-core/assembly'
import type { Hook, RecursivePartial } from '@datadog/js-core/assembly'

const hook = createHook<{ eventType: string }, { tags: string[] }>()

const { unregister } = hook.register(({ eventType }) => {
  if (eventType === 'error') return SKIPPED
  return { tags: ['env:prod'] }
})

const result = hook.trigger({ eventType: 'view' }) // { tags: ['env:prod'] }
```

#### Types

| Export                 | Description                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `Hook<Params, Result>` | A typed hook: `register` a callback and `trigger` it with params. See interface methods below. |
| `RecursivePartial<T>`  | Like `Partial<T>` but applied recursively to all nested object and array element types.        |

#### Constants

| Export      | Description                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `DISCARDED` | Sentinel: a callback returning this causes `trigger` to return `DISCARDED` and stop processing. |
| `SKIPPED`   | Sentinel: a callback returning this contributes nothing; other callbacks continue to run.       |

#### Functions

| Export         | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `createHook()` | Creates a new `Hook` instance with no registered callbacks. |

#### `Hook<Params, Result>` interface

| Method               | Description                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register(callback)` | Registers a callback that receives `Params` and returns `Result \| DISCARDED \| SKIPPED`. Returns `{ unregister }` to remove the callback later.        |
| `trigger(params)`    | Invokes all callbacks, deep-merges `Result` values via `combine`. Returns `DISCARDED` if any callback discards, or `undefined` if none return a result. |
