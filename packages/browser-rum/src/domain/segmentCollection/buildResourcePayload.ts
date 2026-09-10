import type { Payload } from '@datadog/browser-core'

export function buildResourcePayload(hash: string, content: Blob, application: string): Payload {
  const formData = new FormData()

  formData.append('image', content, hash)

  const event = { application: { id: application }, type: 'resource' }
  formData.append('event', new Blob([JSON.stringify(event)], { type: 'application/json' }))

  return {
    data: formData,
    bytesCount: content.size,
  }
}
