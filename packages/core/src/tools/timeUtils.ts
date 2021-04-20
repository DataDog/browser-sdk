import { isNumber, round, ONE_SECOND } from './utils'

export type Duration = number & { d: 'Duration in ms' }
export type ServerDuration = number & { s: 'Duration in ns' }
export type TimeStamp = number & { t: 'Epoch time' }
export type RelativeTime = number & { r: 'Time relative to navigation start' } & { d: 'Duration in ms' }
export type Time = (TimeStamp | RelativeTime) & { p: 'preferred time' }

let isSystemClockPreferred = false

export function preferSystemClock() {
  isSystemClockPreferred = true
}

export function preferredNow(): Time {
  return (isSystemClockPreferred ? timeStampNow() : relativeNow()) as Time
}

export function preferredTime(timestamp: TimeStamp, relativeTime: RelativeTime): Time {
  return (isSystemClockPreferred ? timestamp : relativeTime) as Time
}

export function preferredTimeOrigin() {
  return (isSystemClockPreferred ? getNavigationStart() : 0) as Time
}

export function preferredTimeStamp(time: Time) {
  return isSystemClockPreferred ? (time as TimeStamp) : getTimeStamp(time as RelativeTime)
}

export function preferredRelativeTime(time: Time) {
  return isSystemClockPreferred ? getRelativeTime(time as TimeStamp) : (time as RelativeTime)
}

// TODO test
export function getCorrectedTimeStamp(relativeTime: RelativeTime) {
  const correctedOrigin = Date.now() - performance.now()
  if (isSystemClockPreferred && correctedOrigin > getNavigationStart()) {
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    return Math.floor(correctedOrigin + relativeTime) as TimeStamp
  }
  return getTimeStamp(relativeTime)
}

export function toServerDuration(duration: Duration): ServerDuration
export function toServerDuration(duration: Duration | undefined): ServerDuration | undefined
export function toServerDuration(duration: Duration | undefined) {
  if (!isNumber(duration)) {
    return duration
  }
  return round(duration * 1e6, 0) as ServerDuration
}

export function timeStampNow() {
  return Date.now() as TimeStamp
}

export function relativeNow() {
  return performance.now() as RelativeTime
}

export function elapsed(start: Time, end: Time): Duration
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
  return Math.floor(getNavigationStart() + relativeTime) as TimeStamp
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
