import type { HttpRequest, Payload } from '@datadog/browser-core'
import type { EmitCanvasResourceCallback } from '../record'
import { buildCanvasResourcePayload } from './buildCanvasResourcePayload'

export function startCanvasResourceCollection(
  applicationId: string,
  httpRequest: HttpRequest<Payload>
): EmitCanvasResourceCallback {
  const uploadedHashes = new Set<string>()

  return (hash, image) => {
    if (uploadedHashes.has(hash)) {
      return
    }
    uploadedHashes.add(hash)
    httpRequest.send(buildCanvasResourcePayload(hash, image, applicationId))
  }
}
