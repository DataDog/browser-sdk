import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  noop,
  display,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  createValueHistory,
  SESSION_TIME_OUT_DELAY,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import {
  createPerformanceObservable,
  RumPerformanceEntryType,
  supportPerformanceTimingEvent,
} from '../../browser/performanceObservable'

export interface SoftNavigationContext {
  navigationId: string
  name: string
  startTime: RelativeTime
}

export interface SoftNavigationContexts {
  findSoftNavigationByTime(startTime: RelativeTime): SoftNavigationContext | undefined
  findAll(startTime?: RelativeTime, duration?: Duration): SoftNavigationContext[]
}

const NOOP_SOFT_NAVIGATION_CONTEXTS: SoftNavigationContexts = {
  findSoftNavigationByTime: () => undefined,
  findAll: () => [],
}

export function startSoftNavigationCollection(configuration: RumConfiguration) {
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.SOFT_NAVIGATION)) {
    return { stop: noop, softNavigationContexts: NOOP_SOFT_NAVIGATION_CONTEXTS }
  }

  if (!supportPerformanceTimingEvent(RumPerformanceEntryType.SOFT_NAVIGATION)) {
    display.debug('Soft navigation is not supported by this browser.')
    return { stop: noop, softNavigationContexts: NOOP_SOFT_NAVIGATION_CONTEXTS }
  }

  const history = createValueHistory<SoftNavigationContext>({ expireDelay: SESSION_TIME_OUT_DELAY })

  const subscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.SOFT_NAVIGATION,
    buffered: true,
  }).subscribe((entries) => {
    for (const entry of entries) {
      history.closeActive(entry.startTime)
      history.add(
        { navigationId: entry.navigationId, name: entry.name, startTime: entry.startTime },
        entry.startTime
      )
    }
  })

  const softNavigationContexts: SoftNavigationContexts = {
    findSoftNavigationByTime: (startTime: RelativeTime) => history.find(startTime),
    findAll: (startTime?: RelativeTime, duration?: Duration) => history.findAll(startTime, duration),
  }

  return {
    stop: () => {
      subscription.unsubscribe()
      history.stop()
    },
    softNavigationContexts,
  }
}
