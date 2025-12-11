import type { IpcRenderer } from 'electron'
import { contextBridge, ipcRenderer } from 'electron'
import { createSpanIdentifier, createTraceIdentifier } from '@datadog/browser-rum-core'
import type { Observable } from '@datadog/browser-core'
import { BufferedObservable, clocksNow, elapsed, toServerDuration } from '@datadog/browser-core'
import type { DatadogCarrier, SpanInfo } from '../trace/trace'

function isThenable(value: any): value is Promise<any> {
  return typeof value === 'object' && value !== null && 'then' in value
}

const SPAN_NAME_PREFIX = 'ipcRenderer'

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

function withDatadogCarrier<T extends (...args: any[]) => R, R>(
  observable: Observable<SpanInfo>,
  method: string,
  fn: T
): (...args: Parameters<T>) => R {
  return (...args: Parameters<T>) => {
    const carrier = createDatadogCarrier()
    const startClock = clocksNow()
    const channel = args[0]

    const result = fn(...args, carrier)

    const notifySpan = () => {
      observable.notify({
        startClocks: startClock,
        spanId: parseInt(carrier['x-datadog-parent-id'], 10).toString(),
        traceId: parseInt(carrier['x-datadog-trace-id'], 10).toString(),
        duration: toServerDuration(elapsed(startClock.timeStamp, clocksNow().timeStamp)),
        name: `${SPAN_NAME_PREFIX}.${method}.${channel}`,
      })
    }

    if (isThenable(result)) {
      return result.then((data: any) => {
        notifySpan()

        return data // eslint-disable-line @typescript-eslint/no-unsafe-return
      }) as R
    }

    notifySpan()

    return result
  }
}

export function monitorIpcRenderer(): IpcRenderer {
  const ddIpcRenderer = { ...ipcRenderer }
  const observable = new BufferedObservable<SpanInfo>(100)

  window.dd_electron_internal_api = {
    onSpan: (callback: (spanInfo: SpanInfo) => void) => {
      const subscription = observable.subscribe((spanInfo) => callback(spanInfo))

      return () => subscription.unsubscribe()
    },
  }
  try {
    contextBridge.exposeInMainWorld('dd_electron_internal_api', window.dd_electron_internal_api)
  } catch {
    // contextBridge API can only be used when contextIsolation is enabled
  }

  ddIpcRenderer.on = withDatadogCarrier(observable, 'on', ipcRenderer.on.bind(ipcRenderer))
  ddIpcRenderer.off = withDatadogCarrier(observable, 'off', ipcRenderer.off.bind(ipcRenderer))
  ddIpcRenderer.once = withDatadogCarrier(observable, 'once', ipcRenderer.once.bind(ipcRenderer))
  ddIpcRenderer.addListener = withDatadogCarrier(observable, 'addListener', ipcRenderer.addListener.bind(ipcRenderer))
  ddIpcRenderer.removeListener = withDatadogCarrier(
    observable,
    'removeListener',
    ipcRenderer.removeListener.bind(ipcRenderer)
  )
  ddIpcRenderer.send = withDatadogCarrier(observable, 'send', ipcRenderer.send.bind(ipcRenderer))
  ddIpcRenderer.invoke = withDatadogCarrier(observable, 'invoke', ipcRenderer.invoke.bind(ipcRenderer))
  ddIpcRenderer.sendSync = withDatadogCarrier(observable, 'sendSync', ipcRenderer.sendSync.bind(ipcRenderer))
  ddIpcRenderer.sendToHost = withDatadogCarrier(observable, 'sendToHost', ipcRenderer.sendToHost.bind(ipcRenderer))

  // TODO: Do something for ipcRenderer.postMessage ??
  // see https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendererpostmessagechannel-message-transfer

  return ddIpcRenderer
}
