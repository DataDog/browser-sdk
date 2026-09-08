import type { HttpRequest } from '@datadog/browser-core'
import { startCanvasResourceCollection } from './canvasResourceCollection'

describe('canvasResourceCollection', () => {
  const IMAGE_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

  it('sends a resource on first sight of a hash', () => {
    const httpRequest = { send: jasmine.createSpy() } as unknown as HttpRequest
    const addResource = startCanvasResourceCollection('app-id', httpRequest)

    addResource('hash1', IMAGE_BLOB)

    expect(httpRequest.send).toHaveBeenCalledTimes(1)
  })

  it('does not re-send a hash already uploaded', () => {
    const httpRequest = { send: jasmine.createSpy() } as unknown as HttpRequest
    const addResource = startCanvasResourceCollection('app-id', httpRequest)

    addResource('hash1', IMAGE_BLOB)
    addResource('hash1', IMAGE_BLOB)

    expect(httpRequest.send).toHaveBeenCalledTimes(1)
  })
})
