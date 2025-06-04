import { runOnReadyState } from '@datadog/browser-core'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'
import { getDocumentTraceId } from '../tracing/getDocumentTraceId'
import { getNavigationEntry, getActivationStart } from '../../browser/performanceUtils'
import { FAKE_INITIAL_DOCUMENT } from './resourceUtils'

export function retrieveInitialDocumentResourceTiming(
  configuration: RumConfiguration,
  callback: (timing: RumPerformanceResourceTiming) => void,
  getNavigationEntryImpl = getNavigationEntry,
  getActivationStartImpl = getActivationStart
) {
  runOnReadyState(configuration, 'interactive', () => {
    const navigationEntry = getNavigationEntryImpl()
    const activationStart = getActivationStartImpl()
    const isPrerendered = (document as Document & { prerendering?: boolean })?.prerendering || activationStart > 0

    const adjustTiming = (value: number) => {
      if (isPrerendered && activationStart > 0 && value > 0) {
        return Math.max(0, value - activationStart)
      }
      return value
    }

    const entry: RumPerformanceResourceTiming = Object.assign(navigationEntry.toJSON(), {
      entryType: RumPerformanceEntryType.RESOURCE as const,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      fetchStart: adjustTiming(navigationEntry.fetchStart),
      domainLookupStart: adjustTiming(navigationEntry.domainLookupStart),
      domainLookupEnd: adjustTiming(navigationEntry.domainLookupEnd),
      connectStart: adjustTiming(navigationEntry.connectStart),
      connectEnd: adjustTiming(navigationEntry.connectEnd),
      requestStart: adjustTiming(navigationEntry.requestStart),
      responseStart: adjustTiming(navigationEntry.responseStart),
      responseEnd: adjustTiming(navigationEntry.responseEnd),
      redirectStart: adjustTiming(navigationEntry.redirectStart),
      redirectEnd: adjustTiming(navigationEntry.redirectEnd),
      // The ResourceTiming duration entry should be `responseEnd - startTime`. With
      // NavigationTiming entries, `startTime` is always 0, so set it to adjusted responseEnd.
      duration: adjustTiming(navigationEntry.responseEnd),
      traceId: getDocumentTraceId(document),
      deliveryType: isPrerendered ? ('navigational-prefetch' as const) : '',
      toJSON: () => ({ ...entry, toJSON: undefined }),
    })
    callback(entry)
  })
}
