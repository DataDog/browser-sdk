import { isNumber, ONE_YEAR, round } from './utils'

export type Duration = number & { d: 'Duration in ms' }
export type ServerDuration = number & { s: 'Duration in ns' }
export type TimeStamp = number & { t: 'Epoch time' }
export type RelativeTime = number & { r: 'Time relative to navigation start' } & { d: 'Duration in ms' }
export type ClocksState = { relative: RelativeTime; timeStamp: TimeStamp }

export function relativeToClocks(relative: RelativeTime) {
  return { relative, timeStamp: getCorrectedTimeStamp(relative) }
}

function getCorrectedTimeStamp(relativeTime: RelativeTime) {
  const correctedOrigin = dateNow() - performance.now()
  // apply correction only for positive drift
  if (correctedOrigin > getNavigationStart()) {
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    return Math.round(correctedOrigin + relativeTime) as TimeStamp
  }
  return getTimeStamp(relativeTime)
}

export function currentDrift() {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  return Math.round(dateNow() - (getNavigationStart() + performance.now()))
}

export function toServerDuration(duration: Duration): ServerDuration
export function toServerDuration(duration: Duration | undefined): ServerDuration | undefined
export function toServerDuration(duration: Duration | undefined) {
  if (!isNumber(duration)) {
    return duration
  }
  return round(duration * 1e6, 0) as ServerDuration
}

export function dateNow() {
  // Do not use `Date.now` because sometimes websites are wrongly "polyfilling" it. For example, we
  // had some users using a very old version of `datejs`, which patched `Date.now` to return a Date
  // instance instead of a timestamp[1]. Those users are unlikely to fix this, so let's handle this
  // case ourselves.
  // [1]: https://github.com/datejs/Datejs/blob/97f5c7c58c5bc5accdab8aa7602b6ac56462d778/src/core-debug.js#L14-L16
  return new Date().getTime()
}

export function timeStampNow() {
  return dateNow() as TimeStamp
}

export function relativeNow() {
  return performance.now() as RelativeTime
}

export function clocksNow() {
  return { relative: relativeNow(), timeStamp: timeStampNow() }
}

export function clocksOrigin() {
  return { relative: 0 as RelativeTime, timeStamp: getNavigationStart() }
}

export function elapsed(start: TimeStamp, end: TimeStamp): Duration
export function elapsed(start: RelativeTime, end: RelativeTime): Duration
export function elapsed(start: number, end: number) {
  return (end - start) as Duration
}

/**
 * Get the time since the navigation was started.
 *
 * Note: this does not use `performance.timeOrigin` because it doesn't seem to reflect the actual
 * time on which the navigation has started: it may be much farther in the past, at least in Firefox 71.
 * Related issue in Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=1429926
 */
export function getRelativeTime(timestamp: TimeStamp) {
  return (timestamp - getNavigationStart()) as RelativeTime
}

export function getTimeStamp(relativeTime: RelativeTime) {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  return Math.round(getNavigationStart() + relativeTime) as TimeStamp
}

export function looksLikeRelativeTime(time: RelativeTime | TimeStamp): time is RelativeTime {
  return time < ONE_YEAR
}

/**
 * Navigation start slightly change on some rare cases
 */
let navigationStart: TimeStamp | undefined

function getNavigationStart() {
  if (navigationStart === undefined) {
    navigationStart = performance.timing.navigationStart as TimeStamp
  }
  return navigationStart
}

export function resetNavigationStart() {
  navigationStart = undefined
}
