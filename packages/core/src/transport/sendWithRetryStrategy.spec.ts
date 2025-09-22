import { mockClock, setNavigatorOnLine } from '../../test'
import type { Clock } from '../../test'
import { ErrorSource } from '../domain/error/error.types'
import { Observable } from '../tools/observable'
import { ONE_MEBI_BYTE } from '../tools/utils/byteUtils'
import type { RetryState } from './sendWithRetryStrategy'
import {
  newRetryState,
  sendWithRetryStrategy,
  MAX_ONGOING_BYTES_COUNT,
  MAX_ONGOING_REQUESTS,
  MAX_QUEUE_BYTES_COUNT,
  INITIAL_BACKOFF_TIME,
} from './sendWithRetryStrategy'
import type { Payload, HttpResponse, HttpRequestEvent } from './httpRequest'

describe('sendWithRetryStrategy', () => {
  const ENDPOINT_TYPE = 'logs'
  let sendMock: ReturnType<typeof mockSend>
  let state: RetryState<Payload>
  let sendRequest: (payload?: Partial<Payload>) => Payload
  let clock: Clock
  let reportErrorSpy: jasmine.Spy<jasmine.Func>
  const observedEvents: HttpRequestEvent[] = []

  function mockSend() {
    const requests: Array<(r: HttpResponse) => void> = []
    return {
      sendStrategy: (_: Payload, onResponse: (r: HttpResponse) => void) => {
        requests.push(onResponse)
      },
      respondWith: (index: number, r: HttpResponse) => {
        requests[index](r)
        requests[index] = () => {
          throw new Error('response already handled')
        }
      },
    }
  }

  function latestEvents() {
    const events = [...observedEvents]
    observedEvents.length = 0
    return events
  }

  beforeEach(() => {
    sendMock = mockSend()
    state = newRetryState()
    clock = mockClock()
    reportErrorSpy = jasmine.createSpy('reportError')
    const observable = new Observable<HttpRequestEvent>()
    observable.subscribe((event) => observedEvents.push(event))
    sendRequest = (payload) => {
      const effectivePayload = {
        data: payload?.data ?? 'a',
        bytesCount: payload?.bytesCount ?? 1,
      }
      sendWithRetryStrategy(effectivePayload, state, sendMock.sendStrategy, ENDPOINT_TYPE, reportErrorSpy, observable)
      return effectivePayload
    }
  })

  afterEach(() => {
    observedEvents.length = 0
  })

  describe('nominal cases:', () => {
    it('should send request when no bandwidth limit reached', () => {
      const payload = sendRequest()
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([])

      sendMock.respondWith(0, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])
    })

    it('should allow to send request payload greater than bandwidth limit', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT + 10 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([])
    })

    it('should send concurrent requests ', () => {
      const payload0 = sendRequest()
      const payload1 = sendRequest()
      const payload2 = sendRequest()
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(3)
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([])

      sendMock.respondWith(0, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(2)
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 2, ongoingRequestCount: 2 }, payload: payload0 },
      ])

      sendMock.respondWith(1, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 1, ongoingRequestCount: 1 }, payload: payload1 },
      ])

      sendMock.respondWith(2, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: payload2 },
      ])
    })
  })

  describe('bandwidth limitation:', () => {
    it('should queue request when its payload would overflow bytes limit', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT - 10 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([])

      sendRequest({ bytesCount: 11 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(1)
      expect(latestEvents()).toEqual([])
    })

    it('should queue request when too much ongoing requests', () => {
      for (let i = 1; i <= MAX_ONGOING_REQUESTS; i++) {
        sendRequest()
      }
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(MAX_ONGOING_REQUESTS)
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([])

      sendRequest()
      expect(state.queuedPayloads.size()).toBe(1)
      expect(latestEvents()).toEqual([])
    })
  })

  describe('queue limitation:', () => {
    it('should stop queueing new payloads when queue bytes limit is reached', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT })
      sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT - 20 })
      sendRequest({ bytesCount: 30 })
      expect(state.queuedPayloads.size()).toBe(2)
      expect(state.queuedPayloads.bytesCount).toBe(MAX_QUEUE_BYTES_COUNT + 10)
      expect(latestEvents()).toEqual([])

      const payload = sendRequest({ bytesCount: 1 })
      expect(state.queuedPayloads.size()).toBe(2)
      expect(state.queuedPayloads.bytesCount).toBe(MAX_QUEUE_BYTES_COUNT + 10)
      expect(latestEvents()).toEqual([
        { type: 'queue-full', bandwidth: { ongoingByteCount: 81920, ongoingRequestCount: 1 }, payload },
      ])
    })

    it('should report a single error when queue is full after request success', () => {
      const payload0 = sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT })
      const payload1 = sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT })
      expect(state.queuedPayloads.isFull()).toBe(true)
      expect(latestEvents()).toEqual([])

      sendMock.respondWith(0, { status: 200 })
      expect(reportErrorSpy).toHaveBeenCalled()
      expect(reportErrorSpy.calls.argsFor(0)[0]).toEqual(
        jasmine.objectContaining({
          message: `Reached max logs events size queued for upload: ${MAX_QUEUE_BYTES_COUNT / ONE_MEBI_BYTE}MiB`,
          source: ErrorSource.AGENT,
        })
      )
      reportErrorSpy.calls.reset()
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: payload0 },
      ])

      sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT })
      expect(state.queuedPayloads.isFull()).toBe(true)
      expect(latestEvents()).toEqual([])

      sendMock.respondWith(1, { status: 200 })
      expect(reportErrorSpy).not.toHaveBeenCalled()
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: payload1 },
      ])
    })

    it('should not report error when queue is full after resuming transport', () => {
      const payload = sendRequest()
      sendMock.respondWith(0, { status: 500 })
      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])

      sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT })
      expect(state.queuedPayloads.isFull()).toBe(true)
      expect(latestEvents()).toEqual([])

      clock.tick(INITIAL_BACKOFF_TIME)
      sendMock.respondWith(1, { status: 200 })
      expect(latestEvents()).toEqual([
        {
          type: 'success',
          bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 },
          payload: { ...payload, retry: { count: 1, lastFailureStatus: 500 } },
        },
      ])

      expect(reportErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('dequeue:', () => {
    it('should send as much queued request as possible after a successful request', () => {
      const payload = sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT })
      for (let i = 1; i <= MAX_ONGOING_REQUESTS; i++) {
        sendRequest()
      }
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(MAX_ONGOING_REQUESTS)
      expect(latestEvents()).toEqual([])

      sendMock.respondWith(0, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(MAX_ONGOING_REQUESTS)
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])
    })

    it('should respect request order', () => {
      const payload0 = sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT - 10 })
      const payload1 = sendRequest({ bytesCount: 20 })
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT - 15 })
      sendRequest({ bytesCount: 10 })
      expect(state.queuedPayloads.size()).toBe(3)
      expect(state.queuedPayloads.bytesCount).toBe(20 + (MAX_ONGOING_BYTES_COUNT - 15) + 10)
      expect(latestEvents()).toEqual([])

      sendMock.respondWith(0, { status: 200 })
      expect(state.queuedPayloads.size()).toBe(2)
      expect(state.queuedPayloads.bytesCount).toBe(MAX_ONGOING_BYTES_COUNT - 15 + 10)
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: payload0 },
      ])

      sendMock.respondWith(1, { status: 200 })
      expect(state.queuedPayloads.size()).toBe(0)
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: payload1 },
      ])
    })
  })
  ;[
    { expectRetry: true, description: 'when the intake returns error:', status: 500 },
    { expectRetry: true, description: 'when the intake returns too many request:', status: 429 },
    { expectRetry: true, description: 'when the intake returns request timeout:', status: 408 },
    { expectRetry: true, description: 'when network error while offline:', status: 0, offLine: true },
    { expectRetry: false, description: 'when network error while online:', status: 0 },
    { expectRetry: false, description: 'when the intake returns opaque response:', status: 0, type: 'opaque' as const },
  ].forEach(({ expectRetry, description, status, type, offLine }) => {
    describe(description, () => {
      beforeEach(() => {
        setNavigatorOnLine(!offLine)
      })

      if (expectRetry) {
        it('should start queueing following requests', () => {
          const payload = sendRequest()
          sendMock.respondWith(0, { status, type })
          expect(state.queuedPayloads.size()).toBe(1)
          expect(latestEvents()).toEqual([
            { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
          ])

          sendRequest()
          expect(state.queuedPayloads.size()).toBe(2)
          sendRequest()
          expect(state.queuedPayloads.size()).toBe(3)
          expect(latestEvents()).toEqual([])
        })

        it('should send queued requests if another ongoing request succeed', () => {
          const payload0 = sendRequest()
          const payload1 = sendRequest()
          sendMock.respondWith(0, { status, type })
          expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
          expect(state.queuedPayloads.size()).toBe(1)
          expect(latestEvents()).toEqual([
            { type: 'failure', bandwidth: { ongoingByteCount: 1, ongoingRequestCount: 1 }, payload: payload0 },
          ])

          sendRequest()
          expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
          expect(state.queuedPayloads.size()).toBe(2)
          expect(latestEvents()).toEqual([])

          sendMock.respondWith(1, { status: 200 })
          expect(state.bandwidthMonitor.ongoingRequestCount).toBe(2)
          expect(state.queuedPayloads.size()).toBe(0)
          expect(latestEvents()).toEqual([
            { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: payload1 },
          ])
        })

        it('should add retry info to payloads', () => {
          const payload = sendRequest()

          sendMock.respondWith(0, { status, type })
          expect(state.queuedPayloads.first().retry).toEqual({ count: 1, lastFailureStatus: status })
          expect(latestEvents()).toEqual([
            { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
          ])

          clock.tick(INITIAL_BACKOFF_TIME)

          sendMock.respondWith(1, { status, type })
          expect(state.queuedPayloads.first().retry).toEqual({ count: 2, lastFailureStatus: status })
          expect(latestEvents()).toEqual([
            { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
          ])
        })
      } else {
        it('should not queue the payload for retry', () => {
          const payload = sendRequest()
          sendMock.respondWith(0, { status, type })
          expect(state.queuedPayloads.size()).toBe(0)
          expect(latestEvents()).toEqual([
            { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
          ])
        })
      }
    })
  })

  describe('when transport down:', () => {
    it('should regularly try to send first queued request', () => {
      const payload = sendRequest()
      sendMock.respondWith(0, { status: 500 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)
      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])

      clock.tick(INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      sendMock.respondWith(1, { status: 500 })
      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])

      clock.tick(2 * INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      sendMock.respondWith(2, { status: 500 })
      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])

      clock.tick(4 * INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(latestEvents()).toEqual([])
    })

    it('should send queued requests after first successful request', () => {
      const payload = sendRequest()
      sendMock.respondWith(0, { status: 500 })
      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])

      sendRequest()
      sendRequest()
      sendRequest()
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)
      expect(state.queuedPayloads.size()).toBe(4)
      expect(latestEvents()).toEqual([])

      clock.tick(INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      sendMock.respondWith(1, { status: 200 })
      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])

      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(3)
      expect(state.queuedPayloads.size()).toBe(0)
    })
  })
})
