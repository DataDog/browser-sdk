import { RelativeTime, ServerDuration, Configuration, noop } from '@datadog/browser-core'
import { ForegroundContext, InForegroundPeriod } from '../rawRumEvent.types'

export interface ForegroundContexts {
  getInForeground: (startTime: RelativeTime) => ForegroundContext | undefined
  getInForegroundPeriods: (startTime: RelativeTime, duration?: ServerDuration) => InForegroundPeriod[] | undefined
  stop: () => void
}

export function startForegroundContexts(configuration: Configuration) {
  if (!configuration.isEnabled('track-foreground')) {
    return {
      getInForeground: () => undefined,
      getInForegroundPeriods: () => undefined,
      stop: noop,
    }
  }
  // TODO implement logic
  return {
    getInForeground: () => undefined,
    getInForegroundPeriods: () => undefined,
    stop: noop,
  }
}
