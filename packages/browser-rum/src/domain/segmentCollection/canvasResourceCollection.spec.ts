import type { HttpRequest, HttpRequestEvent, Payload } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'
import { startCanvasResourceCollection } from './canvasResourceCollection'

describe('canvasResourceCollection', () => {
  const IMAGE_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

  function createHttpRequestSpy() {
    const observable = new Observable<HttpRequestEvent<Payload>>()
    const send = jasmine.createSpy('send')
    const httpRequest = { observable, send } as unknown as HttpRequest
    return { httpRequest, observable, send }
  }

  it('sends a resource on first sight of a hash', () => {
    const { httpRequest, send } = createHttpRequestSpy()
    const addResource = startCanvasResourceCollection('app-id', httpRequest)

    addResource('hash1', IMAGE_BLOB)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not re-send a hash already uploaded', () => {
    const { httpRequest, send } = createHttpRequestSpy()
    const addResource = startCanvasResourceCollection('app-id', httpRequest)

    addResource('hash1', IMAGE_BLOB)
    addResource('hash1', IMAGE_BLOB)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries a hash whose upload was discarded because the queue was full', () => {
    const { httpRequest, observable, send } = createHttpRequestSpy()
    const addResource = startCanvasResourceCollection('app-id', httpRequest)

    addResource('hash1', IMAGE_BLOB)
    const [payload] = send.calls.argsFor(0) as [Payload]
    observable.notify({ type: 'queue-full', payload, bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 } })

    addResource('hash1', IMAGE_BLOB)

    expect(send).toHaveBeenCalledTimes(2)
  })
})
