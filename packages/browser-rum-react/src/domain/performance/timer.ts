import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { elapsed, relativeNow, timeStampNow } from '@datadog/browser-core'

export function createTimer() {
  let duration: Duration | undefined
  let startTime: TimeStamp | undefined
  let highPrecisionStartTime: RelativeTime | undefined

  return {
    startTimer(this: void) {
      // timeStampNow uses Date.now() internally, which is not high precision, but this is what is
      // used for other events, so we use it here as well.
      startTime = timeStampNow()

      // relativeNow uses performance.now() which is higher precision than Date.now(), so we use for
      // the duration
      highPrecisionStartTime = relativeNow()
    },

    stopTimer(this: void) {
      duration = elapsed(highPrecisionStartTime!, relativeNow())
    },

    getDuration(this: void) {
      return duration
    },

    getStartTime(this: void) {
      return startTime
    },
  }
}
