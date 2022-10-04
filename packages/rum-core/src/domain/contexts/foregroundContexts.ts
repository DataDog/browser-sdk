import type { RelativeTime, Duration } from '@datadog/browser-core'
import { addDuration, addEventListener, DOM_EVENT, elapsed, relativeNow, toServerDuration } from '@datadog/browser-core'
import type { InForegroundPeriod } from '../../rawRumEvent.types'

// Arbitrary value to cap number of element mostly for backend & to save bandwidth
export const MAX_NUMBER_OF_SELECTABLE_FOREGROUND_PERIODS = 500
// Arbitrary value to cap number of element mostly for memory consumption in the browser
export const MAX_NUMBER_OF_STORED_FOREGROUND_PERIODS = 2500

export interface ForegroundContexts {
  isInForegroundAt: (startTime: RelativeTime) => boolean | undefined
  selectInForegroundPeriodsFor: (startTime: RelativeTime, duration: Duration) => InForegroundPeriod[] | undefined
  stop: () => void
}

export interface ForegroundPeriod {
  start: RelativeTime
  end?: RelativeTime
}

let foregroundPeriods: ForegroundPeriod[] = []

export function startForegroundContexts(): ForegroundContexts {
  if (document.hasFocus()) {
    addNewForegroundPeriod()
  }

  const { stop: stopForegroundTracking } = trackFocus(addNewForegroundPeriod)
  const { stop: stopBlurTracking } = trackBlur(closeForegroundPeriod)
  return {
    isInForegroundAt,
    selectInForegroundPeriodsFor,
    stop: () => {
      foregroundPeriods = []
      stopForegroundTracking()
      stopBlurTracking()
    },
  }
}

export function addNewForegroundPeriod() {
  if (foregroundPeriods.length > MAX_NUMBER_OF_STORED_FOREGROUND_PERIODS) {
    return
  }
  const currentForegroundPeriod = foregroundPeriods[foregroundPeriods.length - 1]
  const now = relativeNow()
  if (currentForegroundPeriod !== undefined && currentForegroundPeriod.end === undefined) {
    return
  }
  foregroundPeriods.push({
    start: now,
  })
}

export function closeForegroundPeriod() {
  if (foregroundPeriods.length === 0) {
    return
  }
  const currentForegroundPeriod = foregroundPeriods[foregroundPeriods.length - 1]
  const now = relativeNow()
  if (currentForegroundPeriod.end !== undefined) {
    return
  }
  currentForegroundPeriod.end = now
}

function trackFocus(onFocusChange: () => void) {
  return addEventListener(window, DOM_EVENT.FOCUS, (event) => {
    if (!event.isTrusted) {
      return
    }
    onFocusChange()
  })
}

function trackBlur(onBlurChange: () => void) {
  return addEventListener(window, DOM_EVENT.BLUR, (event) => {
    if (!event.isTrusted) {
      return
    }
    onBlurChange()
  })
}

function isInForegroundAt(startTime: RelativeTime): boolean {
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

function selectInForegroundPeriodsFor(eventStartTime: RelativeTime, duration: Duration): InForegroundPeriod[] {
  const eventEndTime = addDuration(eventStartTime, duration)
  const filteredForegroundPeriods: InForegroundPeriod[] = []

  const earliestIndex = Math.max(0, foregroundPeriods.length - MAX_NUMBER_OF_SELECTABLE_FOREGROUND_PERIODS)
  for (let i = foregroundPeriods.length - 1; i >= earliestIndex; i--) {
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
