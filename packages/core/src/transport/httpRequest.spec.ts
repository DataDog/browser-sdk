import { stubEndpointBuilder, interceptRequests } from '../../test/specHelper'
import type { Request } from '../../test/specHelper'
import type { EndpointBuilder } from '../domain/configuration'
import { createEndpointBuilder } from '../domain/configuration'
import { noop } from '../tools/utils'
import { createHttpRequest, fetchKeepAliveStrategy, sendXHR } from './httpRequest'
import type { HttpRequest } from './httpRequest'
import { INITIAL_BACKOFF_TIME } from './sendWithRetryStrategy'

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
    endpointBuilder = stubEndpointBuilder(ENDPOINT_URL)
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT, noop)
  })

  afterEach(() => {
    interceptor.restore()
  })

  describe('send', () => {
    it('should use xhr when fetch keepalive is not available', () => {
      interceptor.withRequest(false)

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
    })

    it('should use fetch keepalive when the bytes count is correct', () => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should use xhr over fetch keepalive when the bytes count is too high', () => {
      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: BATCH_BYTES_LIMIT })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when fetch keepalive is not queued', (done) => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }
      let notQueuedFetch: Promise<never>
      interceptor.withFetch(() => {
        notQueuedFetch = Promise.reject()
        return notQueuedFetch
      })

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      notQueuedFetch!.catch(() => {
        expect(requests.length).toEqual(1)
        expect(requests[0].type).toBe('xhr')
        done()
      })
    })

    it('should use retry strategy', (done) => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }
      let calls = 0
      interceptor.withFetch(() => {
        calls++
        if (calls === 1) {
          return Promise.resolve({ status: 408 })
        }
        if (calls === 2) {
          return Promise.resolve({ status: 200 })
        }
      })

      request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      setTimeout(() => {
        expect(calls).toEqual(2)
        done()
      }, INITIAL_BACKOFF_TIME + 1)
    })
  })

  describe('fetchKeepAliveStrategy onResponse', () => {
    it('should be called with intake response when fetch is used', (done) => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      interceptor.withFetch(() => Promise.resolve({ status: 429 }))

      fetchKeepAliveStrategy(
        endpointBuilder,
        BATCH_BYTES_LIMIT,
        { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 },
        (response) => {
          expect(response).toEqual({ status: 429 })
          done()
        }
      )
    })

    it('should be called with intake response when fallback to xhr due fetch not queued', (done) => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      interceptor.withFetch(() => Promise.reject())
      interceptor.withStubXhr((xhr) => {
        setTimeout(() => {
          xhr.complete(429)
        })
      })

      fetchKeepAliveStrategy(
        endpointBuilder,
        BATCH_BYTES_LIMIT,
        { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 },
        (response) => {
          expect(response).toEqual({ status: 429 })
          done()
        }
      )
    })

    it('should be called with intake response when fallback to xhr due to size', (done) => {
      interceptor.withStubXhr((xhr) => {
        setTimeout(() => {
          xhr.complete(429)
        })
      })

      fetchKeepAliveStrategy(
        endpointBuilder,
        BATCH_BYTES_LIMIT,
        { data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: BATCH_BYTES_LIMIT },
        (response) => {
          expect(response).toEqual({ status: 429 })
          done()
        }
      )
    })
  })

  describe('sendXhr', () => {
    it('should prevent third party to trigger callback multiple times', (done) => {
      const onResponseSpy = jasmine.createSpy('xhrOnResponse')
      let count = 0

      interceptor.withStubXhr((xhr) => {
        count++
        setTimeout(() => {
          xhr.complete(count === 1 ? 200 : 202)
          if (count === 1) {
            // reuse the xhr instance to send another request
            xhr.open('POST', 'foo')
            xhr.send()
          }
        })
      })

      sendXHR('foo', '', onResponseSpy)

      setTimeout(() => {
        expect(onResponseSpy).toHaveBeenCalledTimes(1)
        expect(onResponseSpy).toHaveBeenCalledWith({
          status: 200,
        })
        done()
      }, 100)
    })
  })

  describe('sendOnExit', () => {
    it('should use xhr when sendBeacon is not defined', () => {
      interceptor.withSendBeacon(false)

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
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

    it('should use xhr over sendBeacon when the bytes count is too high', () => {
      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: BATCH_BYTES_LIMIT })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when sendBeacon is not queued', () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }
      interceptor.withSendBeacon(() => false)

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when sendBeacon throws', () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }
      let sendBeaconCalled = false
      interceptor.withSendBeacon(() => {
        sendBeaconCalled = true
        throw new TypeError()
      })

      request.sendOnExit({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

      expect(sendBeaconCalled).toBe(true)
      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
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

  afterEach(() => {
    interceptor.restore()
  })

  it('should have a unique request id', () => {
    request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })
    request.send({ data: '{"foo":"bar1"}\n{"foo":"bar2"}', bytesCount: 10 })

    const search = /dd-request-id=([^&]*)/
    const requestId1 = search.exec(requests[0].url)?.[1]
    const requestId2 = search.exec(requests[1].url)?.[1]

    expect(requestId1).not.toBe(requestId2)
    expect(requests.length).toEqual(2)
  })
})
