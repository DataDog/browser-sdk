import { getEventBridge } from '@datadog/browser-core'
import type { ViewContexts } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../types'

export function startRecordBridge(viewContexts: ViewContexts) {
  const bridge = getEventBridge<'record', BrowserRecord>()!

  return {
    addRecord: (record: BrowserRecord) => {
      // Get the current active view, not at the time of the record, aligning with the segment logic.
      // This approach could potentially associate the record to an incorrect view, in case the record date is in the past (e.g. frustration records).
      // However the risk is minimal. We could address the issue when potential negative impact are identified.
      const view = viewContexts.findView()!
      bridge.send('record', record, view.id)
    },
  }
}
