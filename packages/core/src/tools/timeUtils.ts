import { isNumber, round } from './utils'

export type Duration = number & { d: 'Duration in ms' }
export type ServerDuration = number & { s: 'Duration in ns' }
export type TimeStamp = number & { t: 'Epoch time' }
export type RelativeTime = number & { r: 'Time relative to navigation start' } & { d: 'Duration in ms' }

export function toOptionalServerDuration(duration: Duration | undefined): ServerDuration | undefined {
  if (!isNumber<Duration>(duration)) {
    return duration
  }
  return toServerDuration(duration)
}

export function toServerDuration(duration: Duration) {
  return round(duration * 1e6, 0) as ServerDuration
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
