import {
  ServerDuration,
  Configuration,
  noop,
  addEventListener,
  DOM_EVENT,
  RelativeTime,
  elapsed,
  relativeNow,
  toDuration,
  toServerDuration,
} from '@datadog/browser-core'
import { InForegroundPeriod } from '../rawRumEvent.types'

// Arbitrary value to cap number of element (mostly for backend)
const MAX_NUMBER_OF_FOCUSED_TIME = 500

export interface ForegroundContexts {
  getInForeground: (startTime: RelativeTime) => boolean | undefined
  getInForegroundPeriods: (startTime: RelativeTime, duration: ServerDuration) => InForegroundPeriod[] | undefined
  stop: () => void
}

export interface FocusPeriod {
  start: RelativeTime
  end?: RelativeTime
}

let focusPeriods: FocusPeriod[] = []

export function startForegroundContexts(configuration: Configuration) {
  if (!configuration.isEnabled('track-foreground')) {
    return {
      getInForeground: () => undefined,
      getInForegroundPeriods: () => undefined,
      stop: noop,
    }
  }
  if (document.hasFocus()) {
    addNewFocusPeriod()
  }

  const { stop: stopFocusTracking } = trackFocus(addNewFocusPeriod)
  const { stop: stopBlurTracking } = trackBlur(closeFocusPeriod)
  return {
    getInForeground,
    getInForegroundPeriods,
    stop: () => {
      focusPeriods = []
      stopFocusTracking()
      stopBlurTracking()
    },
  }
}

function addNewFocusPeriod() {
  const now = relativeNow()
  if (focusPeriods.length > MAX_NUMBER_OF_FOCUSED_TIME) {
    return
  }
  const lastIndex = focusPeriods.length - 1
  if (lastIndex >= 0 && focusPeriods[lastIndex].end == null) {
    // already here
    if (focusPeriods[lastIndex].start === now) {
      return
    }
    // close current periods if we miss a blur event
    const { start } = focusPeriods[lastIndex]
    focusPeriods[lastIndex] = {
      start,
      end: now,
    }
  }
  focusPeriods.push({
    start: now,
  })
}

function closeFocusPeriod() {
  const lastIndex = focusPeriods.length - 1
  if (lastIndex >= 0 && focusPeriods[lastIndex].end == null) {
    const { start } = focusPeriods[lastIndex]
    focusPeriods[lastIndex] = {
      start,
      end: relativeNow(),
    }
  }
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, () => onFocusChange())
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, () => onBlurChange())
}

function getInForeground(startTime: RelativeTime): boolean {
  const inForeground = focusPeriods.some(
    (focus) => startTime > focus.start && (focus.end == null || startTime < focus.end)
  )
  return inForeground
}

function getInForegroundPeriods(eventStartTime: RelativeTime, duration: ServerDuration): InForegroundPeriod[] {
  const eventEndTime = ((eventStartTime as number) + (toDuration(duration) as number)) as RelativeTime
  return focusPeriods
    .filter((focus) => {
      const eventEndsBeforeFocusStart = eventEndTime < focus.start
      const eventStartsAfterFocusEnds = focus.end == null || eventStartTime > focus.end

      return !eventEndsBeforeFocusStart || !eventStartsAfterFocusEnds
    })
    .map((focusPeriod) => {
      const startTime = eventStartTime > focusPeriod.start ? eventStartTime : focusPeriod.start
      const startDuration = elapsed(eventStartTime, startTime)
      const endTime = focusPeriod.end == null || eventEndTime < focusPeriod.end ? eventEndTime : focusPeriod.end
      const endDuration = elapsed(startTime, endTime)
      return {
        start: toServerDuration(startDuration),
        duration: toServerDuration(endDuration),
      }
    })
}
