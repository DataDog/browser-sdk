import { getEventBridge } from '@datadog/browser-core'
import type { ViewContexts } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../types'

export function startRecordBridge(viewContexts: ViewContexts) {
  const bridge = getEventBridge<'record', BrowserRecord>()!

  return {
    addRecord: (record: BrowserRecord) => {
      const view = viewContexts.findView()
      if (!view) {
        return
      }
      bridge.send('record', record, view.id)
    },
  }
}
