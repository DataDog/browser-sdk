import type { Observable } from '@datadog/browser-core'
import type { RumEvent } from '@datadog/browser-rum-core'
import { ipcMain } from 'electron'
import type { CollectedRumEvent } from '../rum/events'

interface BridgeEvent {
  eventType: 'rum'
  event: RumEvent & { session: { id: string } } & { application: { id: string } }
}

export function setupMainBridge(rumEventObservable: Observable<CollectedRumEvent>) {
  ipcMain.handle('datadog:send', (_event, msg: string) => {
    const serverRumEvent = JSON.parse(msg) as BridgeEvent

    if (serverRumEvent.eventType !== 'rum') {
      // TODO: handle other types of events (telemetry, session replays, Logs, ....)
      console.log('not a rum event', serverRumEvent)

      return
    }

    rumEventObservable.notify({ event: serverRumEvent.event, source: 'renderer' })
  })
}
