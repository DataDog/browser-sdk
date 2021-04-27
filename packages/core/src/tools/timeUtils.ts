import { buildEnv } from '../boot/buildEnv'
import { isNumber, round } from './utils'

export type Duration = number & { d: 'Duration in ms' }
export type ServerDuration = number & { s: 'Duration in ns' }
export type TimeStamp = number & { t: 'Epoch time' }
export type RelativeTime = number & { r: 'Time relative to navigation start' } & { d: 'Duration in ms' }
export type ClocksState = { relative: RelativeTime; timeStamp: TimeStamp }

export type PreferredTime = (TimeStamp | RelativeTime) & { p: 'preferred time' }

let isSystemClockPreferred = buildEnv.systemClock

export function preferSystemClock() {
  isSystemClockPreferred = true
}

export function preferredNow(): PreferredTime {
  return (isSystemClockPreferred ? timeStampNow() : relativeNow()) as PreferredTime
}

export function preferredTimeStamp(clocks: ClocksState) {
  return isSystemClockPreferred ? clocks.timeStamp : getTimeStamp(clocks.relative)
}

export function preferredClock(clocks: ClocksState): PreferredTime {
  return (isSystemClockPreferred ? clocks.timeStamp : clocks.relative) as PreferredTime
}

export function relativeToClocks(relative: RelativeTime) {
  return { relative, timeStamp: isSystemClockPreferred ? getCorrectedTimeStamp(relative) : getTimeStamp(relative) }
}

function getCorrectedTimeStamp(relativeTime: RelativeTime) {
  const correctedOrigin = Date.now() - performance.now()
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  return Math.floor(correctedOrigin + relativeTime) as TimeStamp
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

export function clocksNow() {
  return { relative: relativeNow(), timeStamp: timeStampNow() }
}

export function clocksOrigin() {
  return { relative: 0 as RelativeTime, timeStamp: getNavigationStart() }
}

export function elapsed(start: PreferredTime, end: PreferredTime): Duration
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

export function resetNavigationStart() {
  navigationStart = undefined
}
