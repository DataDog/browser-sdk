import { getEventBridge } from '@openobserve/browser-core'
import type { ViewHistory } from '@openobserve/browser-rum-core'
import type { BrowserRecord } from '../types'

export function startRecordBridge(viewHistory: ViewHistory) {
  const bridge = getEventBridge<'record', BrowserRecord>()!

  return {
    addRecord: (record: BrowserRecord) => {
      // Get the current active view, not at the time of the record, aligning with the segment logic.
      // This approach could potentially associate the record to an incorrect view, in case the record date is in the past (e.g. frustration records).
      // However the risk is minimal. We could address the issue when potential negative impact are identified.
      const view = viewHistory.findView()!
      bridge.send('record', record, view.id)
    },
  }
}
