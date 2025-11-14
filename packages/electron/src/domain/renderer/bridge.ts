import { contextBridge, ipcRenderer } from 'electron'
import type { DatadogEventBridge } from '@datadog/browser-core/src/transport'

export function setupRendererBridge() {
  contextBridge.exposeInMainWorld('DatadogEventBridge', {
    getCapabilities() {
      return '[]'
    },
    getPrivacyLevel() {
      return 'mask'
    },
    getAllowedWebViewHosts() {
      return JSON.stringify([location.hostname])
    },
    send(msg: string) {
      void ipcRenderer.invoke('datadog:send', msg)
    },
  } satisfies DatadogEventBridge)
}
