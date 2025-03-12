import {
  collectAsyncCalls,
  mockEndpointBuilder,
  interceptRequests,
  DEFAULT_FETCH_MOCK,
  TOO_MANY_REQUESTS_FETCH_MOCK,
  NETWORK_ERROR_FETCH_MOCK,
} from '../../test'
import type { Request } from '../../test'
import type { EndpointBuilder } from '../domain/configuration'
import { createEndpointBuilder } from '../domain/configuration'
import { noop } from '../tools/utils/functionUtils'
import { createHttpRequest, fetchKeepAliveStrategy, fetchStrategy } from './httpRequest'
import type { HttpRequest } from './httpRequest'

describe('httpRequest', () => {
  const BATCH_BYTES_LIMIT = 100
  const ENDPOINT_URL = 'http://my.website'
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    interceptor = interceptRequests()
    requests = interceptor.requests
    endpointBuilder = mockEndpointBuilder(ENDPOINT_URL)
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT, noop)
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
      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: BATCH_BYTES_LIMIT })
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
      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
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
  })

  describe('fetchKeepAliveStrategy onResponse', () => {
    it('should be called with intake response when fetch is used', (done) => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK)

      fetchKeepAliveStrategy(
        endpointBuilder,
        BATCH_BYTES_LIMIT,
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
        BATCH_BYTES_LIMIT,
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
        BATCH_BYTES_LIMIT,
        { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: BATCH_BYTES_LIMIT },
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
      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: BATCH_BYTES_LIMIT })

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
})

describe('httpRequest intake parameters', () => {
  const clientToken = 'some_client_token'
  const BATCH_BYTES_LIMIT = 100
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    interceptor = interceptRequests()
    requests = interceptor.requests
    endpointBuilder = createEndpointBuilder({ clientToken }, 'logs', [])
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT, noop)
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
