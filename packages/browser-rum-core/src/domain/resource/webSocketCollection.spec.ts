import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebSocketContext } from '@datadog/browser-core'
import { initWebSocketObservable, Observable } from '@datadog/browser-core'
import { mockClock, registerCleanupTask, type Clock } from '@datadog/browser-core/test'
import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { elapsed, relativeToClocks } from '@datadog/js-core/time'
import { mockViewHistory } from '../../../test'
import { VitalType } from '../../rawRumEvent.types'
import type { ViewHistoryEntry } from '../contexts/viewHistory'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { DurationVital } from '../vital/vitalCollection'
import type { WebSocketCompleteEvent } from './webSocketCollection'
import { startWebSocketCollection, trackWebSocket, WEBSOCKET_CONNECTING_VITAL_NAME } from './webSocketCollection'

describe('webSocketCollection', () => {
  let lifeCycle: LifeCycle
  let wsObservable: Observable<WebSocketContext>
  let completed: WebSocketCompleteEvent[]
  let wsInstance: WebSocket
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    lifeCycle = new LifeCycle()
    wsObservable = new Observable<WebSocketContext>()
    completed = []
    wsInstance = {} as WebSocket
    lifeCycle.subscribe(LifeCycleEventType.WEBSOCKET_COMPLETED, (webSocket) => {
      completed.push(webSocket)
    })
  })

  function startTracking(viewHistory = mockViewHistory(), addDurationVital: (vital: DurationVital) => void = vi.fn()) {
    return trackWebSocket(lifeCycle, wsObservable, viewHistory, addDurationVital)
  }

  function notifyConnecting(
    startRelative = 0,
    url = 'wss://example.com/socket',
    startClocks?: ClocksState,
    protocols?: string | string[]
  ) {
    wsObservable.notify({
      state: 'connecting',
      instance: wsInstance,
      url,
      ...(protocols !== undefined ? { protocols } : {}),
      startClocks: startClocks ?? relativeToClocks(clock.relative(startRelative)),
    })
  }

  function notifyOpen(openRelative = 10, protocol = '', openClocks?: ClocksState) {
    wsObservable.notify({
      state: 'open',
      instance: wsInstance,
      openClocks: openClocks ?? relativeToClocks(clock.relative(openRelative)),
      protocol,
    })
  }

  function notifyMessageIn(at: number, size: number) {
    wsObservable.notify({ state: 'message-in', instance: wsInstance, size, at: relativeToClocks(clock.relative(at)) })
  }

  function notifyMessageOut(at: number, size: number, bufferedAmountPreSend = 0) {
    wsObservable.notify({
      state: 'message-out',
      instance: wsInstance,
      size,
      bufferedAmountPreSend,
      at: relativeToClocks(clock.relative(at)),
    })
  }

  function notifyClosed(at: number, code: number, reason: string, wasClean: boolean, atClocks?: ClocksState) {
    wsObservable.notify({
      state: 'closed',
      instance: wsInstance,
      code,
      reason,
      wasClean,
      at: atClocks ?? relativeToClocks(clock.relative(at)),
    })
  }

  describe('handshakeSucceeded', () => {
    it('is true when the open event fired before completion', () => {
      const tracker = startTracking()

      notifyConnecting()
      notifyOpen(10)
      notifyClosed(40, 1000, 'bye', true)
      expect(completed[0].handshakeSucceeded).toBe(true)

      notifyConnecting()
      notifyOpen(10)
      tracker.flushOpenConnections('session_end')
      expect(completed[1].handshakeSucceeded).toBe(true)
    })

    it('is false when the open event never fired before completion', () => {
      const tracker = startTracking()
      notifyConnecting()
      notifyClosed(25, 1006, 'abnormal', false)
      expect(completed[0].handshakeSucceeded).toBe(false)

      notifyConnecting()
      tracker.flushOpenConnections('session_end')
      expect(completed[1].handshakeSucceeded).toBe(false)
    })
  })

  it('emits a completed event on close with tracking_end_reason="close_event"', () => {
    const url = 'wss://example.com/socket'
    const protocol = 'chat.v1'
    const messageInSize = 100
    const messageOutSize = 50
    const bufferedAmount = 8
    const closeCode = 1000
    const closeReason = 'bye'

    startTracking()
    notifyConnecting(0, url)
    notifyOpen(10, protocol)
    notifyMessageIn(20, messageInSize)
    notifyMessageOut(30, messageOutSize, bufferedAmount)
    notifyClosed(40, closeCode, closeReason, true)

    expect(completed.length).toBe(1)
    const webSocket = completed[0]

    expect(webSocket.trackingEndReason).toBe('close_event')
    expect(webSocket.closeCode).toBe(closeCode)
    expect(webSocket.closeReason).toBe(closeReason)
    expect(webSocket.wasClean).toBe(true)
    expect(webSocket.url).toBe(url)
    expect(webSocket.protocol).toBe(protocol)
    expect(webSocket.messagesIn).toEqual({ count: 1, size: messageInSize })
    expect(webSocket.messagesOut).toEqual({ count: 1, size: messageOutSize })
    expect(webSocket.bufferedAmountMax).toBe(bufferedAmount)
  })

  it('generates a unique connection_id per connection', () => {
    startTracking()
    notifyConnecting()
    notifyClosed(1, 1000, 'reason_a', true)
    const firstId = completed[0].connectionId

    wsInstance = {} as WebSocket
    notifyConnecting()
    notifyClosed(1, 1000, 'reason_b', true)

    expect(completed[1].connectionId).not.toBe(firstId)
  })

  it('tracks overlapping connections independently with unique connection_ids', () => {
    const wsA = {} as WebSocket
    const wsB = {} as WebSocket
    const urlA = 'wss://example.com/socket-a'
    const urlB = 'wss://example.com/socket-b'

    startTracking()

    wsInstance = wsA
    notifyConnecting(0, urlA)
    notifyOpen(5)

    wsInstance = wsB
    notifyConnecting(10, urlB)
    notifyOpen(15)

    wsInstance = wsA
    notifyMessageIn(20, 10)

    wsInstance = wsB
    notifyMessageIn(25, 20)

    wsInstance = wsA
    notifyClosed(30, 1000, 'bye-a', true)

    expect(completed.length).toBe(1)
    expect(completed[0].url).toBe(urlA)
    expect(completed[0].messagesIn).toEqual({ count: 1, size: 10 })
    expect(completed[0].trackingEndReason).toBe('close_event')

    wsInstance = wsB
    notifyMessageOut(35, 5)
    notifyClosed(40, 1000, 'bye-b', true)

    expect(completed.length).toBe(2)
    expect(completed[1].url).toBe(urlB)
    expect(completed[1].messagesIn).toEqual({ count: 1, size: 20 })
    expect(completed[1].messagesOut).toEqual({ count: 1, size: 5 })
    expect(completed[1].trackingEndReason).toBe('close_event')
    expect(completed[1].connectionId).not.toBe(completed[0].connectionId)

    expect(completed[0].startClocks.relative).toBeLessThan(completed[1].startClocks.relative)
    expect(completed[1].endClocks.relative).toBeGreaterThan(completed[0].endClocks.relative)
  })

  it('records firstMessageInOffset / firstMessageOutOffset as offsets from open', () => {
    const openAt = 10
    const firstMessageInAt = 13
    const firstMessageOutAt = 17

    startTracking()
    notifyConnecting()
    notifyOpen(openAt)
    notifyMessageIn(firstMessageInAt, 1)
    notifyMessageIn(25, 1) // not first; should not update
    notifyMessageOut(firstMessageOutAt, 1)
    notifyClosed(30, 1000, 'bye', true)

    const webSocket = completed[0]
    expect(webSocket.firstMessageInOffset).toBe((firstMessageInAt - openAt) as Duration)
    expect(webSocket.firstMessageOutOffset).toBe((firstMessageOutAt - openAt) as Duration)
  })

  it('tracks longestInboundSilence from consecutive message-in only', () => {
    startTracking()
    notifyConnecting()
    notifyOpen(10)
    notifyMessageIn(20, 1)
    notifyMessageIn(50, 1) // gap 30
    notifyMessageIn(75, 1) // gap 25
    notifyClosed(100, 1000, 'bye', true)

    expect(completed[0].longestInboundSilence).toBe(30 as Duration)
  })

  it('ignores message-out when computing longestInboundSilence', () => {
    startTracking()
    notifyConnecting()
    notifyOpen(10)
    notifyMessageIn(20, 1)
    notifyMessageOut(100, 1)
    notifyMessageIn(130, 1) // gap from last in (20) to 130
    notifyClosed(200, 1000, 'bye', true)

    expect(completed[0].longestInboundSilence).toBe(110 as Duration)
  })

  it('records inboundIdleDurationBeforeClose from last message-in to close', () => {
    const lastMessageInAt = 20
    const closeAt = 50

    startTracking()
    notifyConnecting()
    notifyOpen(10)
    notifyMessageIn(lastMessageInAt, 1)
    notifyClosed(closeAt, 1000, 'bye', true)

    expect(completed[0].inboundIdleDurationBeforeClose).toBe((closeAt - lastMessageInAt) as Duration)
  })

  it('leaves inboundIdleDurationBeforeClose and lastMessageInAt undefined when no message was received', () => {
    startTracking()
    notifyConnecting()
    notifyOpen(10)
    notifyMessageOut(30, 1)
    notifyClosed(50, 1000, 'bye', true)

    expect(completed[0].lastMessageInAt).toBeUndefined()
    expect(completed[0].inboundIdleDurationBeforeClose).toBeUndefined()
  })

  it('records setupDuration as elapsed time from connecting to open', () => {
    const startAt = 0
    const openAt = 10
    const startClocks = relativeToClocks(clock.relative(startAt))
    const openClocks = relativeToClocks(clock.relative(openAt))
    const expectedSetupDuration = elapsed(startClocks.timeStamp, openClocks.timeStamp)

    startTracking()
    notifyConnecting(startAt, 'wss://example.com/socket', startClocks)
    notifyOpen(openAt, '', openClocks)
    notifyClosed(40, 1000, 'bye', true)

    expect(completed[0].setupDuration).toBe(expectedSetupDuration)
  })

  it('records setupDuration as elapsed time from connecting to close when open never fires', () => {
    const startAt = 0
    const closeAt = 25
    const closeCode = 1006
    const closeReason = 'abnormal'
    const startClocks = relativeToClocks(clock.relative(startAt))
    const closeClocks = relativeToClocks(clock.relative(closeAt))
    const expectedSetupDuration = elapsed(startClocks.timeStamp, closeClocks.timeStamp)

    startTracking()
    notifyConnecting(startAt, 'wss://example.com/socket', startClocks)
    notifyClosed(closeAt, closeCode, closeReason, false, closeClocks)

    expect(completed[0].setupDuration).toBe(expectedSetupDuration)
  })

  it('records setupDuration on session_end flush when the connection never opened', () => {
    const tracker = startTracking()
    notifyConnecting()
    tracker.flushOpenConnections('session_end')

    const webSocket = completed[0]
    expect(webSocket.setupDuration).toBe(elapsed(webSocket.startClocks.timeStamp, webSocket.endClocks.timeStamp))
  })

  it('collects buffered_amount_max from message-out events', () => {
    const peakBufferedAmount = 100

    startTracking()
    notifyConnecting()
    notifyOpen(10)
    notifyMessageOut(20, 1, 10)
    notifyMessageOut(30, 1, peakBufferedAmount)
    notifyMessageOut(40, 1, 50)
    notifyClosed(50, 1000, 'bye', true)

    expect(completed[0].bufferedAmountMax).toBe(peakBufferedAmount)
  })

  it('captures startViewId and endViewId from viewHistory', () => {
    const startViewB = 100
    const relativeStartViewA = clock.relative(0)
    const relativeStartViewB = clock.relative(startViewB)
    const viewByRelative: Record<number, ViewHistoryEntry> = {
      [relativeStartViewA]: { id: 'view-A', startClocks: relativeToClocks(relativeStartViewA) },
      [relativeStartViewB]: { id: 'view-B', startClocks: relativeToClocks(relativeStartViewB) },
    }
    const viewHistory = mockViewHistory()
    vi.spyOn(viewHistory, 'findView').mockImplementation((startTime?: RelativeTime) =>
      startTime !== undefined ? viewByRelative[startTime as number] : undefined
    )

    startTracking(viewHistory)
    notifyConnecting()
    notifyClosed(startViewB, 1000, 'bye', true)

    const webSocket = completed[0]
    expect(webSocket.startViewId).toBe('view-A')
    expect(webSocket.endViewId).toBe('view-B')
  })

  it('flushOpenConnections finalizes still-open connections with tracking_end_reason="session_end"', () => {
    const tracker = startTracking()
    notifyConnecting()
    notifyOpen(10)
    notifyMessageIn(20, 1)

    tracker.flushOpenConnections('session_end')

    expect(completed.length).toBe(1)
    expect(completed[0].trackingEndReason).toBe('session_end')
    expect(completed[0].handshakeSucceeded).toBe(true)
    expect(completed[0].closeCode).toBeUndefined()
    expect(completed[0].closeReason).toBeUndefined()
    expect(completed[0].wasClean).toBeUndefined()
  })

  it('does not finalize twice when close arrives after flushOpenConnections', () => {
    const tracker = startTracking()
    notifyConnecting()
    notifyOpen(10)
    tracker.flushOpenConnections('session_end')
    notifyClosed(20, 1000, 'bye', true)

    expect(completed.length).toBe(1)
    expect(completed[0].trackingEndReason).toBe('session_end')
  })

  it('stop() unsubscribes from the observable and ignores further events', () => {
    const tracker = startTracking()
    notifyConnecting()
    tracker.stop()
    notifyClosed(20, 1000, 'bye', true)

    expect(completed.length).toBe(0)
  })

  describe('websocket-connecting vital', () => {
    it('emits a duration-0 vital on connecting', () => {
      const addDurationVital = vi.fn<(vital: DurationVital) => void>()
      startTracking(mockViewHistory(), addDurationVital)
      notifyConnecting()

      expect(addDurationVital).toHaveBeenCalledTimes(1)
      expect(addDurationVital).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          name: WEBSOCKET_CONNECTING_VITAL_NAME,
          type: VitalType.DURATION,
          duration: 0,
        })
      )
    })

    it('uses the same id as the subsequent WEBSOCKET_COMPLETED connectionId', () => {
      const addDurationVital = vi.fn<(vital: DurationVital) => void>()
      startTracking(mockViewHistory(), addDurationVital)
      notifyConnecting()
      notifyClosed(1, 1000, 'bye', true)

      expect(addDurationVital).toHaveBeenCalledTimes(1)
      expect(addDurationVital).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: completed[0].connectionId })
      )
    })

    it('includes url, protocols, and startViewId in the vital context', () => {
      const startView = 0
      const relativeStartView = clock.relative(startView)
      const viewByRelative: Record<number, ViewHistoryEntry> = {
        [relativeStartView]: { id: 'view-start', startClocks: relativeToClocks(relativeStartView) },
      }
      const viewHistory = mockViewHistory()
      vi.spyOn(viewHistory, 'findView').mockImplementation((startTime?: RelativeTime) =>
        startTime !== undefined ? viewByRelative[startTime as number] : undefined
      )
      const addDurationVital = vi.fn<(vital: DurationVital) => void>()
      const url = 'wss://example.com/socket'
      const protocols = ['chat.v1', 'json']

      startTracking(viewHistory, addDurationVital)
      notifyConnecting(startView, url, undefined, protocols)

      expect(addDurationVital).toHaveBeenCalledTimes(1)
      expect(addDurationVital).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          context: {
            url,
            protocols,
            startViewId: 'view-start',
          },
        })
      )
    })
  })

  describe('startWebSocketCollection', () => {
    const wsInstance = {} as WebSocket
    const wsUrl = 'wss://example.com/socket'
    const singletonObservable = () => initWebSocketObservable()

    function startCollection() {
      const collection = startWebSocketCollection(lifeCycle, mockViewHistory(), vi.fn())
      registerCleanupTask(() => collection.stop())
      return collection
    }

    function notifyConnecting(offsetMs = 0) {
      singletonObservable().notify({
        state: 'connecting',
        instance: wsInstance,
        url: wsUrl,
        startClocks: relativeToClocks(clock.relative(offsetMs)),
      })
    }

    function notifyOpen(openRelative = 10, protocol = '') {
      singletonObservable().notify({
        state: 'open',
        instance: wsInstance,
        openClocks: relativeToClocks(clock.relative(openRelative)),
        protocol,
      })
    }

    function notifyMessageOut(at: number, size: number, bufferedAmountPreSend = 0) {
      singletonObservable().notify({
        state: 'message-out',
        instance: wsInstance,
        size,
        bufferedAmountPreSend,
        at: relativeToClocks(clock.relative(at)),
      })
    }

    function notifyClosed(at: number, code: number, reason: string, wasClean: boolean) {
      singletonObservable().notify({
        state: 'closed',
        instance: wsInstance,
        code,
        reason,
        wasClean,
        at: relativeToClocks(clock.relative(at)),
      })
    }

    it('finalizes open connections with tracking_end_reason="session_end" when the session expires', () => {
      startCollection()
      notifyConnecting()

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(completed.length).toBe(1)
      expect(completed[0].trackingEndReason).toBe('session_end')
      expect(completed[0].handshakeSucceeded).toBe(false)
      expect(completed[0].closeCode).toBeUndefined()
      expect(completed[0].closeReason).toBeUndefined()
      expect(completed[0].wasClean).toBeUndefined()
    })

    it('ignores further WebSocket events from the same instance after stop()', () => {
      const collection = startCollection()
      notifyConnecting()
      collection.stop()

      const eventCountAfterStop = completed.length

      notifyClosed(1000, 1000, 'bye', true)

      expect(completed.length).toBe(eventCountAfterStop)
    })

    it('ignores further WebSocket events from the same instance after the session expires', () => {
      startCollection()
      notifyConnecting()
      notifyOpen(10)
      notifyMessageOut(20, 10)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(completed.length).toBe(1)
      expect(completed[0].trackingEndReason).toBe('session_end')
      expect(completed[0].messagesOut).toEqual({ count: 1, size: 10 })

      notifyMessageOut(40, 7)
      notifyClosed(50, 1000, 'bye', true)

      expect(completed.length).toBe(1)
      expect(completed[0].trackingEndReason).toBe('session_end')
      expect(completed[0].messagesOut).toEqual({ count: 1, size: 10 })
    })
  })
})
