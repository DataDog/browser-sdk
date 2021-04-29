import {
  elapsed,
  ClocksState,
  relativeNow,
  addEventListener,
  DOM_EVENT,
  RelativeTime,
  toServerRelativeTime,
  toServerDuration,
} from '@datadog/browser-core'
import { FocusTime } from '../../../rawRumEvent.types'

const MAX_NUMBER_OF_FOCUSED_TIME = 500
export interface ViewFocus {
  startFocused: boolean
  focusedTimes: FocusTime[]
}

export function trackViewFocus(startClocks: ClocksState, scheduleViewUpdate: () => void) {
  const viewFocus: ViewFocus = {
    startFocused: document.hasFocus(),
    focusedTimes: [],
  }
  if (viewFocus.startFocused) {
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
      const lastFocusedtime = viewFocus.focusedTimes[viewFocus.focusedTimes.length - 1]
      if (lastFocusedtime != null && lastFocusedtime.currently_focused === true) {
        lastFocusedtime.duration = toServerDuration(elapsed(lastFocusedtime.start, endTime))
      }
    },
    viewFocus,
  }

  function addNewFocusTime(overrideStart?: RelativeTime) {
    const now = relativeNow()
    const start = overrideStart ?? now
    if (viewFocus.focusedTimes.length > MAX_NUMBER_OF_FOCUSED_TIME) {
      return
    }
    viewFocus.focusedTimes.push({
      start: toServerRelativeTime(start),
      duration: toServerDuration(elapsed(start, now)),
      currently_focused: true,
    })
    scheduleViewUpdate()
  }

  function closeLastFocusTime() {
    const lastIndex = viewFocus.focusedTimes.length - 1

    if (lastIndex >= 0 && viewFocus.focusedTimes[lastIndex].currently_focused) {
      viewFocus.focusedTimes[lastIndex] = {
        start: toServerRelativeTime(viewFocus.focusedTimes[lastIndex].start),
        duration: toServerDuration(elapsed(viewFocus.focusedTimes[lastIndex].start, relativeNow())),
      }
      scheduleViewUpdate()
    }
  }
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(document, DOM_EVENT.FOCUS, () => onFocusChange())
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(document, DOM_EVENT.BLUR, () => onBlurChange())
}
