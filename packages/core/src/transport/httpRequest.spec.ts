/* eslint-disable @typescript-eslint/unbound-method */
import { stubEndpointBuilder } from '../../test/specHelper'
import type { EndpointBuilder } from '../domain/configuration'
import { resetExperimentalFeatures, updateExperimentalFeatures, createEndpointBuilder } from '../domain/configuration'
import type { HttpRequest } from './httpRequest'
import { createHttpRequest } from './httpRequest'

const DATA = '{"foo":"bar1"}\n{"foo":"bar2"}'

describe('createHttpRequest', () => {
  const BATCH_BYTES_LIMIT = 100
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest
  const ENDPOINT_URL = 'http://my.website'
  let xmlHttpRequestSpy: jasmine.Spy

  beforeEach(() => {
    xmlHttpRequestSpy = spyOn(XMLHttpRequest.prototype, 'send').and.callFake(() => undefined)

    endpointBuilder = stubEndpointBuilder(ENDPOINT_URL)

    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  describe('when ff fetch-keepalive is enabled ', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['fetch-keepalive'])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should use xhr when fetch with keepalive is not defined', () => {
      spyOn(window, 'fetch').and.resolveTo({} as Response)
      spyOn(window, 'Request').and.returnValue(undefined as unknown as Request)
      request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)

      request.send(DATA, 10)

      expect(xmlHttpRequestSpy).toHaveBeenCalledOnceWith(DATA)
      expect(window.fetch).not.toHaveBeenCalled()
    })

    it('should use xhr when the bytes count is too high', () => {
      spyOn(window, 'fetch').and.resolveTo({} as Response)

      request.send(DATA, BATCH_BYTES_LIMIT + 1)

      expect(xmlHttpRequestSpy).toHaveBeenCalledOnceWith(DATA)
      expect(window.fetch).not.toHaveBeenCalled()
    })

    it('should use fetch with keepalive when the bytes count is correct', () => {
      spyOn(window, 'fetch').and.resolveTo({} as Response)

      request.send(DATA, 10)

      expect(window.fetch).toHaveBeenCalledOnceWith(ENDPOINT_URL, jasmine.objectContaining({ body: DATA }))
      expect(xmlHttpRequestSpy).not.toHaveBeenCalled()
    })

    it('should fallback to xhr when a network error happens with fetch with keepalive ', (done) => {
      spyOn(window, 'fetch').and.rejectWith()

      request.send(DATA, 10)

      setTimeout(() => {
        expect(window.fetch).toHaveBeenCalledWith(ENDPOINT_URL, jasmine.objectContaining({ body: DATA }))
        expect(xmlHttpRequestSpy).toHaveBeenCalledOnceWith(DATA)

        done()
      })
    })
  })

  describe('when ff fetch-keepalive is disabled ', () => {
    let originalSendBeacon: typeof navigator.sendBeacon
    beforeEach(() => {
      originalSendBeacon = navigator.sendBeacon
    })
    afterEach(() => {
      navigator.sendBeacon = originalSendBeacon
    })

    it('should use xhr when sendBeacon is not defined', () => {
      ;(navigator.sendBeacon as any) = undefined
      request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)

      request.send(DATA, 10)

      expect(xmlHttpRequestSpy).toHaveBeenCalledOnceWith(DATA)
    })

    it('should use sendBeacon when the bytes count is correct', () => {
      spyOn(navigator, 'sendBeacon').and.returnValue(true)

      request.send(DATA, 10)

      expect(navigator.sendBeacon).toHaveBeenCalledOnceWith(ENDPOINT_URL, DATA)
      expect(xmlHttpRequestSpy).not.toHaveBeenCalled()
    })

    it('should use xhr over sendBeacon when the bytes count is too high', () => {
      spyOn(navigator, 'sendBeacon').and.returnValue(true)

      request.send(DATA, BATCH_BYTES_LIMIT)

      expect(xmlHttpRequestSpy).toHaveBeenCalledOnceWith(DATA)
      expect(navigator.sendBeacon).not.toHaveBeenCalled()
    })

    it('should fallback to xhr when sendBeacon is not queued', () => {
      spyOn(navigator, 'sendBeacon').and.returnValue(false)

      request.send(DATA, 10)

      expect(navigator.sendBeacon).toHaveBeenCalledOnceWith(ENDPOINT_URL, DATA)
      expect(xmlHttpRequestSpy).toHaveBeenCalledOnceWith(DATA)
    })

    it('should fallback to xhr when sendBeacon throws', () => {
      spyOn(navigator, 'sendBeacon').and.throwError(new TypeError())

      request.send(DATA, 10)
      expect(navigator.sendBeacon).toHaveBeenCalledOnceWith(ENDPOINT_URL, DATA)
      expect(xmlHttpRequestSpy).toHaveBeenCalledOnceWith(DATA)
    })
  })
})

describe('httpRequest intake parameters', () => {
  const clientToken = 'some_client_token'
  const BATCH_BYTES_LIMIT = 100
  let endpointBuilder: EndpointBuilder
  let request: ReturnType<typeof createHttpRequest>
  let urlSpy: jasmine.Spy

  beforeEach(() => {
    endpointBuilder = createEndpointBuilder({ clientToken }, 'logs', [])
    urlSpy = spyOn(endpointBuilder, 'build').and.callThrough()
    request = createHttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  it('should have a unique request id', () => {
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(urlSpy).toHaveBeenCalledTimes(2)

    const search = /dd-request-id=([^&]*)/
    const requestId1 = search.exec(urlSpy.calls.first().returnValue)?.[1]
    const requestId2 = search.exec(urlSpy.calls.mostRecent().returnValue)?.[1]
    expect(requestId1).not.toBe(requestId2)
  })
})
