import type { EndpointBuilder } from '@datadog/js-core/transport'
import { noop } from '@datadog/js-core/util'
import { createEndpointBuilder } from '@datadog/js-core/transport'
import type { Clock, Request } from '../../test'
import {
  collectAsyncCalls,
  mockClock,
  mockEndpointBuilder,
  interceptRequests,
  DEFAULT_FETCH_MOCK,
  TOO_MANY_REQUESTS_FETCH_MOCK,
  NETWORK_ERROR_FETCH_MOCK,
  wait,
} from '../../test'
import type { HttpRequest, HttpRequestEvent } from './httpRequest'
import { createHttpRequest, fetchStrategy, RECOMMENDED_REQUEST_BYTES_LIMIT } from './httpRequest'
import { INITIAL_BACKOFF_TIME, MAX_ONGOING_BYTES_COUNT } from './sendWithRetryStrategy'

describe('httpRequest', () => {
  const ENDPOINT_URL = 'http://my.website'
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    interceptor = interceptRequests()
    requests = interceptor.requests
    endpointBuilder = mockEndpointBuilder(ENDPOINT_URL)
    request = createHttpRequest([endpointBuilder], noop)
  })

  describe('send', () => {
    it('should use fetch to send intake payload to the endpoint', async () => {
      const payloadData = '{"foo":"bar1"}\n{"foo":"bar2"}'
      request.send({ data: payloadData, bytesCount: 10 })
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual(payloadData)
    })

    it('should use fetch for payloads exceeding the bytes limit', async () => {
      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: RECOMMENDED_REQUEST_BYTES_LIMIT })
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should use retry strategy', async () => {
      const fetchSpy = interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK, DEFAULT_FETCH_MOCK)

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()
      await collectAsyncCalls(fetchSpy, 2)
    })

    it('sends the payload to multiple endpoints', async () => {
      const endpointBuilder2 = mockEndpointBuilder('http://my.website2')

      request = createHttpRequest([endpointBuilder, endpointBuilder2], noop)

      interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)

      const payloadData = '{"foo":"bar1"}\n{"foo":"bar2"}'
      request.send({ data: payloadData, bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()
      expect(requests.length).toEqual(2)
      expect(requests[0].url).toContain('http://my.website')
      expect(requests[0].body).toEqual(payloadData)
      expect(requests[1].url).toContain('http://my.website2')
      expect(requests[1].body).toEqual(payloadData)
    })
  })

  describe('fetchStrategy onResponse', () => {
    it('should be called with intake response', (done) => {
      interceptor.withFetch(DEFAULT_FETCH_MOCK)

      fetchStrategy(endpointBuilder, { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 }, (response) => {
        expect(response).toEqual({ status: 200, type: 'cors' })
        done()
      })
    })

    it('should be called with status 0 when fetch fails', (done) => {
      interceptor.withFetch(NETWORK_ERROR_FETCH_MOCK)

      fetchStrategy(endpointBuilder, { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 }, (response) => {
        expect(response).toEqual({ status: 0 })
        done()
      })
    })
  })

  describe('sendOnExit', () => {
    it('should use fetch when sendBeacon is not defined', async () => {
      interceptor.withSendBeacon(false)

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
    })

    it('should use fetch for a non-HTTP endpoint', async () => {
      request = createHttpRequest([mockEndpointBuilder('file:///proxy')], noop)

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should use sendBeacon when the bytes count is correct', () => {
      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('sendBeacon')
    })

    it('should use fetch over sendBeacon for a single message over the bytes limit', async () => {
      const bigMessage = createMessage(RECOMMENDED_REQUEST_BYTES_LIMIT)
      request.sendOnExit({ data: bigMessage, bytesCount: bigMessage.length })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should split messages over the bytes limit into several sendBeacon requests', () => {
      const message = createMessage(RECOMMENDED_REQUEST_BYTES_LIMIT * 0.4)
      const data = [message, message, message].join('\n')

      request.sendOnExit({ data, bytesCount: data.length })

      expect(requests.map(({ type, body }) => ({ type, body }))).toEqual([
        { type: 'sendBeacon', body: `${message}\n${message}` },
        { type: 'sendBeacon', body: message },
      ])
    })

    it('should send each split part to every endpoint', () => {
      request = createHttpRequest([endpointBuilder, mockEndpointBuilder('http://my.website2')], noop)
      const message = createMessage(RECOMMENDED_REQUEST_BYTES_LIMIT * 0.6)
      const data = [message, message].join('\n')

      request.sendOnExit({ data, bytesCount: data.length })

      expect(requests.map(({ type, url }) => ({ type, url }))).toEqual([
        { type: 'sendBeacon', url: ENDPOINT_URL },
        { type: 'sendBeacon', url: ENDPOINT_URL },
        { type: 'sendBeacon', url: 'http://my.website2' },
        { type: 'sendBeacon', url: 'http://my.website2' },
      ])
    })

    it('should only use fetch for a split part made of a single message over the bytes limit', async () => {
      const smallMessage = createMessage(100)
      const bigMessage = createMessage(RECOMMENDED_REQUEST_BYTES_LIMIT)
      const data = [smallMessage, bigMessage, smallMessage].join('\n')

      request.sendOnExit({ data, bytesCount: data.length })

      await interceptor.waitForAllFetchCalls()

      expect(requests.map(({ type, body }) => ({ type, body }))).toEqual([
        { type: 'sendBeacon', body: smallMessage },
        { type: 'fetch', body: bigMessage },
        { type: 'sendBeacon', body: smallMessage },
      ])
    })

    it('should not split a payload that is not a string', async () => {
      const data = new Blob([createMessage(RECOMMENDED_REQUEST_BYTES_LIMIT)])

      request.sendOnExit({ data, bytesCount: data.size, encoding: 'deflate' })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should fallback to fetch when sendBeacon is not queued', async () => {
      interceptor.withSendBeacon(() => false)

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should fallback to fetch when sendBeacon throws', async () => {
      let sendBeaconCalled = false
      interceptor.withSendBeacon(() => {
        sendBeaconCalled = true
        throw new Error('mock sendBeacon error')
      })

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()

      expect(sendBeaconCalled).toBe(true)
      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })
  })

  function createMessage(bytesCount: number) {
    const emptyMessage = '{"foo":""}'
    return `{"foo":"${'a'.repeat(Math.floor(bytesCount) - emptyMessage.length)}"}`
  }

  describe('HttpRequestEvent observable', () => {
    const observedEvents: HttpRequestEvent[] = []

    function latestEvents() {
      const events = [...observedEvents]
      observedEvents.length = 0
      return events
    }

    beforeEach(() => {
      request.observable.subscribe((event) => {
        observedEvents.push(event)
      })
    })

    afterEach(() => {
      observedEvents.length = 0
    })

    it('should report success for successful requests', async () => {
      interceptor.withFetch(DEFAULT_FETCH_MOCK)

      const payload = { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 }
      request.send(payload)
      await interceptor.waitForAllFetchCalls()
      await wait(0)

      expect(latestEvents()).toEqual([
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])
    })

    it('should report failure for failing requests', async () => {
      interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK, DEFAULT_FETCH_MOCK)

      const payload = { data: '{"foo":"barX"}\n{"foo":"barY"}', bytesCount: 10 }
      request.send(payload)
      await interceptor.waitForAllFetchCalls()
      await wait(0)
      await interceptor.waitForAllFetchCalls()
      await wait(0)

      const sentPayload = { ...payload, retry: { count: 1, lastFailureStatus: 429 } }
      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: sentPayload },
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: sentPayload },
      ])
    })

    it('should report multiple failures when requests are retried repeatedly', async () => {
      interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK, TOO_MANY_REQUESTS_FETCH_MOCK, DEFAULT_FETCH_MOCK)

      const payload = { data: '{"foo":"barA"}\n{"foo":"barB"}', bytesCount: 10 }
      request.send(payload)
      await interceptor.waitForAllFetchCalls()
      await wait(0)
      await interceptor.waitForAllFetchCalls()
      await wait(0)
      await interceptor.waitForAllFetchCalls()
      await wait(0)

      const sentPayload = { ...payload, retry: { count: 2, lastFailureStatus: 429 } }
      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: sentPayload },
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: sentPayload },
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload: sentPayload },
      ])
    })
  })
})

