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
  addMonitoringMessage,
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

export interface ForegroundPeriod {
  start: RelativeTime
  end?: RelativeTime
}

let foregroundPeriods: ForegroundPeriod[] = []

export function startForegroundContexts(configuration: Configuration) {
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
  if (currentForegroundPeriod != null && currentForegroundPeriod.end === undefined) {
    addMonitoringMessage('Previous foreground periods not closed. Continuing current one')
    return
  }
  foregroundPeriods.push({
    start: relativeNow(),
  })
}

function closeForegroundPeriod() {
  if (foregroundPeriods.length === 0) {
    addMonitoringMessage('No foreground period')
    return
  }
  const currentForegroundPeriod = foregroundPeriods[foregroundPeriods.length - 1]
  if (currentForegroundPeriod.end !== undefined) {
    addMonitoringMessage('Current foreground period already closed')
    return
  }
  currentForegroundPeriod.end = relativeNow()
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, () => onFocusChange())
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, () => onBlurChange())
}

function getInForeground(startTime: RelativeTime): boolean {
  for (let i = foregroundPeriods.length - 1; i >= 0; i--) {
    const foregroundPeriod = foregroundPeriods[i]
    if (foregroundPeriod.end !== undefined && startTime > foregroundPeriod.end) {
      break
    }
    if (startTime > foregroundPeriod.start && (foregroundPeriod.end == null || startTime < foregroundPeriod.end)) {
      return true
    }
  }
  return false
}

function getInForegroundPeriods(eventStartTime: RelativeTime, duration: ServerDuration): InForegroundPeriod[] {
  const eventEndTime = ((eventStartTime as number) + (toDuration(duration) as number)) as RelativeTime
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
      foregroundPeriod.end == null || eventEndTime < foregroundPeriod.end ? eventEndTime : foregroundPeriod.end
    const endDuration = elapsed(startTime, endTime)
    filteredForegroundPeriods.unshift({
      start: toServerDuration(startDuration),
      duration: toServerDuration(endDuration),
    })
  }
  return filteredForegroundPeriods
}
