import { monitor, ONE_MINUTE, ONE_SECOND, TimeStamp, timeStampNow } from '@datadog/browser-core'

export const SLEEP_CHECK_DELAY = ONE_SECOND
export const SLEEP_THRESHOLD = ONE_MINUTE

let sleepPeriods: Array<{ start: TimeStamp; end: TimeStamp }> | undefined
let lastWoke: TimeStamp | undefined

export function trackSleep() {
  lastWoke = timeStampNow()
  sleepPeriods = []
  const intervalId = setInterval(monitor(checkSleep), SLEEP_CHECK_DELAY)
  return { stop: () => clearInterval(intervalId) }
}

export function getSleepDuration(since?: TimeStamp) {
  if (!sleepPeriods) {
    return 0
  }
  checkSleep()
  let filteredPeriods
  if (since === undefined) {
    filteredPeriods = sleepPeriods
  } else {
    filteredPeriods = sleepPeriods.filter((period) => period.end >= since)
  }
  return filteredPeriods.reduce((total, period) => total + (period.end - period.start), 0)
}

function checkSleep() {
  if (lastWoke === undefined || !sleepPeriods) {
    return
  }
  const now = timeStampNow()
  if (now - lastWoke >= SLEEP_THRESHOLD) {
    sleepPeriods.push({ start: lastWoke, end: now })
  }
  lastWoke = now
}
