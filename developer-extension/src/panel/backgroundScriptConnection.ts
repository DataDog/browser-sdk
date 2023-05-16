import type { BackgroundToDevtoolsMessage, DevtoolsToBackgroundMessage } from '../common/types'
import { isDisconnectError } from '../common/isDisconnectError'
import { createLogger } from '../common/logger'
import { EventListeners } from '../common/eventListeners'

const logger = createLogger('backgroundScriptConnection')

export const onBackgroundMessage = new EventListeners<BackgroundToDevtoolsMessage>()
export const onBackgroundDisconnection = new EventListeners<void>()

let backgroundScriptConnection: chrome.runtime.Port | undefined

connectToBackgroundScript()

function connectToBackgroundScript() {
  try {
    backgroundScriptConnection = chrome.runtime.connect({
      name: `devtools-panel-for-tab-${chrome.devtools.inspectedWindow.tabId}`,
    })

    backgroundScriptConnection.onDisconnect.addListener(() => {
      logger.error('disconnected', chrome.runtime.lastError)
      onBackgroundDisconnection.notify()
    })

    backgroundScriptConnection.onMessage.addListener((backgroundMessage) =>
      onBackgroundMessage.notify(backgroundMessage)
    )
  } catch (error) {
    if (isDisconnectError(error)) {
      onBackgroundDisconnection.notify()
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
