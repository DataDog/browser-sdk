import {
  elapsed,
  ClocksState,
  relativeNow,
  addEventListener,
  DOM_EVENT,
  RelativeTime,
  toServerRelativeTime,
  toServerDuration,
  ServerDuration,
} from '@datadog/browser-core'

const MAX_NUMBER_OF_FOCUSED_TIME = 500

export interface FocusTime {
  start: RelativeTime
  duration: ServerDuration
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
    addNewFocusTime(startClocks.relative)
  }

  const { stop: stopFocusTracking } = trackFocus(addNewFocusTime)
  const { stop: stopBlurTracking } = trackBlur(closeLastFocusTime)

  return {
    stop: (): void => {
      stopFocusTracking()
      stopBlurTracking()
      closeLastFocusTime()
    },
    updateCurrentFocusDuration: (endTime: RelativeTime) => {
      const lastFocusedtime = viewFocus.inForegroundPeriods[viewFocus.inForegroundPeriods.length - 1]
      if (lastFocusedtime != null && lastFocusedtime.currentlyFocused === true) {
        lastFocusedtime.duration = toServerDuration(elapsed(lastFocusedtime.start, endTime))
      }
    },
    viewFocus,
  }

  function addNewFocusTime(overrideStart?: RelativeTime) {
    const now = relativeNow()
    const start = overrideStart ?? now
    if (viewFocus.inForegroundPeriods.length > MAX_NUMBER_OF_FOCUSED_TIME) {
      return
    }
    viewFocus.inForegroundPeriods.push({
      start: toServerRelativeTime(start),
      duration: toServerDuration(elapsed(start, now)),
      currentlyFocused: true,
    })
    scheduleViewUpdate()
  }

  function closeLastFocusTime() {
    const lastIndex = viewFocus.inForegroundPeriods.length - 1

    if (lastIndex >= 0 && viewFocus.inForegroundPeriods[lastIndex].currentlyFocused) {
      viewFocus.inForegroundPeriods[lastIndex] = {
        start: toServerRelativeTime(viewFocus.inForegroundPeriods[lastIndex].start),
        duration: toServerDuration(elapsed(viewFocus.inForegroundPeriods[lastIndex].start, relativeNow())),
      }
      scheduleViewUpdate()
    }
  }
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, () => onFocusChange())
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, () => onBlurChange())
}
