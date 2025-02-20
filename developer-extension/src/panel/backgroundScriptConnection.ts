import type { BackgroundToDevtoolsMessage, DevtoolsToBackgroundMessage } from '../common/extension.types'
import { isDisconnectError } from '../common/isDisconnectError'
import { createLogger } from '../common/logger'
import { EventListeners } from '../common/eventListeners'

const logger = createLogger('backgroundScriptConnection')

export const onBackgroundMessage = new EventListeners<BackgroundToDevtoolsMessage>()
export const onBackgroundDisconnection = new EventListeners<void>()

let backgroundScriptConnection: chrome.runtime.Port | undefined

export function connectToBackgroundScript() {
  try {
    backgroundScriptConnection = chrome.runtime.connect({
      name: `devtools-panel-for-tab-${chrome.devtools.inspectedWindow.tabId}`,
    })

    backgroundScriptConnection.onDisconnect.addListener(() => {
      // The background script can be disconnected for (at least) two main reasons:
      // * the extension is updated and its context is invalidated
      // * the background script has been idle for too long
      //
      // We want to try to automatically reconnect, and notify only if the extension context is
      // invalidated (in which case, calling `chrome.runtime.connect` should throw an exception).
      //
      // Somehow, if we try to reconnect right after the extension is updated, the connection
      // unexpectedly succeeds (does not throw or notify onDisconnect). It turns out that we need to
      // wait a few milliseconds to have the expected behavior.
      setTimeout(() => {
        connectToBackgroundScript()
      }, 100)
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
