import type { HttpRequest, Payload } from '@datadog/browser-core'
import { buildCanvasResourcePayload } from './buildCanvasResourcePayload'

export interface ResourceCollector {
  addResource(this: void, hash: string, image: Blob): void
}

export function startCanvasResourceCollection(
  applicationId: string,
  httpRequest: HttpRequest<Payload>
): ResourceCollector {
  const uploadedHashes = new Set<string>()

  return {
    addResource: (hash, image) => {
      if (uploadedHashes.has(hash)) {
        return
      }
      uploadedHashes.add(hash)
      httpRequest.send(buildCanvasResourcePayload(hash, image, applicationId))
    },
  }
}
