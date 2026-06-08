/** One second in milliseconds. */
export const ONE_SECOND = 1000

/** One minute in milliseconds. */
export const ONE_MINUTE = 60 * ONE_SECOND

/** One hour in milliseconds. */
export const ONE_HOUR = 60 * ONE_MINUTE

/** One day in milliseconds. */
export const ONE_DAY = 24 * 60 * 60 * 1000

/** One year in milliseconds. */
export const ONE_YEAR = 365 * 24 * 60 * 60 * 1000

/** Duration in milliseconds. */
export type Duration = number & { d: 'Duration in ms' }

/** Duration in nanoseconds (used by the server-side event format). */
export type ServerDuration = number & { s: 'Duration in ns' }

/** Unix epoch timestamp in milliseconds. */
export type TimeStamp = number & { t: 'Epoch time' }

/**
 * Time relative to the navigation start, in milliseconds. Used for timing events relative to
 * when the page was loaded (sourced from `performance.now()`).
 */
export type RelativeTime = number & { r: 'Time relative to navigation start' } & { d: 'Duration in ms' }

/** Pair of a relative time and its corresponding absolute timestamp. */
export interface ClocksState {
  relative: RelativeTime
  timeStamp: TimeStamp
}

/**
 * Returns the current time as a Unix timestamp in milliseconds.
 *
 * Prefer this over `Date.now()` because some environments incorrectly polyfill `Date.now` —
 * for example, old versions of `datejs` patched it to return a `Date` instance instead of a
 * number, which silently breaks arithmetic. `new Date().getTime()` is unaffected by such patches.
 *
 * @returns Current Unix timestamp in milliseconds.
 */
export function dateNow(): number {
  return new Date().getTime()
}

/**
 * Returns the current time as a {@link TimeStamp}.
 *
 * @returns Current Unix timestamp in milliseconds, typed as {@link TimeStamp}.
 */
export function timeStampNow(): TimeStamp {
  return dateNow() as TimeStamp
}

/**
 * Computes the elapsed duration between two timestamps or relative times.
 *
 * @param start - The start time.
 * @param end - The end time.
 * @returns The elapsed duration in milliseconds.
 */
export function elapsed(start: TimeStamp, end: TimeStamp): Duration
export function elapsed(start: number, end: number): Duration
export function elapsed(start: number, end: number) {
  return (end - start) as Duration
}

/**
 * Converts a {@link Duration} (milliseconds) to a {@link ServerDuration} (nanoseconds).
 *
 * @param duration - The duration in milliseconds to convert.
 * @returns The duration in nanoseconds, or `undefined` if the input is `undefined`.
 */
export function toServerDuration(duration: Duration): ServerDuration
export function toServerDuration(duration: Duration | undefined): ServerDuration | undefined
export function toServerDuration(duration: Duration | undefined) {
  if (typeof duration !== 'number') {
    return duration
  }
  return Math.round(duration * 1e6) as ServerDuration
}

/**
 * Adds two numeric time values, preserving the branded type of the result.
 *
 * @returns `a + b` typed as `TimeStamp`, `RelativeTime`, or `Duration` depending on the overload.
 */
export function addDuration(a: TimeStamp, b: Duration): TimeStamp
export function addDuration(a: RelativeTime, b: Duration): RelativeTime
export function addDuration(a: Duration, b: Duration): Duration
export function addDuration(a: number, b: number) {
  return a + b
}

/**
 * Returns the current relative time in milliseconds since navigation start, sourced from
 * `performance.now()`. In Node.js (≥16), this is relative to the process start time.
 *
 * @returns Current relative time as a {@link RelativeTime}.
 */
export function relativeNow(): RelativeTime {
  return performance.now() as RelativeTime
}

/**
 * Returns the current time as both a relative time and an absolute timestamp.
 *
 * @returns A {@link ClocksState} with the current relative and absolute times.
 */
export function clocksNow(): ClocksState {
  return { relative: relativeNow(), timeStamp: timeStampNow() }
}

