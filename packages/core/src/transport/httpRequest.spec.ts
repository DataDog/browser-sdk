/* eslint-disable @typescript-eslint/unbound-method */
import { stubEndpointBuilder, interceptRequests } from '../../test/specHelper'
import type { Request } from '../../test/specHelper'
import type { EndpointBuilder } from '../domain/configuration'
import { createEndpointBuilder, updateExperimentalFeatures, resetExperimentalFeatures } from '../domain/configuration'
import { createHttpRequest } from './httpRequest'
import type { HttpRequest } from './httpRequest'

describe('httpRequest', () => {
  const BATCH_BYTES_LIMIT = 100
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest
  const ENDPOINT_URL = 'http://my.website'

  beforeEach(() => {
    interceptor = interceptRequests()
    requests = interceptor.requests
    endpointBuilder = stubEndpointBuilder(ENDPOINT_URL)
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  afterEach(() => {
    interceptor.restore()
  })

  describe('send (without fetch_keepalive FF)', () => {
    it('should use xhr when sendBeacon is not defined', () => {
      interceptor.withSendBeacon(false)

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
    })

    it('should use sendBeacon when the bytes count is correct', () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('sendBeacon')
    })

    it('should use xhr over sendBeacon when the bytes count is too high', () => {
      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when sendBeacon is not queued', () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }
      interceptor.withSendBeacon(() => false)

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

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

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)
      expect(sendBeaconCalled).toBe(true)
      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })
  })

  describe('send (with fetch_keepalive FF)', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['fetch_keepalive'])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should use xhr when fetch keepalive is not available', () => {
      interceptor.withRequest(false)

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
    })

    it('should use fetch keepalive when the bytes count is correct', () => {
      if (!interceptor.isFetchKeepAliveSupported()) {
        pending('no fetch keepalive support')
      }

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('fetch')
    })

    it('should use xhr over fetch keepalive when the bytes count is too high', () => {
      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

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

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      notQueuedFetch!.catch(() => {
        expect(requests.length).toEqual(1)
        expect(requests[0].type).toBe('xhr')
        done()
      })
    })
  })

  describe('sendOnExit', () => {
    it('should use xhr when sendBeacon is not defined', () => {
      interceptor.withSendBeacon(false)

      request.sendOnExit('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
    })

    it('should use sendBeacon when the bytes count is correct', () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }

      request.sendOnExit('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('sendBeacon')
    })

    it('should use xhr over sendBeacon when the bytes count is too high', () => {
      request.sendOnExit('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when sendBeacon is not queued', () => {
      if (!interceptor.isSendBeaconSupported()) {
        pending('no sendBeacon support')
      }
      interceptor.withSendBeacon(() => false)

      request.sendOnExit('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

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

      request.sendOnExit('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

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
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  afterEach(() => {
    interceptor.restore()
  })

  it('should have a unique request id', () => {
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    const search = /dd-request-id=([^&]*)/
    const requestId1 = search.exec(requests[0].url)?.[1]
    const requestId2 = search.exec(requests[1].url)?.[1]

    expect(requestId1).not.toBe(requestId2)
    expect(requests.length).toEqual(2)
  })
})
