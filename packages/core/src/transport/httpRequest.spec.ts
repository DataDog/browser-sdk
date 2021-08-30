/* eslint-disable @typescript-eslint/unbound-method */
import sinon from 'sinon'
import { BuildEnv, BuildMode } from '../boot/init'
import { createEndpointBuilder } from '../domain/configuration/endpointBuilder'
import { HttpRequest } from './httpRequest'

describe('httpRequest', () => {
  const ENDPOINT_URL = 'http://my.website'
  const BATCH_BYTES_LIMIT = 100
  let server: sinon.SinonFakeServer
  let request: HttpRequest

  beforeEach(() => {
    server = sinon.fakeServer.create()
    request = new HttpRequest(ENDPOINT_URL, BATCH_BYTES_LIMIT)
  })

  afterEach(() => {
    server.restore()
  })

  it('should use xhr when sendBeacon is not defined', () => {
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(server.requests.length).toEqual(1)
    expect(server.requests[0].url).toEqual(ENDPOINT_URL)
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
    expect(server.requests[0].url).toEqual(ENDPOINT_URL)
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

describe('httpRequest parameters', () => {
  const BATCH_BYTES_LIMIT = 100
  const clientToken = 'some_client_token'
  const buildEnv: BuildEnv = {
    buildMode: BuildMode.RELEASE,
    sdkVersion: 'some_version',
  }
  let server: sinon.SinonFakeServer
  let sendBeaconSpy: jasmine.Spy<(url: string, data?: BodyInit | null) => boolean>
  beforeEach(() => {
    server = sinon.fakeServer.create()
    sendBeaconSpy = jasmine.createSpy()
    navigator.sendBeacon = sendBeaconSpy
  })

  afterEach(() => {
    server.restore()
  })

  it('should add batch_time', () => {
    const request = new HttpRequest('https://my.website', BATCH_BYTES_LIMIT, true)

    request.send('{"foo":"bar1"}', 10)

    expect(sendBeaconSpy.calls.argsFor(0)[0]).toContain(`batch_time=`)
  })

  it('should add dd-request-id query attribute when the intake v2 enabled', () => {
    const endpointBuilder = createEndpointBuilder({ clientToken, intakeApiVersion: 2 }, buildEnv, true)
    const request = new HttpRequest(endpointBuilder.build('rum'), BATCH_BYTES_LIMIT)

    request.send('{"foo":"bar1"}', 10)

    expect(sendBeaconSpy.calls.argsFor(0)[0]).toContain(`&dd-request-id=`)
  })

  it('should not add dd-request-id query attribute when the intake v1 enabled', () => {
    const endpointBuilder = createEndpointBuilder({ clientToken }, buildEnv, true)
    const request = new HttpRequest(endpointBuilder.build('rum'), BATCH_BYTES_LIMIT)

    request.send('{"foo":"bar1"}', 10)

    expect(sendBeaconSpy.calls.argsFor(0)[0]).not.toContain(`&dd-request-id=`)
  })
})
