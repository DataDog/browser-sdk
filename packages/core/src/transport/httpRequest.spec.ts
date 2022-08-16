/* eslint-disable @typescript-eslint/unbound-method */
import { stubEndpointBuilder, interceptRequests } from '../../test/specHelper'
import type { Request } from '../../test/specHelper'
import type { EndpointBuilder } from '../domain/configuration'
import { createEndpointBuilder, updateExperimentalFeatures, resetExperimentalFeatures } from '../domain/configuration'
import { createHttpRequest } from './httpRequest'
import type { HttpRequest } from './httpRequest'

describe('httpRequest', () => {
  const BATCH_BYTES_LIMIT = 100
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest
  const ENDPOINT_URL = 'http://my.website'

  beforeEach(() => {
    requests = interceptRequests()
    endpointBuilder = stubEndpointBuilder(ENDPOINT_URL)
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  describe('send (without fetch-keepalive FF)', () => {
    it('should use xhr when sendBeacon is not defined', () => {
      const originalSendBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator)
      ;(navigator.sendBeacon as any) = false

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
      navigator.sendBeacon = originalSendBeacon
    })

    it('should use sendBeacon when the bytes count is correct', () => {
      if (!navigator.sendBeacon) {
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
      if (!navigator.sendBeacon) {
        pending('no sendBeacon support')
      }
      spyOn(navigator, 'sendBeacon').and.callFake(() => false)

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when sendBeacon throws', () => {
      if (!navigator.sendBeacon) {
        pending('no sendBeacon support')
      }
      spyOn(navigator, 'sendBeacon').and.callFake(() => {
        throw new TypeError()
      })

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(navigator.sendBeacon).toHaveBeenCalled()
      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })
  })

  describe('send (with fetch-keepalive FF)', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['fetch-keepalive'])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should use xhr when fetch keepalive is not available', () => {
      const originalRequest = window.Request
      ;(window.Request as any) = false

      request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
      window.Request = originalRequest
    })

    it('should use fetch keepalive when the bytes count is correct', () => {
      if (!('fetch' in window) || !('keepalive' in new window.Request(''))) {
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
      if (!('fetch' in window) || !('keepalive' in new window.Request(''))) {
        pending('no fetch keepalive support')
      }

      let notQueuedFetch: Promise<never>
      spyOn(window, 'fetch').and.callFake(() => {
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

  describe('sendBeacon', () => {
    it('should use xhr when sendBeacon is not defined', () => {
      const originalSendBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator)
      ;(navigator.sendBeacon as any) = false

      request.sendBeacon('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
      expect(requests[0].url).toContain(ENDPOINT_URL)
      expect(requests[0].body).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
      navigator.sendBeacon = originalSendBeacon
    })

    it('should use sendBeacon when the bytes count is correct', () => {
      if (!navigator.sendBeacon) {
        pending('no sendBeacon support')
      }

      request.sendBeacon('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('sendBeacon')
    })

    it('should use xhr over sendBeacon when the bytes count is too high', () => {
      request.sendBeacon('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when sendBeacon is not queued', () => {
      if (!navigator.sendBeacon) {
        pending('no sendBeacon support')
      }
      spyOn(navigator, 'sendBeacon').and.callFake(() => false)

      request.sendBeacon('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })

    it('should fallback to xhr when sendBeacon throws', () => {
      if (!navigator.sendBeacon) {
        pending('no sendBeacon support')
      }
      spyOn(navigator, 'sendBeacon').and.callFake(() => {
        throw new TypeError()
      })

      request.sendBeacon('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

      expect(navigator.sendBeacon).toHaveBeenCalled()
      expect(requests.length).toEqual(1)
      expect(requests[0].type).toBe('xhr')
    })
  })
})

describe('httpRequest intake parameters', () => {
  const clientToken = 'some_client_token'
  const BATCH_BYTES_LIMIT = 100
  let requests: Request[]
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    requests = interceptRequests()
    endpointBuilder = createEndpointBuilder({ clientToken }, 'logs', [])
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
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
