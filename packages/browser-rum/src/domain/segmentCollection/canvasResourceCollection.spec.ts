import type { HttpRequest, HttpRequestEvent, Payload } from '@datadog/browser-core'
import { Observable, PageExitReason } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { startCanvasResourceCollection } from './canvasResourceCollection'

describe('canvasResourceCollection', () => {
  const IMAGE_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

  function createHttpRequestSpy() {
    const observable = new Observable<HttpRequestEvent<Payload>>()
    const send = jasmine.createSpy('send')
    const sendOnExit = jasmine.createSpy('sendOnExit')
    const httpRequest = { observable, send, sendOnExit } as HttpRequest
    return { httpRequest, observable, send, sendOnExit }
  }

  function startCollection(httpRequest: HttpRequest<Payload>) {
    const lifeCycle = new LifeCycle()
    const collection = startCanvasResourceCollection('app-id', lifeCycle, httpRequest)
    return { lifeCycle, ...collection }
  }

  it('sends a resource on first sight of a hash', () => {
    const { httpRequest, send } = createHttpRequestSpy()
    const { emitCanvasResource } = startCollection(httpRequest)

    emitCanvasResource('hash1', IMAGE_BLOB)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not re-send a hash already uploaded', () => {
    const { httpRequest, send } = createHttpRequestSpy()
    const { emitCanvasResource } = startCollection(httpRequest)

    emitCanvasResource('hash1', IMAGE_BLOB)
    emitCanvasResource('hash1', IMAGE_BLOB)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries a hash whose upload was discarded because the queue was full', () => {
    const { httpRequest, observable, send } = createHttpRequestSpy()
    const { emitCanvasResource } = startCollection(httpRequest)

    emitCanvasResource('hash1', IMAGE_BLOB)
    const [payload] = send.calls.argsFor(0) as [Payload]
    observable.notify({ type: 'queue-full', payload, bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 } })

    emitCanvasResource('hash1', IMAGE_BLOB)

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('re-sends pending resources on page exit', () => {
    const { httpRequest, sendOnExit } = createHttpRequestSpy()
    const { emitCanvasResource, lifeCycle } = startCollection(httpRequest)

    emitCanvasResource('hash1', IMAGE_BLOB)
    lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.UNLOADING)

    expect(sendOnExit).toHaveBeenCalledTimes(1)
  })

  it('does not re-send a resource whose upload succeeded', () => {
    const { httpRequest, observable, send, sendOnExit } = createHttpRequestSpy()
    const { emitCanvasResource, lifeCycle } = startCollection(httpRequest)

    emitCanvasResource('hash1', IMAGE_BLOB)
    const [payload] = send.calls.argsFor(0) as [Payload]
    observable.notify({ type: 'success', payload, bandwidth: { ongoingByteCount: 0, ongoingRequestCount: 0 } })
    lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.UNLOADING)

    expect(sendOnExit).not.toHaveBeenCalled()
  })

  it('unsubscribes from page exit events when stopped', () => {
    const { httpRequest, sendOnExit } = createHttpRequestSpy()
    const { emitCanvasResource, lifeCycle, stop } = startCollection(httpRequest)

    emitCanvasResource('hash1', IMAGE_BLOB)
    stop()
    lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.UNLOADING)

    expect(sendOnExit).not.toHaveBeenCalled()
  })
})
