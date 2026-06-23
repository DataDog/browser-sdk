import { globalObject } from './globalObject'

interface BrowserWindow {
  __ooBrowserSdkExtensionCallback?: (message: unknown) => void
}

type ExtensionMessageType = 'logs' | 'record' | 'rum' | 'telemetry'

export function sendToExtension(type: ExtensionMessageType, payload: unknown) {
  const callback = (globalObject as BrowserWindow).__ooBrowserSdkExtensionCallback
  if (callback) {
    callback({ type, payload })
  }
}
