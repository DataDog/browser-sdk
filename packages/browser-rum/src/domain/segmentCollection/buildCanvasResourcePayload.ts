import type { Payload } from '@datadog/browser-core'

export function buildCanvasResourcePayload(hash: string, image: Blob, application: string): Payload {
  const formData = new FormData()

  formData.append('image', image, hash)

  const event = { application: { id: application }, type: 'resource' }
  formData.append('event', new Blob([JSON.stringify(event)], { type: 'application/json' }))

  return {
    data: formData,
    bytesCount: image.size,
  }
}
