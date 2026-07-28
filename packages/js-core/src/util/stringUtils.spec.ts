import { generateUUID } from './stringUtils'

describe('generateUUID', () => {
  const UUID_V4_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('generates a valid UUID v4', () => {
    expect(generateUUID()).toMatch(UUID_V4_REGEXP)
  })

  it('generates different UUIDs on each call', () => {
    expect(generateUUID()).not.toBe(generateUUID())
  })
})
