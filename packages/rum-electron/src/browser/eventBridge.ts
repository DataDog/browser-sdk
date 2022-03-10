import type { RumSessionManager } from '@datadog/browser-rum-core'
import { combine, display } from '@datadog/browser-core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { contextBridge, ipcRenderer } from 'electron'
import type { Batch } from '../transport/batch'

export const BRIDGE_CHANNEL = 'datadog-rum-event-bridge'

export function registerEventBridge() {
  contextBridge.exposeInMainWorld('DatadogEventBridge', {
    send(serializedEvent: string) {
      ipcRenderer.send(BRIDGE_CHANNEL, serializedEvent)
    },
    getAllowedWebViewHosts() {
      return JSON.stringify([window.location.hostname])
    },
  })
}

export function getElectronEventBridgeListener(
  sessionManager: RumSessionManager,
  applicationId: string,
  rumBatch: Batch,
  internalMonitoringBatch?: Batch
) {
  return (serializedEvent: string) => {
    const { eventType, event } = JSON.parse(serializedEvent.toString())
    const session = sessionManager.findTrackedSession()
    if (!session) {
      return
    }
    const completedEvent = combine(event, {
      session: { id: session.id },
      application: { id: applicationId },
    })
    if (eventType === 'rum') {
      if (completedEvent.type === 'view') {
        rumBatch.upsert(completedEvent, completedEvent.view.id)
      } else {
        rumBatch.add(completedEvent)
      }
    } else if (eventType === 'internal_log' || eventType === 'internal_telemetry') {
      if (internalMonitoringBatch) {
        internalMonitoringBatch.add(completedEvent)
      } else {
        display.warn('internal monitoring event received but no endpoint has been configured')
      }
    } else {
      display.error(`unknown event type: ${eventType as string} received through event bridge`)
    }
  }
}
