/* eslint-disable @typescript-eslint/unbound-method */
import sinon from 'sinon'
import { stubEndpointBuilder } from 'packages/core/test/specHelper'
import { createEndpointBuilder, EndpointBuilder } from '../domain/configuration/endpointBuilder'
import { BuildEnv } from '..'
import { HttpRequest } from './httpRequest'

describe('httpRequest', () => {
  const clientToken = 'some_client_token'
  const buildEnv = {} as BuildEnv
  const BATCH_BYTES_LIMIT = 100
  let server: sinon.SinonFakeServer
  let endpointBuilder: EndpointBuilder
  let request: HttpRequest

  beforeEach(() => {
    server = sinon.fakeServer.create()
    endpointBuilder = stubEndpointBuilder('http://my.website')
    request = new HttpRequest(endpointBuilder, BATCH_BYTES_LIMIT)
  })

  afterEach(() => {
    server.restore()
  })

  it('should use xhr when sendBeacon is not defined', () => {
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(server.requests.length).toEqual(1)
    expect(server.requests[0].url).toContain(endpointBuilder.build())
    expect(server.requests[0].requestBody).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
  })

  it('should use sendBeacon when the size is correct', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => true)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).toHaveBeenCalled()
  })

  it('should use xhr over sendBeacon when the size too high', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => true)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

    expect(server.requests.length).toEqual(1)
    expect(server.requests[0].url).toContain(endpointBuilder.build())
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

  it('should have a unique request id', () => {
    const endpointBuilder = createEndpointBuilder({ clientToken, intakeApiVersion: 2 }, buildEnv, 'logs')
    const request = new HttpRequest(endpointBuilder, BATCH_BYTES_LIMIT, true)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    const search = /dd-request-id=([^&]*)/
    const [, requestId1] = search.exec(server.requests[0].url) || new Array(2)
    const [, requestId2] = search.exec(server.requests[1].url) || new Array(2)

    expect(requestId1).not.toBe(requestId2)
    expect(server.requests.length).toEqual(2)
  })
})