describe('httpRequest with several endpoints', () => {
  interface FetchCall {
    endpoint: 'primary' | 'replica'
    url: string
    body: string
    status?: number
    resolve: (status: number) => void
  }

  let clock: Clock
  let fetchCalls: FetchCall[]
  let request: HttpRequest

  beforeEach(() => {
    clock = mockClock()
    fetchCalls = []
    interceptRequests()
      .withFetch()
      .and.callFake(
        (url, config) =>
          new Promise<Response>((resolve) => {
            fetchCalls.push({
              endpoint: (url as string).includes('datadoghq.eu') ? 'primary' : 'replica',
              url: url as string,
              body: config!.body as string,
              resolve: (status) => resolve({ status, type: 'cors' } as Response),
            })
          })
      )
    request = createHttpRequest(
      [
        createEndpointBuilder({ clientToken: 'token', site: 'datadoghq.eu' }, 'rum'),
        createEndpointBuilder({ clientToken: 'token', site: 'datadoghq.com' }, 'rum'),
      ],
      noop
    )
  })

  async function flushPromises() {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
    }
  }

  function pendingCalls() {
    return fetchCalls.filter((call) => call.status === undefined)
  }

  async function respond(call: FetchCall | undefined, status: number) {
    call!.status = status
    call!.resolve(status)
    await flushPromises()
  }

  function respondTo(endpoint: FetchCall['endpoint'], body: string, status: number) {
    return respond(
      pendingCalls().find((call) => call.endpoint === endpoint && call.body === body),
      status
    )
  }

  async function respondToAll(status: number) {
    while (pendingCalls().length > 0) {
      await respond(pendingCalls()[0], status)
    }
  }

  function received() {
    return fetchCalls.filter((call) => call.status === 200).map((call) => `${call.endpoint}:${call.body}`)
  }

  it('retries a failed request to its own endpoint when another endpoint succeeds', async () => {
    request.send({ data: 'A', bytesCount: 10 })
    await respondTo('primary', 'A', 503)
    await respondTo('replica', 'A', 200)

    clock.tick(INITIAL_BACKOFF_TIME)
    await respondToAll(200)

    expect(received()).toEqual(['replica:A', 'primary:A'])
  })

  it('retries each endpoint on its own when they all fail', async () => {
    request.send({ data: 'A', bytesCount: 10 })
    await respondTo('primary', 'A', 503)
    await respondTo('replica', 'A', 503)
    request.send({ data: 'B', bytesCount: 10 })

    clock.tick(INITIAL_BACKOFF_TIME)
    await respondToAll(200)

    expect(received()).toEqual(['primary:A', 'replica:A', 'primary:B', 'replica:B'])
  })

  it('counts retries per endpoint', async () => {
    request.send({ data: 'A', bytesCount: 10 })
    await respondTo('primary', 'A', 503)
    await respondTo('replica', 'A', 503)

    clock.tick(INITIAL_BACKOFF_TIME)

    expect(
      pendingCalls().map((call) => [call.endpoint, new URL(call.url).searchParams.get('_dd.retry_count')])
    ).toEqual([
      ['primary', '1'],
      ['replica', '1'],
    ])
  })

  it('gives each endpoint its own in-flight bytes budget', () => {
    // Two of these payloads fit in one endpoint's budget, four don't
    const bytesCount = MAX_ONGOING_BYTES_COUNT * 0.4
    request.send({ data: 'A', bytesCount })
    request.send({ data: 'B', bytesCount })

    expect(fetchCalls.map((call) => `${call.endpoint}:${call.body}`)).toEqual([
      'primary:A',
      'replica:A',
      'primary:B',
      'replica:B',
    ])
  })
})

describe('httpRequest intake parameters', () => {
  const clientToken = 'some_client_token'
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    interceptor = interceptRequests()
    requests = interceptor.requests
    endpointBuilder = createEndpointBuilder({ clientToken }, 'logs')
    request = createHttpRequest([endpointBuilder], noop)
  })

  it('should have a unique request id', async () => {
    interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)

    request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })
    request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

    await interceptor.waitForAllFetchCalls()

    const search = /dd-request-id=([^&]*)/
    const requestId1 = search.exec(requests[0].url)?.[1]
    const requestId2 = search.exec(requests[1].url)?.[1]

    expect(requestId1).not.toBe(requestId2)
    expect(requests.length).toEqual(2)
  })
})
