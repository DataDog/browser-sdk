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

export interface FocusPeriod {
  start: Duration
  duration: Duration
  currentlyFocused?: true
}

export interface ViewFocus {
  inForegroundPeriods: FocusPeriod[]
}

export function trackViewFocus(startClocks: ClocksState, scheduleViewUpdate: () => void) {
  const viewFocus: ViewFocus = {
    inForegroundPeriods: [],
  }
  if (document.hasFocus()) {
    addNewFocusPeriod(startClocks)
  }

  const { stop: stopFocusTracking } = trackFocus(addNewFocusPeriod)
  const { stop: stopBlurTracking } = trackBlur(closeLastFocusPeriod)

  return {
    stop: (): void => {
      stopFocusTracking()
      stopBlurTracking()
      closeLastFocusPeriod()
    },
    updateCurrentFocusDuration: (endTime: PreferredTime) => {
      const lastFocusedtime = viewFocus.inForegroundPeriods[viewFocus.inForegroundPeriods.length - 1]
      if (lastFocusedtime != null && lastFocusedtime.currentlyFocused === true) {
        lastFocusedtime.duration = computeDuration(endTime)
      }
    },
    viewFocus,
  }

  function addNewFocusPeriod(nowOverride?: ClocksState) {
    const now = nowOverride ?? clocksNow()
    if (viewFocus.inForegroundPeriods.length > MAX_NUMBER_OF_FOCUSED_TIME) {
      return
    }
    viewFocus.inForegroundPeriods.push({
      start: elapsed(preferredClock(startClocks), preferredClock(now)),
      duration: 0 as Duration,
      currentlyFocused: true,
    })
    scheduleViewUpdate()
  }

  function closeLastFocusPeriod() {
    const lastIndex = viewFocus.inForegroundPeriods.length - 1
    if (lastIndex >= 0 && viewFocus.inForegroundPeriods[lastIndex].currentlyFocused) {
      const { start } = viewFocus.inForegroundPeriods[lastIndex]
      viewFocus.inForegroundPeriods[lastIndex] = {
        start,
        duration: computeDuration(),
      }
      scheduleViewUpdate()
    }
  }

  function computeDuration(endTime?: PreferredTime) {
    const lastIndex = viewFocus.inForegroundPeriods.length - 1
    const { start } = viewFocus.inForegroundPeriods[lastIndex]
    return (elapsed(preferredClock(startClocks), endTime ?? preferredNow()) - start) as Duration
  }
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, () => onFocusChange())
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, () => onBlurChange())
}
