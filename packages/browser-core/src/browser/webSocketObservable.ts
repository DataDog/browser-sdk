import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import type { GlobalObject } from '../tools/globalObject'
import { globalObject } from '../tools/globalObject'
import { instrumentConstructor, instrumentMethod } from '../tools/instrumentMethod'
import { Observable } from '../tools/observable'
import { computeBytesCount } from '../tools/utils/byteUtils'
import { addEventListener } from './addEventListener'

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

export function initWebSocketObservable(): Observable<WebSocketContext> {
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

    const { stop: stopInstrumentingConstructor } = instrumentConstructor(
      globalObject,
      'WebSocket',
      ({ parameters, onPostCall }) => {
        const protocols = Array.isArray(parameters[1]) ? ([] as string[]).concat(parameters[1]) : parameters[1]
        const startClocks = clocksNow()

        onPostCall((instance) => {
          observable.notify({
            state: 'connecting',
            instance,
            url: instance.url,
            protocols,
            startClocks,
          })

          attachInstanceListeners(instance, observable)
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
    }
  })
}

function attachInstanceListeners(instance: WebSocket, observable: Observable<WebSocketContext>) {
  const { stop: stopOpen } = addEventListener(instance, 'open', () => {
    observable.notify({
      state: 'open',
      instance,
      openClocks: clocksNow(),
      protocol: instance.protocol || '',
    })

    stopOpen()
  })

  const { stop: stopMessage } = addEventListener(instance, 'message', (event) => {
    observable.notify({
      state: 'message-in',
      instance,
      size: computePayloadSize(event.data),
      at: clocksNow(),
    })
  })

  const { stop: stopClose } = addEventListener(instance, 'close', (event) => {
    observable.notify({
      state: 'closed',
      instance,
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      at: clocksNow(),
    })

    stopMessage()
    stopClose()
  })
}

function computePayloadSize(data: unknown): number {
  if (typeof data === 'string') {
    return computeBytesCount(data)
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
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
}
