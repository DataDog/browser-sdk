import type { Observable } from '@datadog/browser-core'
import { monitor } from '@datadog/browser-core'
import { ipcMain } from 'electron'
import type { RumEvent } from '@datadog/browser-rum-core'
import type { LogsEvent } from '@datadog/browser-logs'
import type { CollectedRumEvent } from '../rum/events'

interface BridgeEvent {
  eventType: 'rum' | 'internal_telemetry' | 'log'
  event: unknown
}

export function setupMainBridge(
  rumEventObservable: Observable<CollectedRumEvent>,
  logsEventObservable: Observable<LogsEvent>
) {
  ipcMain.handle(
    'datadog:send',
    monitor((_event, msg: string) => {
      const bridgeEvent = JSON.parse(msg) as BridgeEvent

      switch (bridgeEvent.eventType) {
        case 'rum':
        case 'internal_telemetry':
          rumEventObservable.notify({ event: bridgeEvent.event as RumEvent, source: 'renderer' })
          break
        case 'log':
          logsEventObservable.notify(bridgeEvent.event as LogsEvent)
          break
        default:
          console.log('Unhandled event type', bridgeEvent)
      }
    })
  )
}
