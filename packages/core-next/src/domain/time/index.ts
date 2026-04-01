export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_DAY = 24 * ONE_HOUR
export const ONE_YEAR = 365 * ONE_DAY

export type Duration = number & { d: 'Duration in ms' }
export type ServerDuration = number & { s: 'Duration in ns' }
export type TimeStamp = number & { t: 'Epoch time' }
export type RelativeTime = number & { r: 'Time relative to navigation start' } & { d: 'Duration in ms' }

export interface ClocksState {
  relative: RelativeTime
  timeStamp: TimeStamp
}

export function elapsed(start: TimeStamp, end: TimeStamp): Duration
export function elapsed(start: RelativeTime, end: RelativeTime): Duration
export function elapsed(start: number, end: number) {
  return (end - start) as Duration
}

export function addDuration(a: TimeStamp, b: Duration): TimeStamp
export function addDuration(a: RelativeTime, b: Duration): RelativeTime
export function addDuration(a: Duration, b: Duration): Duration
export function addDuration(a: number, b: number) {
  return a + b
}

export function toServerDuration(duration: Duration): ServerDuration
export function toServerDuration(duration: Duration | undefined): ServerDuration | undefined
export function toServerDuration(duration: Duration | undefined) {
  if (typeof duration !== 'number') {
    return duration
  }
  return Math.round(duration * 1e6) as ServerDuration
}

export function looksLikeRelativeTime(time: RelativeTime | TimeStamp): time is RelativeTime {
  return time < ONE_YEAR
}
