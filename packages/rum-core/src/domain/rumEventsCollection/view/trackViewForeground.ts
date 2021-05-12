import {
  elapsed,
  ClocksState,
  preferredNow,
  addEventListener,
  DOM_EVENT,
  Duration,
  clocksNow,
  preferredClock,
  PreferredTime,
} from '@datadog/browser-core'

// Arbitrary value to cap number of element (mostly for backend)
const MAX_NUMBER_OF_FOCUSED_TIME = 500

export interface InForegroundPeriod {
  start: Duration
  duration: Duration
  currentInForeground?: true
}

export interface ViewForeground {
  inForegroundPeriods: InForegroundPeriod[]
}

export function trackViewForeground(startClocks: ClocksState, scheduleViewUpdate: () => void) {
  const viewForeground: ViewForeground = {
    inForegroundPeriods: [],
  }
  if (document.hasFocus()) {
    addNewInForegroundPeriod(startClocks)
  }

  const { stop: stopFocusTracking } = trackFocus(addNewInForegroundPeriod)
  const { stop: stopBlurTracking } = trackBlur(closeLastInForegroundPeriod)

  return {
    stop: (): void => {
      stopFocusTracking()
      stopBlurTracking()
      closeLastInForegroundPeriod()
    },
    updateCurrentForegroundDuration: (endTime: PreferredTime) => {
      const lastForegroundPeriod = viewForeground.inForegroundPeriods[viewForeground.inForegroundPeriods.length - 1]
      if (lastForegroundPeriod != null && lastForegroundPeriod.currentInForeground === true) {
        lastForegroundPeriod.duration = computeDuration(endTime)
      }
    },
    viewForeground,
  }

  function addNewInForegroundPeriod(nowOverride?: ClocksState) {
    const now = nowOverride ?? clocksNow()
    if (viewForeground.inForegroundPeriods.length > MAX_NUMBER_OF_FOCUSED_TIME) {
      return
    }
    viewForeground.inForegroundPeriods.push({
      start: elapsed(preferredClock(startClocks), preferredClock(now)),
      duration: 0 as Duration,
      currentInForeground: true,
    })
    scheduleViewUpdate()
  }

  function closeLastInForegroundPeriod() {
    const lastIndex = viewForeground.inForegroundPeriods.length - 1
    if (lastIndex >= 0 && viewForeground.inForegroundPeriods[lastIndex].currentInForeground) {
      const { start } = viewForeground.inForegroundPeriods[lastIndex]
      viewForeground.inForegroundPeriods[lastIndex] = {
        start,
        duration: computeDuration(),
      }
      scheduleViewUpdate()
    }
  }

  function computeDuration(endTime?: PreferredTime) {
    const lastIndex = viewForeground.inForegroundPeriods.length - 1
    const { start } = viewForeground.inForegroundPeriods[lastIndex]
    return (elapsed(preferredClock(startClocks), endTime ?? preferredNow()) - start) as Duration
  }
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, () => onFocusChange())
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, () => onBlurChange())
}
