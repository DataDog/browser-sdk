import { contextBridge, ipcRenderer } from 'electron'
import type { DatadogEventBridge } from '@datadog/browser-core'

export function setupRendererBridge() {
  ;(window as any).DatadogEventBridge = {
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
  } satisfies DatadogEventBridge

  try {
    contextBridge.exposeInMainWorld('DatadogEventBridge', (window as any).DatadogEventBridge)
  } catch {
    // contextBridge API can only be used when contextIsolation is enabled
  }
}