/**
 * Returns the clocks state at the navigation/process origin (relative = 0).
 *
 * @returns A {@link ClocksState} with `relative = 0` and the navigation start timestamp.
 */
export function clocksOrigin(): ClocksState {
  return { relative: 0 as RelativeTime, timeStamp: getTimeOrigin() }
}

/**
 * Converts a relative time to a {@link ClocksState} with a corrected absolute timestamp.
 * Applies a drift correction when the system clock moved forward relative to `performance.now()`.
 *
 * @param relative - The relative time to convert.
 * @returns A {@link ClocksState} with the relative time and its corrected absolute timestamp.
 */
export function relativeToClocks(relative: RelativeTime): ClocksState {
  return { relative, timeStamp: getCorrectedTimeStamp(relative) }
}

/**
 * Converts an absolute timestamp to a {@link ClocksState} with its corresponding relative time.
 *
 * @param timeStamp - The absolute timestamp to convert.
 * @returns A {@link ClocksState} with the timestamp and its relative time since navigation start.
 */
export function timeStampToClocks(timeStamp: TimeStamp): ClocksState {
  return { relative: toRelativeTime(timeStamp), timeStamp }
}

/**
 * Converts an absolute timestamp to a relative time since navigation start.
 *
 * @param timestamp - An absolute Unix timestamp.
 * @returns The corresponding {@link RelativeTime} since navigation start.
 */
export function toRelativeTime(timestamp: TimeStamp): RelativeTime {
  return (timestamp - getTimeOrigin()) as RelativeTime
}

/**
 * Converts a relative time since navigation start to an absolute timestamp.
 *
 * @param relativeTime - Time in milliseconds since navigation start.
 * @returns The corresponding absolute {@link TimeStamp}.
 */
export function toTimeStamp(relativeTime: RelativeTime): TimeStamp {
  return Math.round(addDuration(getTimeOrigin(), relativeTime)) as TimeStamp
}

/**
 * Returns `true` if the given value is more likely a relative time than an absolute timestamp.
 * Heuristic: values smaller than one year are treated as relative.
 *
 * @param time - A value that may be either a {@link RelativeTime} or a {@link TimeStamp}.
 */
export function isRelativeTime(time: RelativeTime | TimeStamp): time is RelativeTime {
  return time < ONE_YEAR
}

/**
 * Returns the drift in milliseconds between `Date.now()` and `performance.now()` relative to
 * navigation start. A positive value means the system clock ran ahead of the performance timer.
 *
 * @returns Clock drift in milliseconds.
 */
export function clockDrift(): number {
  return Math.round(dateNow() - addDuration(getTimeOrigin(), performance.now() as Duration))
}

/**
 * Time origin slightly changes on some rare cases — cache it.
 */
let timeOrigin: TimeStamp | undefined

/**
 * Returns the time origin — the start of the current navigation in browsers, or the process
 * start time in Node.js.
 *
 * Prefers `performance.timing.navigationStart` over `performance.timeOrigin` because
 * `timeOrigin` can be much farther in the past than the actual navigation start (Firefox 71,
 * https://bugzilla.mozilla.org/show_bug.cgi?id=1429926) and is not supported in Safari <15.
 * Falls back to `performance.timeOrigin` in environments without `performance.timing`
 * (Service Workers, Node.js)
 *
 * @returns The time origin as a {@link TimeStamp}.
 */
export function getTimeOrigin(): TimeStamp {
  if (timeOrigin === undefined) {
    timeOrigin = (performance.timing?.navigationStart ?? performance.timeOrigin) as TimeStamp
  }
  return timeOrigin
}

function getCorrectedTimeStamp(relativeTime: RelativeTime): TimeStamp {
  const correctedOrigin = (dateNow() - performance.now()) as TimeStamp
  // apply correction only for positive drift
  if (correctedOrigin > getTimeOrigin()) {
    return Math.round(addDuration(correctedOrigin, relativeTime)) as TimeStamp
  }
  return toTimeStamp(relativeTime)
}
