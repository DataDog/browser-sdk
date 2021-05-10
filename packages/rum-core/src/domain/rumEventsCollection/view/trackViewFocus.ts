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

const MAX_NUMBER_OF_FOCUSED_TIME = 500

export interface FocusTime {
  start: PreferredTime
  duration: Duration
  currentlyFocused?: true
}

export interface ViewFocus {
  inForeground: boolean
  inForegroundPeriods: FocusTime[]
}

export function trackViewFocus(startClocks: ClocksState, scheduleViewUpdate: () => void) {
  const viewFocus: ViewFocus = {
    inForeground: document.hasFocus(),
    inForegroundPeriods: [],
  }
  if (viewFocus.inForeground) {
    addNewFocusTime(startClocks)
  }

  const { stop: stopFocusTracking } = trackFocus(addNewFocusTime)
  const { stop: stopBlurTracking } = trackBlur(closeLastFocusTime)

  return {
    stop: (): void => {
      stopFocusTracking()
      stopBlurTracking()
      closeLastFocusTime()
    },
    updateCurrentFocusDuration: (endTime: PreferredTime) => {
      const lastFocusedtime = viewFocus.inForegroundPeriods[viewFocus.inForegroundPeriods.length - 1]
      if (lastFocusedtime != null && lastFocusedtime.currentlyFocused === true) {
        lastFocusedtime.duration = computeDuration(endTime)
      }
    },
    viewFocus,
  }

  function addNewFocusTime(nowOverride?: ClocksState) {
    const now = nowOverride ?? clocksNow()
    if (viewFocus.inForegroundPeriods.length > MAX_NUMBER_OF_FOCUSED_TIME) {
      return
    }
    viewFocus.inForegroundPeriods.push({
      start: preferredClock(now),
      duration: 0 as Duration,
      currentlyFocused: true,
    })
    scheduleViewUpdate()
  }

  function closeLastFocusTime() {
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
    return elapsed(start, endTime ?? preferredNow())
  }
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, () => onFocusChange())
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, () => onBlurChange())
}
