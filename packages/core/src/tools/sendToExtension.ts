interface BrowserWindow {
  __ddBrowserSdkExtensionCallback?: (message: unknown) => void
}

type ExtensionMessageType = 'logs' | 'record' | 'rum' | 'telemetry'

export function sendToExtension(type: ExtensionMessageType, payload: unknown) {
  const callback = (window as BrowserWindow).__ddBrowserSdkExtensionCallback
  if (callback) {
    callback({ type, payload })
  }
}
