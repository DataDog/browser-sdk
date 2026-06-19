import type { WebSocketContext } from '@datadog/browser-core'
import { initWebSocketObservable, Observable } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { elapsed, relativeToClocks } from '@datadog/js-core/time'
import { mockViewHistory } from '../../test'
import { VitalType } from '../rawRumEvent.types'
import type { ViewHistoryEntry } from './contexts/viewHistory'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { DurationVital } from './vital/vitalCollection'
import type { WebSocketCompleteEvent } from './webSocketCollection'
import { startWebSocketCollection, trackWebSocket, WEBSOCKET_CONNECTING_VITAL_NAME } from './webSocketCollection'

describe('webSocketCollection', () => {
  let lifeCycle: LifeCycle
  let wsObservable: Observable<WebSocketContext>
  let completed: WebSocketCompleteEvent[]
  let wsInstance: WebSocket

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    wsObservable = new Observable<WebSocketContext>()
    completed = []
    wsInstance = {} as WebSocket
    lifeCycle.subscribe(LifeCycleEventType.WEBSOCKET_COMPLETED, (webSocket) => {
      completed.push(webSocket)
    })
  })

  function startTracking(
    viewHistory = mockViewHistory(),
    addDurationVital: (vital: DurationVital) => void = jasmine.createSpy()
  ) {
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
      startClocks: startClocks ?? relativeToClocks(startRelative as RelativeTime),
    })
  }

  function notifyOpen(openRelative = 10, protocol = '', openClocks?: ClocksState) {
    wsObservable.notify({
      state: 'open',
      instance: wsInstance,
      openClocks: openClocks ?? relativeToClocks(openRelative as RelativeTime),
      protocol,
    })
  }

  function notifyMessageIn(at: number, size: number) {
    wsObservable.notify({ state: 'message-in', instance: wsInstance, size, at: relativeToClocks(at as RelativeTime) })
  }

  function notifyMessageOut(at: number, size: number, bufferedAmountPreSend = 0) {
    wsObservable.notify({
      state: 'message-out',
      instance: wsInstance,
      size,
      bufferedAmountPreSend,
      at: relativeToClocks(at as RelativeTime),
    })
  }

  function notifyClosed(at: number, code: number, reason: string, wasClean: boolean, atClocks?: ClocksState) {
    wsObservable.notify({
      state: 'closed',
      instance: wsInstance,
      code,
      reason,
      wasClean,
      at: atClocks ?? relativeToClocks(at as RelativeTime),
    })
  }

  describe('handshakeSucceeded', () => {
    it('is true when the open event fired before completion', () => {
      const tracker = startTracking()

      notifyConnecting()
      notifyOpen(10)
      notifyClosed(40, 1000, 'bye', true)
      expect(completed[0].handshakeSucceeded).toBeTrue()

      notifyConnecting()
      notifyOpen(10)
      tracker.flushOpenConnections('session_end')
      expect(completed[1].handshakeSucceeded).toBeTrue()
    })

    it('is false when the open event never fired before completion', () => {
      const tracker = startTracking()
      notifyConnecting()
      notifyClosed(25, 1006, 'abnormal', false)
      expect(completed[0].handshakeSucceeded).toBeFalse()

      notifyConnecting()
      tracker.flushOpenConnections('session_end')
      expect(completed[1].handshakeSucceeded).toBeFalse()
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
    expect(webSocket.wasClean).toBeTrue()
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
    const startAt = 0 as RelativeTime
    const openAt = 10 as RelativeTime
    const startClocks = relativeToClocks(startAt)
    const openClocks = relativeToClocks(openAt)
    const expectedSetupDuration = elapsed(startClocks.timeStamp, openClocks.timeStamp)

    startTracking()
    notifyConnecting(startAt, 'wss://example.com/socket', startClocks)
    notifyOpen(openAt, '', openClocks)
    notifyClosed(40, 1000, 'bye', true)

    expect(completed[0].setupDuration).toBe(expectedSetupDuration)
  })

  it('records setupDuration as elapsed time from connecting to close when open never fires', () => {
    const startAt = 0 as RelativeTime
    const closeAt = 25 as RelativeTime
    const closeCode = 1006
    const closeReason = 'abnormal'
    const startClocks = relativeToClocks(startAt)
    const closeClocks = relativeToClocks(closeAt)
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
    const startViewA = 0 as RelativeTime
    const startViewB = 100 as RelativeTime
    const viewByRelative: Record<number, ViewHistoryEntry> = {
      [startViewA]: { id: 'view-A', startClocks: relativeToClocks(startViewA) },
      [startViewB]: { id: 'view-B', startClocks: relativeToClocks(startViewB) },
    }
    const viewHistory = mockViewHistory()
    spyOn(viewHistory, 'findView').and.callFake((startTime?: RelativeTime) =>
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
    expect(completed[0].handshakeSucceeded).toBeTrue()
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
      const addDurationVital = jasmine.createSpy<(vital: DurationVital) => void>()
      startTracking(mockViewHistory(), addDurationVital)
      notifyConnecting()

      expect(addDurationVital).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          name: WEBSOCKET_CONNECTING_VITAL_NAME,
          type: VitalType.DURATION,
          duration: 0,
        })
      )
    })

    it('uses the same id as the subsequent WEBSOCKET_COMPLETED connectionId', () => {
      const addDurationVital = jasmine.createSpy<(vital: DurationVital) => void>()
      startTracking(mockViewHistory(), addDurationVital)
      notifyConnecting()
      notifyClosed(1, 1000, 'bye', true)

      expect(addDurationVital).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: completed[0].connectionId }))
    })

    it('includes url, protocols, and startViewId in the vital context', () => {
      const startView = 0 as RelativeTime
      const viewByRelative: Record<number, ViewHistoryEntry> = {
        [startView]: { id: 'view-start', startClocks: relativeToClocks(startView) },
      }
      const viewHistory = mockViewHistory()
      spyOn(viewHistory, 'findView').and.callFake((startTime?: RelativeTime) =>
        startTime !== undefined ? viewByRelative[startTime as number] : undefined
      )
      const addDurationVital = jasmine.createSpy<(vital: DurationVital) => void>()
      const url = 'wss://example.com/socket'
      const protocols = ['chat.v1', 'json']

      startTracking(viewHistory, addDurationVital)
      notifyConnecting(startView, url, undefined, protocols)

      expect(addDurationVital).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
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

    function notifyConnectionConnecting(startRelative = 0 as RelativeTime) {
      // initWebSocketObservable returns a singleton, it will notify the same instance for all calls
      initWebSocketObservable().notify({
        state: 'connecting',
        instance: wsInstance,
        url: wsUrl,
        startClocks: relativeToClocks(startRelative),
      })
    }

    it('finalizes open connections with tracking_end_reason="session_end" when the session expires', () => {
      const collection = startWebSocketCollection(lifeCycle, mockViewHistory(), jasmine.createSpy())
      registerCleanupTask(() => collection.stop())
      notifyConnectionConnecting()

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(completed.length).toBe(1)
      expect(completed[0].trackingEndReason).toBe('session_end')
      expect(completed[0].handshakeSucceeded).toBeFalse()
      expect(completed[0].closeCode).toBeUndefined()
      expect(completed[0].closeReason).toBeUndefined()
      expect(completed[0].wasClean).toBeUndefined()
    })

    it('ignores further WebSocket events from the same instance after stop()', () => {
      const collection = startWebSocketCollection(lifeCycle, mockViewHistory(), jasmine.createSpy())
      notifyConnectionConnecting()
      collection.stop()

      const eventCountAfterStop = completed.length

      initWebSocketObservable().notify({
        state: 'closed',
        instance: wsInstance,
        code: 1000,
        reason: 'bye',
        wasClean: true,
        at: relativeToClocks(1000 as RelativeTime),
      })

      expect(completed.length).toBe(eventCountAfterStop)
    })
  })
})
