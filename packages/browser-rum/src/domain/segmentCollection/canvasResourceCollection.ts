import type { HttpRequest, Payload } from '@datadog/browser-core'
import { buildCanvasResourcePayload } from './buildCanvasResourcePayload'

export function startCanvasResourceCollection(
  applicationId: string,
  httpRequest: HttpRequest<Payload>
): (hash: string, image: Blob) => void {
  const uploadedHashes = new Set<string>()

  return (hash, image) => {
    if (uploadedHashes.has(hash)) {
      return
    }
    uploadedHashes.add(hash)
    httpRequest.send(buildCanvasResourcePayload(hash, image, applicationId))
  }
}
