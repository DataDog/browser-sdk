/* eslint-disable @typescript-eslint/unbound-method */
import sinon from 'sinon'
import { stubEndpointBuilder } from '../../test/specHelper'
import type { EndpointBuilder } from '../domain/configuration'
import { createEndpointBuilder } from '../domain/configuration'
import { HttpRequest } from './httpRequest'

describe('httpRequest', () => {
  const BATCH_BYTES_LIMIT = 100
  let server: sinon.SinonFakeServer
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest
  const ENDPOINT_URL = 'http://my.website'

  beforeEach(() => {
    server = sinon.fakeServer.create()
    endpointBuilder = stubEndpointBuilder(ENDPOINT_URL)
    request = new HttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  afterEach(() => {
    server.restore()
  })

  it('should use xhr when sendBeacon is not defined', () => {
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(server.requests.length).toEqual(1)
    expect(server.requests[0].url).toContain(ENDPOINT_URL)
    expect(server.requests[0].requestBody).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
  })

  it('should use sendBeacon when the bytes count is correct', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => true)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).toHaveBeenCalled()
  })

  it('should use xhr over sendBeacon when the bytes count is too high', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => true)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

    expect(server.requests.length).toEqual(1)
    expect(server.requests[0].url).toContain(ENDPOINT_URL)
    expect(server.requests[0].requestBody).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
  })

  it('should fallback to xhr when sendBeacon is not queued', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => false)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).toHaveBeenCalled()
    expect(server.requests.length).toEqual(1)
  })

  it('should fallback to xhr when sendBeacon throws', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => {
      throw new TypeError()
    })

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).toHaveBeenCalled()
    expect(server.requests.length).toEqual(1)
  })
})

describe('httpRequest intake parameters', () => {
  const clientToken = 'some_client_token'
  const BATCH_BYTES_LIMIT = 100
  let server: sinon.SinonFakeServer
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    server = sinon.fakeServer.create()
    endpointBuilder = createEndpointBuilder({ clientToken }, 'logs', [])
    request = new HttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  afterEach(() => {
    server.restore()
  })

  it('should have a unique request id', () => {
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    const search = /dd-request-id=([^&]*)/
    const requestId1 = search.exec(server.requests[0].url)?.[1]
    const requestId2 = search.exec(server.requests[1].url)?.[1]

    expect(requestId1).not.toBe(requestId2)
    expect(server.requests.length).toEqual(2)
  })
})
