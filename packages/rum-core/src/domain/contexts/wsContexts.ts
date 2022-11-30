import {
  getTimeStamp,
  instrumentConstructorAndCallOriginal,
  instrumentMethodAndCallOriginal,
  monitor,
  timeStampNow,
} from '@datadog/browser-core'
import type { Context, TimeStamp, RelativeTime } from '@datadog/browser-core'

export type WsContexts = ReturnType<typeof startWsContexts>

const READY_STATES = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const

const EVENT_TYPES = {
  OPEN: 'OPEN',
  CLOSE: 'CLOSE',
  ERROR: 'ERROR',
  RECEIVED: 'RECEIVED',
  SENT: 'SENT',
} as const

type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES]

interface WsInfo extends Context {
  url: string
  state: typeof READY_STATES[number]
  totalSent: number
  totalReceived: number
  events: WsEvent[]
}

interface WsEvent extends Context {
  date: TimeStamp
  size?: number
  type: EventType
}

const wsMap = new WeakMap<WebSocket, WsInfo>()

declare global {
  interface Window {
    wsInfos: WsInfo[]
  }
}

export function startWsContexts() {
  window.wsInfos = []

  instrumentMethodAndCallOriginal(WebSocket.prototype, 'send', {
    before(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      const wsInfo = wsMap.get(this)
      if (!wsInfo) {
        console.error('WebSocket instance not found')
        return
      }
      const size = computeSize(data)
      const wsEvent: WsEvent = {
        date: timeStampNow(),
        type: EVENT_TYPES.SENT,
        size,
      }
      wsInfo.events.push(wsEvent)
      wsInfo.totalSent += size
      wsInfo.state = READY_STATES[this.readyState]
    },
  })

  instrumentConstructorAndCallOriginal(window, 'WebSocket', {
    after: (ws: WebSocket, url: string | URL, _protocols?: string | string[]) => {
      const wsInfo: WsInfo = {
        url: url instanceof URL ? url.href : url,
        state: READY_STATES[ws.readyState],
        totalSent: 0,
        totalReceived: 0,
        events: [],
      }
      wsMap.set(ws, wsInfo)
      window.wsInfos.push(wsInfo)

      ws.addEventListener(
        'message',
        monitor((event) => {
          const size = computeSize(event.data)
          const wsEvent: WsEvent = {
            date: getTimeStamp(event.timeStamp as RelativeTime),
            type: EVENT_TYPES.RECEIVED,
            size,
          }
          wsInfo.events.push(wsEvent)
          wsInfo.totalReceived += size
          wsInfo.state = READY_STATES[ws.readyState]
        })
      )
      ws.addEventListener(
        'close',
        monitor((event) => {
          const wsEvent: WsEvent = {
            date: getTimeStamp(event.timeStamp as RelativeTime),
            type: EVENT_TYPES.CLOSE,
          }
          wsInfo.events.push(wsEvent)
          wsInfo.state = READY_STATES[ws.readyState]
        })
      )
      ws.addEventListener(
        'open',
        monitor((event) => {
          const wsEvent: WsEvent = {
            date: getTimeStamp(event.timeStamp as RelativeTime),
            type: EVENT_TYPES.OPEN,
          }
          wsInfo.events.push(wsEvent)
          wsInfo.state = READY_STATES[ws.readyState]
        })
      )
      ws.addEventListener(
        'error',
        monitor((event) => {
          const wsEvent: WsEvent = {
            date: getTimeStamp(event.timeStamp as RelativeTime),
            type: EVENT_TYPES.ERROR,
          }
          wsInfo.events.push(wsEvent)
          wsInfo.state = READY_STATES[ws.readyState]
        })
      )
    },
  })

  return {
    get(): Context {
      return {
        ws: window.wsInfos,
      }
    },
  }
}

function computeSize(data: any) {
  return new Blob([data]).size
}
