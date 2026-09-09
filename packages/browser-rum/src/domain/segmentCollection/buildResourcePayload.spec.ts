import type { Payload } from '@datadog/browser-core'
import { buildResourcePayload } from './buildResourcePayload'

describe('buildResourcePayload', () => {
  const HASH = '20x30-abcdef1234567890'
  const IMAGE_BLOB = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
  const APPLICATION_ID = 'app-id'
  let payload: Payload

  beforeEach(() => {
    payload = buildResourcePayload(HASH, IMAGE_BLOB, APPLICATION_ID)
  })

  it('adds the image as a file named after the hash', () => {
    const imageEntry = (payload.data as FormData).get('image')! as File
    expect(imageEntry.name).toBe(HASH)
    expect(imageEntry.type).toBe('image/png')
    expect(imageEntry.size).toBe(IMAGE_BLOB.size)
  })

  it('adds the application id and type as the `event` entry', () => {
    const eventEntry = (payload.data as FormData).get('event')! as string
    expect(JSON.parse(eventEntry)).toEqual({ application: { id: APPLICATION_ID }, type: 'resource' })
  })

  it('returns the image size as the approximate byte count', () => {
    expect(payload.bytesCount).toBe(IMAGE_BLOB.size)
  })
})
