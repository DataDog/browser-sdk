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
  const inForeground = foregroundPeriods.some(
    (foreground) => startTime > foreground.start && (foreground.end == null || startTime < foreground.end)
  )
  return inForeground
}

function getInForegroundPeriods(eventStartTime: RelativeTime, duration: ServerDuration): InForegroundPeriod[] {
  const eventEndTime = ((eventStartTime as number) + (toDuration(duration) as number)) as RelativeTime
  return foregroundPeriods
    .filter((foreground) => {
      const eventEndsBeforeForegroundStart = eventEndTime < foreground.start
      const eventStartsAfterForegroundEnds = foreground.end == null || eventStartTime > foreground.end

      return !eventEndsBeforeForegroundStart || !eventStartsAfterForegroundEnds
    })
    .map((foregroundPeriod) => {
      const startTime = eventStartTime > foregroundPeriod.start ? eventStartTime : foregroundPeriod.start
      const startDuration = elapsed(eventStartTime, startTime)
      const endTime =
        foregroundPeriod.end == null || eventEndTime < foregroundPeriod.end ? eventEndTime : foregroundPeriod.end
      const endDuration = elapsed(startTime, endTime)
      return {
        start: toServerDuration(startDuration),
        duration: toServerDuration(endDuration),
      }
    })
}
