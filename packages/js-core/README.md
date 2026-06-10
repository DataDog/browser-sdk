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
| `clocksNow()`                | Current time as a `ClocksState` (both relative and absolute).                                                                                      |
| `clocksOrigin()`             | Origin clocks state: `relative = 0`, `timeStamp = getTimeOrigin()`.                                                                                |
| `clockDrift()`               | Clock drift in ms between `Date.now()` and `performance.now()` relative to navigation start.                                                       |
| `dateNow()`                  | Current Unix timestamp in ms. Prefer over `Date.now()` to guard against broken polyfills.                                                          |
| `elapsed(start, end)`        | Duration between two timestamps or relative times.                                                                                                 |
| `getTimeOrigin()`            | Time origin as a `TimeStamp` (cached). Falls back to `performance.timeOrigin` when `performance.timing` is unavailable (Service Workers, Node.js). |
| `toRelativeTime(ts)`         | Returns the `RelativeTime` for a given absolute `TimeStamp`.                                                                                       |
| `toTimeStamp(relative)`      | Returns the absolute `TimeStamp` for a given `RelativeTime`.                                                                                       |
| `isRelativeTime(time)`       | Heuristic type guard: returns `true` if the value is likely a `RelativeTime` (< one year).                                                         |
| `relativeNow()`              | Current relative time in ms since navigation/process start (`performance.now()`).                                                                  |
| `relativeToClocks(relative)` | Converts a `RelativeTime` to a `ClocksState` with a drift-corrected `TimeStamp`.                                                                   |
| `timeStampNow()`             | Current Unix timestamp as a `TimeStamp`.                                                                                                           |
| `timeStampToClocks(ts)`      | Converts a `TimeStamp` to a `ClocksState` with its corresponding `RelativeTime`.                                                                   |
| `toServerDuration(d)`        | Converts a `Duration` (ms) to a `ServerDuration` (ns). Returns `undefined` if the input is `undefined`.                                            |
