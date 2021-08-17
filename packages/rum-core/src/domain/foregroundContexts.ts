import {
  Configuration,
  noop,
  addEventListener,
  DOM_EVENT,
  RelativeTime,
  elapsed,
  relativeNow,
  Duration,
  addMonitoringMessage,
  toServerDuration,
} from '@datadog/browser-core'
import { InForegroundPeriod } from '../rawRumEvent.types'

// Arbitrary value to cap number of element (mostly for backend)
export const MAX_NUMBER_OF_FOCUSED_TIME = 500
// ignore duplicate focus & blur events if coming in the right after the previous one
// chrome bug: https://bugs.chromium.org/p/chromium/issues/detail?id=1237904
const MAX_TIME_TO_IGNORE_DUPLICATE = 10 as RelativeTime

export interface ForegroundContexts {
  getInForeground: (startTime: RelativeTime) => boolean | undefined
  getInForegroundPeriods: (startTime: RelativeTime, duration: Duration) => InForegroundPeriod[] | undefined
  stop: () => void
}

export interface ForegroundPeriod {
  start: RelativeTime
  end?: RelativeTime
}

let foregroundPeriods: ForegroundPeriod[] = []

export function startForegroundContexts(configuration: Configuration): ForegroundContexts {
  if (!configuration.isEnabled('track-foreground')) {
    return {
      getInForeground: () => undefined,
      getInForegroundPeriods: () => undefined,
      stop: noop,
    }
  }

  if (document.hasFocus()) {
    addNewForegroundPeriod()
  }

  const { stop: stopForegroundTracking } = trackFocus(addNewForegroundPeriod)
  const { stop: stopBlurTracking } = trackBlur(closeForegroundPeriod)
  return {
    getInForeground,
    getInForegroundPeriods,
    stop: () => {
      foregroundPeriods = []
      stopForegroundTracking()
      stopBlurTracking()
    },
  }
}

function addNewForegroundPeriod() {
  if (foregroundPeriods.length > MAX_NUMBER_OF_FOCUSED_TIME) {
    addMonitoringMessage('Reached maximum of foreground time')
    return
  }
  const currentForegroundPeriod = foregroundPeriods[foregroundPeriods.length - 1]
  const now = relativeNow()
  if (currentForegroundPeriod !== undefined && currentForegroundPeriod.end === undefined) {
    if (now - currentForegroundPeriod.start > MAX_TIME_TO_IGNORE_DUPLICATE) {
      addMonitoringMessage('Previous foreground periods not closed. Continuing current one', {
        foregroundPeriods: {
          count: foregroundPeriods.length,
          currentStart: currentForegroundPeriod.start,
          now,
          diff: now - currentForegroundPeriod.start,
        },
      })
    }
    return
  }
  foregroundPeriods.push({
    start: now,
  })
}

function closeForegroundPeriod() {
  if (foregroundPeriods.length === 0) {
    addMonitoringMessage('No foreground period')
    return
  }
  const currentForegroundPeriod = foregroundPeriods[foregroundPeriods.length - 1]
  const now = relativeNow()
  if (currentForegroundPeriod.end !== undefined) {
    if (now - currentForegroundPeriod.end > MAX_TIME_TO_IGNORE_DUPLICATE) {
      addMonitoringMessage('Current foreground period already closed', {
        foregroundPeriods: {
          count: foregroundPeriods.length,
          currentStart: currentForegroundPeriod.start,
          currentEnd: currentForegroundPeriod.end,
          now,
          diff: now - currentForegroundPeriod.end,
        },
        now: relativeNow(),
      })
    }
    return
  }
  currentForegroundPeriod.end = now
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, (event) => {
    if (!event.isTrusted) {
      addMonitoringMessage('Event not trusted for foreground', { eventName: 'focus' })
    }
    onFocusChange()
  })
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, (event) => {
    if (!event.isTrusted) {
      addMonitoringMessage('Event not trusted for foreground', { eventName: 'blur' })
    }
    onBlurChange()
  })
}

function getInForeground(startTime: RelativeTime): boolean {
  for (let i = foregroundPeriods.length - 1; i >= 0; i--) {
    const foregroundPeriod = foregroundPeriods[i]
    if (foregroundPeriod.end !== undefined && startTime > foregroundPeriod.end) {
      break
    }
    if (
      startTime > foregroundPeriod.start &&
      (foregroundPeriod.end === undefined || startTime < foregroundPeriod.end)
    ) {
      return true
    }
  }
  return false
}

function getInForegroundPeriods(eventStartTime: RelativeTime, duration: Duration): InForegroundPeriod[] {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  const eventEndTime = (eventStartTime + duration) as RelativeTime
  const filteredForegroundPeriods: InForegroundPeriod[] = []

  for (let i = foregroundPeriods.length - 1; i >= 0; i--) {
    const foregroundPeriod = foregroundPeriods[i]
    if (foregroundPeriod.end !== undefined && eventStartTime > foregroundPeriod.end) {
      // event starts after the end of the current focus period
      // since the array is sorted, we can stop looking for foreground periods
      break
    }
    if (eventEndTime < foregroundPeriod.start) {
      // event ends before the start of the current focus period
      // continue to previous one
      continue
    }
    const startTime = eventStartTime > foregroundPeriod.start ? eventStartTime : foregroundPeriod.start
    const startDuration = elapsed(eventStartTime, startTime)
    const endTime =
      foregroundPeriod.end === undefined || eventEndTime < foregroundPeriod.end ? eventEndTime : foregroundPeriod.end
    const endDuration = elapsed(startTime, endTime)
    filteredForegroundPeriods.unshift({
      start: toServerDuration(startDuration),
      duration: toServerDuration(endDuration),
    })
  }
  return filteredForegroundPeriods
}
