import type { HttpRequest, Payload } from '@datadog/browser-core'
import type { EmitCanvasResourceCallback } from '../record'
import { buildCanvasResourcePayload } from './buildCanvasResourcePayload'

export function startCanvasResourceCollection(
  applicationId: string,
  httpRequest: HttpRequest<Payload>
): EmitCanvasResourceCallback {
  const uploadedHashes = new Set<string>()
  const pendingHashes = new WeakMap<Payload, string>()

  httpRequest.observable.subscribe((event) => {
    if (event.type === 'queue-full') {
      const hash = pendingHashes.get(event.payload)
      if (hash) {
        uploadedHashes.delete(hash)
      }
    }
  })

  return (hash, image) => {
    if (uploadedHashes.has(hash)) {
      return
    }
    uploadedHashes.add(hash)
    const payload = buildCanvasResourcePayload(hash, image, applicationId)
    pendingHashes.set(payload, hash)
    httpRequest.send(payload)
  }
}
