import { isDisconnectError } from '../common/isDisconnectError'
import type { TelemetryEvent } from '../../../packages/core/src/domain/telemetry'
import type { LogsEvent } from '../../../packages/logs/src/logsEvent.types'
import type { RumEvent } from '../../../packages/rum-core/src/rumEvent.types'
import type { BrowserRecord, BrowserSegmentMetadata } from '../../../packages/rum/src/types'
import { createLogger } from '../common/logger'
import { notifyDisconnectEvent } from './disconnectEvent'

const logger = createLogger('backgroundScriptConnection')

type SdkMessage =
  | {
      type: 'logs'
      payload: LogsEvent
    }
  | {
      type: 'rum'
      payload: RumEvent
    }
  | {
      type: 'telemetry'
      payload: TelemetryEvent
    }
  | {
      type: 'record'
      payload: {
        record: BrowserRecord
        segment: BrowserSegmentMetadata
      }
    }

let backgroundScriptConnection: chrome.runtime.Port | undefined

export function listenSdkMessages(callback: (message: SdkMessage) => void) {
  if (!backgroundScriptConnection) {
    backgroundScriptConnection = createBackgroundScriptConnection()
    if (!backgroundScriptConnection) {
      return () => {
        // nothing to cleanup in this case
      }
    }
  }

  backgroundScriptConnection.onMessage.addListener(callback)
  return () => backgroundScriptConnection!.onMessage.removeListener(callback)
}

function createBackgroundScriptConnection() {
  try {
    const backgroundScriptConnection = chrome.runtime.connect({
      name: `devtools-panel-for-tab-${chrome.devtools.inspectedWindow.tabId}`,
    })

    backgroundScriptConnection.onDisconnect.addListener(() => {
      logger.error('disconnected', chrome.runtime.lastError)
      notifyDisconnectEvent()
    })

    return backgroundScriptConnection
  } catch (error) {
    if (isDisconnectError(error)) {
      notifyDisconnectEvent()
    } else {
      logger.error('While creating connection:', error)
    }
  }
}
