import { mockClock } from '../../test/specHelper'
import type { Clock } from '../../test/specHelper'
import { ErrorSource } from '../tools/error'
import type { RetryState } from './sendWithRetryStrategy'
import {
  newRetryState,
  sendWithRetryStrategy,
  MAX_ONGOING_BYTES_COUNT,
  MAX_ONGOING_REQUESTS,
  MAX_QUEUE_BYTES_COUNT,
  INITIAL_BACKOFF_TIME,
} from './sendWithRetryStrategy'
import type { Payload, HttpResponse } from './httpRequest'

describe('sendWithRetryStrategy', () => {
  const ENDPOINT_TYPE = 'logs'
  let sendStub: ReturnType<typeof newSendStub>
  let state: RetryState
  let sendRequest: (payload?: Partial<Payload>) => void
  let clock: Clock
  let reportErrorSpy: jasmine.Spy<jasmine.Func>

  function newSendStub() {
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

  beforeEach(() => {
    sendStub = newSendStub()
    state = newRetryState()
    clock = mockClock()
    reportErrorSpy = jasmine.createSpy('reportError')
    sendRequest = (payload) => {
      const effectivePayload = {
        data: payload?.data ?? 'a',
        bytesCount: payload?.bytesCount ?? 1,
      }
      sendWithRetryStrategy(effectivePayload, state, sendStub.sendStrategy, ENDPOINT_TYPE, true, reportErrorSpy)
    }
  })

  afterEach(() => {
    clock.cleanup()
  })

  describe('nominal cases:', () => {
    it('should send request when no bandwidth limit reached', () => {
      sendRequest()
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(0)

      sendStub.respondWith(0, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)
      expect(state.queuedPayloads.size()).toBe(0)
    })

    it('should allow to send request payload greater than bandwidth limit', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT + 10 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(0)
    })

    it('should send concurrent requests ', () => {
      sendRequest()
      sendRequest()
      sendRequest()
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(3)
      expect(state.queuedPayloads.size()).toBe(0)

      sendStub.respondWith(0, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(2)

      sendStub.respondWith(1, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)

      sendStub.respondWith(2, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)
    })
  })

  describe('bandwidth limitation:', () => {
    it('should queue request when its payload would overflow bytes limit', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT - 10 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(0)

      sendRequest({ bytesCount: 11 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(1)
    })

    it('should queue request when too much ongoing requests', () => {
      for (let i = 1; i <= MAX_ONGOING_REQUESTS; i++) {
        sendRequest()
      }
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(MAX_ONGOING_REQUESTS)
      expect(state.queuedPayloads.size()).toBe(0)

      sendRequest()
      expect(state.queuedPayloads.size()).toBe(1)
    })
  })

  describe('queue limitation:', () => {
    it('should stop queueing new payloads when queue bytes limit is reached', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT })
      sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT - 20 })
      sendRequest({ bytesCount: 30 })
      expect(state.queuedPayloads.size()).toBe(2)
      expect(state.queuedPayloads.bytesCount).toBe(MAX_QUEUE_BYTES_COUNT + 10)

      sendRequest({ bytesCount: 1 })
      expect(state.queuedPayloads.size()).toBe(2)
      expect(state.queuedPayloads.bytesCount).toBe(MAX_QUEUE_BYTES_COUNT + 10)
    })

    it('should report a single error when queue is full after request success', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT })
      sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT })
      expect(state.queuedPayloads.isFull()).toBe(true)

      sendStub.respondWith(0, { status: 200 })
      expect(reportErrorSpy).toHaveBeenCalled()
      expect(reportErrorSpy.calls.argsFor(0)[0]).toEqual(
        jasmine.objectContaining({
          message: 'Reached max logs events size queued for upload: 3MiB',
          source: ErrorSource.AGENT,
        })
      )
      reportErrorSpy.calls.reset()

      sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT })
      expect(state.queuedPayloads.isFull()).toBe(true)

      sendStub.respondWith(1, { status: 200 })
      expect(reportErrorSpy).not.toHaveBeenCalled()
    })

    it('should not report error when queue is full after resuming transport', () => {
      sendRequest()
      sendStub.respondWith(0, { status: 500 })
      sendRequest({ bytesCount: MAX_QUEUE_BYTES_COUNT })
      expect(state.queuedPayloads.isFull()).toBe(true)

      clock.tick(INITIAL_BACKOFF_TIME)
      sendStub.respondWith(1, { status: 200 })

      expect(reportErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('dequeue:', () => {
    it('should send as much queued request as possible after a successful request', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT })
      for (let i = 1; i <= MAX_ONGOING_REQUESTS; i++) {
        sendRequest()
      }
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      expect(state.queuedPayloads.size()).toBe(MAX_ONGOING_REQUESTS)

      sendStub.respondWith(0, { status: 200 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(MAX_ONGOING_REQUESTS)
      expect(state.queuedPayloads.size()).toBe(0)
    })

    it('should respect request order', () => {
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT - 10 })
      sendRequest({ bytesCount: 20 })
      sendRequest({ bytesCount: MAX_ONGOING_BYTES_COUNT - 15 })
      sendRequest({ bytesCount: 10 })
      expect(state.queuedPayloads.size()).toBe(3)
      expect(state.queuedPayloads.bytesCount).toBe(20 + (MAX_ONGOING_BYTES_COUNT - 15) + 10)

      sendStub.respondWith(0, { status: 200 })
      expect(state.queuedPayloads.size()).toBe(2)
      expect(state.queuedPayloads.bytesCount).toBe(MAX_ONGOING_BYTES_COUNT - 15 + 10)

      sendStub.respondWith(1, { status: 200 })
      expect(state.queuedPayloads.size()).toBe(0)
    })
  })
  ;[
    { description: 'when the intake returns error:', status: 500 },
    { description: 'when the intake returns too many request:', status: 429 },
    { description: 'when the intake returns request timeout:', status: 408 },
    { description: 'when network is down:', status: 0 },
  ].forEach(({ description, status }) => {
    describe(description, () => {
      it('should start queueing following requests', () => {
        sendRequest()
        sendStub.respondWith(0, { status })
        expect(state.queuedPayloads.size()).toBe(1)

        sendRequest()
        expect(state.queuedPayloads.size()).toBe(2)
        sendRequest()
        expect(state.queuedPayloads.size()).toBe(3)
      })

      it('should send queued requests if another ongoing request succeed', () => {
        sendRequest()
        sendRequest()
        sendStub.respondWith(0, { status })
        expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
        expect(state.queuedPayloads.size()).toBe(1)

        sendRequest()
        expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
        expect(state.queuedPayloads.size()).toBe(2)

        sendStub.respondWith(1, { status: 200 })
        expect(state.bandwidthMonitor.ongoingRequestCount).toBe(2)
        expect(state.queuedPayloads.size()).toBe(0)
      })
    })
  })

  describe('when transport down:', () => {
    it('should regularly try to send first queued request', () => {
      sendRequest()
      sendStub.respondWith(0, { status: 500 })
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)

      clock.tick(INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      sendStub.respondWith(1, { status: 500 })

      clock.tick(2 * INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      sendStub.respondWith(2, { status: 500 })

      clock.tick(4 * INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
    })

    it('should send queued requests after first successful request', () => {
      sendRequest()
      sendStub.respondWith(0, { status: 500 })
      sendRequest()
      sendRequest()
      sendRequest()
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(0)
      expect(state.queuedPayloads.size()).toBe(4)

      clock.tick(INITIAL_BACKOFF_TIME)
      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(1)
      sendStub.respondWith(1, { status: 200 })

      expect(state.bandwidthMonitor.ongoingRequestCount).toBe(3)
      expect(state.queuedPayloads.size()).toBe(0)
    })
  })
})
