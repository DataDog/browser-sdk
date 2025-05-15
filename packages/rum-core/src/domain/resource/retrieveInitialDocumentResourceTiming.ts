import { runOnReadyState } from '@flashcatcloud/browser-core'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'
import { getDocumentTraceId } from '../tracing/getDocumentTraceId'
import { getNavigationEntry } from '../../browser/performanceUtils'
import { FAKE_INITIAL_DOCUMENT } from './resourceUtils'

export function retrieveInitialDocumentResourceTiming(
  configuration: RumConfiguration,
  callback: (timing: RumPerformanceResourceTiming) => void,
  getNavigationEntryImpl = getNavigationEntry
) {
  runOnReadyState(configuration, 'interactive', () => {
    const navigationEntry = getNavigationEntryImpl()
    const entry: RumPerformanceResourceTiming = Object.assign(navigationEntry.toJSON(), {
      entryType: RumPerformanceEntryType.RESOURCE as const,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      // The ResourceTiming duration entry should be `responseEnd - startTime`. With
      // NavigationTiming entries, `startTime` is always 0, so set it to `responseEnd`.
      duration: navigationEntry.responseEnd,
      traceId: getDocumentTraceId(document),
      toJSON: () => ({ ...entry, toJSON: undefined }),
    })
    callback(entry)
  })
}
