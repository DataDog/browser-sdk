import { globalObject } from '@datadog/js-core/util'

interface BrowserWindow {
  __ddBrowserSdkExtensionCallback?: (message: unknown) => void
}

type ExtensionMessageType = 'logs' | 'record' | 'rum' | 'telemetry' | 'resource'

export function sendToExtension(type: ExtensionMessageType, payload: unknown) {
  const callback = (globalObject as BrowserWindow).__ddBrowserSdkExtensionCallback
  if (callback) {
    callback({ type, payload })
  }
}
