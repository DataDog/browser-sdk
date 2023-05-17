// This content script is executed in the "isolated" execution world. Thus, it has not access to
// the webpage global variables, but can use webextension APIs.
import { isDisconnectError } from '../common/isDisconnectError'
import { createLogger } from '../common/logger'

const logger = createLogger('content-script-isolated')

interface IsolatedWindow {
  unregisterIsolatedScript?(): void
}

const isolatedWindow = window as IsolatedWindow

// Unregister any callback from a previously injected isolated content script
if (isolatedWindow.unregisterIsolatedScript) {
  isolatedWindow.unregisterIsolatedScript()
}
// Register the new callback
window.addEventListener('__ddBrowserSdkMessage', browserSdkMessageListener)

isolatedWindow.unregisterIsolatedScript = () => {
  window.removeEventListener('__ddBrowserSdkMessage', browserSdkMessageListener)
}

// Listen to events from the "main" content script and relays them to the background script via the
// webextension API.
function browserSdkMessageListener(event: unknown) {
  const detail = (event as CustomEvent).detail

  try {
    chrome.runtime.sendMessage(detail).catch((error) => logger.error('Failed to send message:', error))
  } catch (error) {
    // Ignore errors when the background script is unloaded, as this is expected to happen sometimes and we
    // don't want to spam the console in this case.
    if (!isDisconnectError(error)) {
      logger.error('Failed to send message:', error)
    }
  }
}
