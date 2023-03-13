import type { BackgroundToDevtoolsMessage, DevtoolsToBackgroundMessage } from '../common/types'
import { isDisconnectError } from '../common/isDisconnectError'
import { createLogger } from '../common/logger'
import { notifyDisconnectEvent } from './disconnectEvent'

const logger = createLogger('backgroundScriptConnection')

let backgroundScriptConnection: chrome.runtime.Port | undefined

export function listenBackgroundMessages(callback: (message: BackgroundToDevtoolsMessage) => void) {
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

export function sendMessageToBackground(message: DevtoolsToBackgroundMessage) {
  if (backgroundScriptConnection) {
    backgroundScriptConnection.postMessage(message)
  }
}
