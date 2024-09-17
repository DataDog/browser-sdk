import { assign, runOnReadyState } from '@datadog/browser-core'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'
import { getDocumentTraceId } from '../tracing/getDocumentTraceId'
import { getNavigationEntry } from '../../browser/performanceUtils'
import { FAKE_INITIAL_DOCUMENT } from './resourceUtils'

export function retrieveInitialDocumentResourceTiming(
  configuration: RumConfiguration,
  callback: (timing: RumPerformanceResourceTiming) => void
) {
  runOnReadyState(configuration, 'interactive', () => {
    const entry = assign(getNavigationEntry().toJSON(), {
      entryType: RumPerformanceEntryType.RESOURCE as const,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      traceId: getDocumentTraceId(document),
      toJSON: () => assign({}, entry, { toJSON: undefined }),
    })
    callback(entry)
  })
}
