import {
  collectAsyncCalls,
  mockEndpointBuilder,
  interceptRequests,
  DEFAULT_FETCH_MOCK,
  TOO_MANY_REQUESTS_FETCH_MOCK,
  NETWORK_ERROR_FETCH_MOCK,
  wait,
} from '../../test'
import type { Request } from '../../test'
import type { EndpointBuilder } from '../domain/configuration'
import { createEndpointBuilder } from '../domain/configuration'
import { addExperimentalFeatures, resetExperimentalFeatures, ExperimentalFeature } from '../tools/experimentalFeatures'
import { noop } from '../tools/utils/functionUtils'
import {
  createHttpRequest,
  fetchKeepAliveStrategy,
  fetchStrategy,
  RECOMMENDED_REQUEST_BYTES_LIMIT,
} from './httpRequest'
import type { HttpRequest, HttpRequestEvent } from './httpRequest'

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
    it('should use fetch when fetch keepalive is not available', async () => {
      interceptor.withRequest(false)

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
    })

    it('should use fetch keepalive when the bytes count is correct', async () => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch-keepalive')
    })

    it('should use fetch over fetch keepalive when the bytes count is too high', async () => {
      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: RECOMMENDED_REQUEST_BYTES_LIMIT })
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should fallback to fetch when fetch keepalive is not queued', async () => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      const fetchSpy = interceptor.withFetch(NETWORK_ERROR_FETCH_MOCK, DEFAULT_FETCH_MOCK)

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()
      await collectAsyncCalls(fetchSpy, 2)
      expect(requests.length).toEqual(2)
      expect(requests[0].type).toBe('fetch-keepalive')
      expect(requests[1].type).toBe('fetch')
    })

    it('should use retry strategy', async () => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

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

  describe('fetchKeepAliveStrategy onResponse', () => {
    it('should be called with intake response when fetch is used', (done) => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK)

      fetchKeepAliveStrategy(
        endpointBuilder,
        RECOMMENDED_REQUEST_BYTES_LIMIT,
        { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 },
        (response) => {
          expect(response).toEqual({ status: 429, type: 'cors' })
          done()
        }
      )
    })

    it('should be called with intake response when fallback to fetch due fetch keepalive not queued', (done) => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      interceptor.withFetch(NETWORK_ERROR_FETCH_MOCK, TOO_MANY_REQUESTS_FETCH_MOCK)

      fetchKeepAliveStrategy(
        endpointBuilder,
        RECOMMENDED_REQUEST_BYTES_LIMIT,
        { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 },
        (response) => {
          expect(response).toEqual({ status: 429, type: 'cors' })
          done()
        }
      )
    })

    it('should be called with intake response when fallback to fetch due to size', (done) => {
      interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK)

      fetchKeepAliveStrategy(
        endpointBuilder,
        RECOMMENDED_REQUEST_BYTES_LIMIT,
        { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: RECOMMENDED_REQUEST_BYTES_LIMIT },
        (response) => {
          expect(response).toEqual({ status: 429, type: 'cors' })
          done()
        }
      )
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

    it('should use sendBeacon when the bytes count is correct', () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('sendBeacon')
    })

    it('should use fetch over sendBeacon when the bytes count is too high', async () => {
      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: RECOMMENDED_REQUEST_BYTES_LIMIT })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should fallback to fetch when sendBeacon is not queued', async () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }
      interceptor.withSendBeacon(() => false)

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should fallback to fetch when sendBeacon throws', async () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }
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

      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
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

      expect(latestEvents()).toEqual([
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
        { type: 'failure', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
        { type: 'success', bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 }, payload },
      ])
    })
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

describe('httpRequest with AVOID_FETCH_KEEPALIVE feature flag', () => {
  const ENDPOINT_URL = 'http://my.website'
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    interceptor = interceptRequests()
    requests = interceptor.requests
    endpointBuilder = mockEndpointBuilder(ENDPOINT_URL)
  })

  afterEach(() => {
    resetExperimentalFeatures()
  })

  it('should use regular fetch (without keepalive) when feature flag is enabled', async () => {
    addExperimentalFeatures([ExperimentalFeature.AVOID_FETCH_KEEPALIVE])
    request = createHttpRequest([endpointBuilder], noop)

    request.send({ data: '{"foo":"bar"}', bytesCount: 10 })
    await interceptor.waitForAllFetchCalls()

    expect(requests.length).toEqual(1)
    expect(requests[0].type).toBe('fetch')
    expect(requests[0].url).toContain(ENDPOINT_URL)
  })

  it('should use fetch keepalive when feature flag is not enabled', async () => {
    if (!interceptor.isFetchKeepAliveSupported()) {
      pending('no fetch keepalive support')
    }

    request = createHttpRequest([endpointBuilder], noop)

    request.send({ data: '{"foo":"bar"}', bytesCount: 10 })
    await interceptor.waitForAllFetchCalls()

    expect(requests.length).toEqual(1)
    expect(requests[0].type).toBe('fetch-keepalive')
  })
})
