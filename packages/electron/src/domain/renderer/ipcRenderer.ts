import type { IpcRenderer } from 'electron'
import { createSpanIdentifier, createTraceIdentifier } from '@datadog/browser-rum-core/src/domain/tracing/identifier'
import { ipcRenderer } from 'electron'
import type { DatadogCarrier } from '../trace'

function createDatadogCarrier(): DatadogCarrier {
  const spanId = createSpanIdentifier().toString()
  const traceId = createTraceIdentifier().toString()

  return {
    __dd_carrier: true,
    'x-datadog-origin': 'rum',
    'x-datadog-parent-id': spanId,
    'x-datadog-sampling-priority': '1',
    'x-datadog-trace-id': traceId,
  }
}

function withDatadogCarrier<T extends (...args: any[]) => R, R>(fn: T): (...args: Parameters<T>) => R {
  return (...args: Parameters<T>) => fn(...args, createDatadogCarrier())
}

export function createIpcRenderer(): IpcRenderer {
  const ddIpcRenderer = { ...ipcRenderer }

  ddIpcRenderer.on = withDatadogCarrier(ipcRenderer.on.bind(ipcRenderer))
  ddIpcRenderer.off = withDatadogCarrier(ipcRenderer.off.bind(ipcRenderer))
  ddIpcRenderer.once = withDatadogCarrier(ipcRenderer.once.bind(ipcRenderer))
  ddIpcRenderer.addListener = withDatadogCarrier(ipcRenderer.addListener.bind(ipcRenderer))
  ddIpcRenderer.removeListener = withDatadogCarrier(ipcRenderer.removeListener.bind(ipcRenderer))
  ddIpcRenderer.send = withDatadogCarrier(ipcRenderer.send.bind(ipcRenderer))
  ddIpcRenderer.invoke = withDatadogCarrier(ipcRenderer.invoke.bind(ipcRenderer))
  ddIpcRenderer.sendSync = withDatadogCarrier(ipcRenderer.sendSync.bind(ipcRenderer))
  ddIpcRenderer.sendToHost = withDatadogCarrier(ipcRenderer.sendToHost.bind(ipcRenderer))

  // TODO: Do something for ipcRenderer.postMessage
  // see https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendererpostmessagechannel-message-transfer

  return ddIpcRenderer
}
