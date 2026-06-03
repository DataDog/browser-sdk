import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import type { GlobalObject } from '../tools/globalObject'
import { globalObject } from '../tools/globalObject'
import { instrumentConstructor, instrumentMethod } from '../tools/instrumentMethod'
import { Observable } from '../tools/observable'
import { addEventListener } from './addEventListener'

interface WebSocketObservableConfiguration {
  allowUntrustedEvents?: boolean | undefined
}

type GlobalWithWebSocket = GlobalObject & { WebSocket: typeof WebSocket }

function isGlobalWithWebSocket(global: GlobalObject): global is GlobalWithWebSocket {
  return typeof (global as { WebSocket?: unknown }).WebSocket === 'function'
}

export interface WebSocketConnectingContext {
  state: 'connecting'
  instance: WebSocket
  url: string
  protocols?: string | string[]
  startClocks: ClocksState
}

export interface WebSocketOpenContext {
  state: 'open'
  instance: WebSocket
  openClocks: ClocksState
  protocol: string
}

export interface WebSocketMessageInContext {
  state: 'message-in'
  instance: WebSocket
  size: number
  at: ClocksState
}

export interface WebSocketMessageOutContext {
  state: 'message-out'
  instance: WebSocket
  size: number
  bufferedAmountPreSend: number
  at: ClocksState
}

export interface WebSocketClosedContext {
  state: 'closed'
  instance: WebSocket
  code: number
  reason: string
  wasClean: boolean
  at: ClocksState
}

export type WebSocketContext =
  | WebSocketConnectingContext
  | WebSocketOpenContext
  | WebSocketMessageInContext
  | WebSocketMessageOutContext
  | WebSocketClosedContext

let webSocketObservable: Observable<WebSocketContext> | undefined

// The singleton WebSocket observable applies the latest caller's allowUntrustedEvents policy so
// that the customer's configuration overrides an early call (e.g. from bufferedData) that opts
// in before the customer config is parsed.
let allowUntrustedEvents: boolean | undefined

export function initWebSocketObservable(
  configuration: WebSocketObservableConfiguration = {}
): Observable<WebSocketContext> {
  if (configuration.allowUntrustedEvents !== undefined) {
    allowUntrustedEvents = configuration.allowUntrustedEvents
  }

  if (!webSocketObservable) {
    webSocketObservable = createWebSocketObservable()
  }

  return webSocketObservable
}

function createWebSocketObservable() {
  return new Observable<WebSocketContext>((observable) => {
    if (!isGlobalWithWebSocket(globalObject)) {
      return undefined
    }

    const stopListeners: Array<() => void> = []

    const { stop: stopInstrumentingConstructor } = instrumentConstructor(
      globalObject,
      'WebSocket',
      ({ parameters, onPostCall }) => {
        const url = String(parameters[0])
        const protocols = parameters[1]
        const startClocks = clocksNow()
        onPostCall((instance) => {
          observable.notify({
            state: 'connecting',
            instance,
            url,
            ...(protocols !== undefined ? { protocols } : {}),
            startClocks,
          })
          attachInstanceListeners(instance, observable, stopListeners)
        })
      }
    )

    const { stop: stopInstrumentingSend } = instrumentMethod(
      globalObject.WebSocket.prototype,
      'send',
      ({ target: instance, parameters: [data], onPostCall }) => {
        const size = computePayloadSize(data)
        const bufferedAmountPreSend = instance.bufferedAmount
        onPostCall(() => {
          observable.notify({
            state: 'message-out',
            instance,
            size,
            bufferedAmountPreSend,
            at: clocksNow(),
          })
        })
      }
    )

    return () => {
      stopInstrumentingConstructor()
      stopInstrumentingSend()
      stopListeners.forEach((stop) => stop())
      stopListeners.length = 0
    }
  })
}

function attachInstanceListeners(
  instance: WebSocket,
  observable: Observable<WebSocketContext>,
  stopListeners: Array<() => void>
) {
  const { stop: stopOpen } = addEventListener({ allowUntrustedEvents }, instance, 'open', () => {
    observable.notify({
      state: 'open',
      instance,
      openClocks: clocksNow(),
      protocol: instance.protocol || '',
    })
  })
  const { stop: stopMessage } = addEventListener({ allowUntrustedEvents }, instance, 'message', (event) => {
    observable.notify({
      state: 'message-in',
      instance,
      size: computePayloadSize(event.data),
      at: clocksNow(),
    })
  })
  const { stop: stopClose } = addEventListener({ allowUntrustedEvents }, instance, 'close', (event) => {
    observable.notify({
      state: 'closed',
      instance,
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      at: clocksNow(),
    })
  })

  stopListeners.push(stopOpen, stopMessage, stopClose)
}

function computePayloadSize(data: unknown): number {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).byteLength
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength
  }
  if (ArrayBuffer.isView(data)) {
    return data.byteLength
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data.size
  }
  return 0
}

/**
 * Reset the WebSocket observable global state. Test-only.
 *
 * @internal
 */
export function resetWebSocketObservable() {
  webSocketObservable = undefined
  allowUntrustedEvents = undefined
}
