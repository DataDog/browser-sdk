import { generateUUID, findCommaSeparatedValue, findAllCommaSeparatedValues, safeTruncate } from './stringUtils'

describe('generateUUID', () => {
  describe('deterministic UUID generation', () => {
    it('should generate deterministic UUID when both deviceId and applicationId are provided', () => {
      const deviceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
      const applicationId = 'app-123-456'

      const uuid1 = generateUUID(deviceId, applicationId)
      const uuid2 = generateUUID(deviceId, applicationId)

      // Same inputs should produce same output
      expect(uuid1).toBe(uuid2)
      // Should be valid UUID format
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('should generate different UUIDs for different deviceIds', () => {
      const deviceId1 = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
      const deviceId2 = 'f0e1d2c3-b4a5-9687-7685-fedcba098765'
      const applicationId = 'app-123'

      const uuid1 = generateUUID(deviceId1, applicationId)
      const uuid2 = generateUUID(deviceId2, applicationId)

      expect(uuid1).not.toBe(uuid2)
    })

    it('should generate different UUIDs for different applicationIds', () => {
      const deviceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
      const applicationId1 = 'app-123'
      const applicationId2 = 'app-456'

      const uuid1 = generateUUID(deviceId, applicationId1)
      const uuid2 = generateUUID(deviceId, applicationId2)

      expect(uuid1).not.toBe(uuid2)
    })

    it('should generate deterministic UUID that changes over time windows', () => {
      const deviceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
      const applicationId = 'app-123'

      const uuid1 = generateUUID(deviceId, applicationId)

      // Fast-forward time by more than SESSION_DURATION (15 minutes)
      const originalDateNow = Date.now
      Date.now = () => originalDateNow() + 16 * 60 * 1000

      const uuid2 = generateUUID(deviceId, applicationId)

      // Restore Date.now
      Date.now = originalDateNow

      // UUIDs should be different due to different time fence
      expect(uuid1).not.toBe(uuid2)
    })
  })

  describe('random UUID generation (fallback)', () => {
    it('should generate random UUID when deviceId is empty', () => {
      const uuid1 = generateUUID('', 'app-123')
      const uuid2 = generateUUID('', 'app-123')

      // Should be different (random)
      expect(uuid1).not.toBe(uuid2)
      // Should be valid UUID format
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('should generate random UUID when applicationId is empty', () => {
      const uuid1 = generateUUID('device-123', '')
      const uuid2 = generateUUID('device-123', '')

      // Should be different (random)
      expect(uuid1).not.toBe(uuid2)
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('should generate random UUID when both parameters are empty', () => {
      const uuid1 = generateUUID('', '')
      const uuid2 = generateUUID('', '')

      expect(uuid1).not.toBe(uuid2)
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('should generate random UUID when called with no parameters', () => {
      const uuid1 = generateUUID()
      const uuid2 = generateUUID()

      expect(uuid1).not.toBe(uuid2)
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
  })
})

describe('findCommaSeparatedValue', () => {
  it('returns the value from a comma separated hash', () => {
    expect(findCommaSeparatedValue('foo=a;bar=b', 'foo')).toBe('a')
    expect(findCommaSeparatedValue('foo=a;bar=b', 'bar')).toBe('b')
  })

  it('returns the first value if multiple values with the same key', () => {
    expect(findCommaSeparatedValue('k1=v1;k1=v2', 'k1')).toEqual('v1')
  })

  it('returns undefined if the key is not present', () => {
    expect(findCommaSeparatedValue('k1=v1;k2=v2', 'k3')).toBeUndefined()
  })

  it('supports semi-colon as value separator', () => {
    expect(findCommaSeparatedValue('k1=v1;k2=v2', 'k1')).toEqual('v1')
  })

  it('is white-spaces tolerant', () => {
    expect(findCommaSeparatedValue('   foo  =   a;  bar  =   b', 'foo')).toBe('a')
    expect(findCommaSeparatedValue('   foo  =   a;  bar  =   b', 'bar')).toBe('b')
  })
})

describe('findAllCommaSeparatedValues', () => {
  it('returns all the values from a comma separated hash', () => {
    const expectedValues = new Map<string, string[]>()
    expectedValues.set('foo', ['a', 'c'])
    expectedValues.set('bar', ['b'])
    expect(findAllCommaSeparatedValues('foo=a;bar=b;foo=c')).toEqual(expectedValues)
  })

  it('returns an empty map if no key-value pairs', () => {
    const result = findAllCommaSeparatedValues('')
    expect(result.size).toBe(0)
  })
})

describe('safeTruncate', () => {
  it('returns the full string if shorter than length', () => {
    expect(safeTruncate('hello', 10)).toBe('hello')
  })

  it('truncates string to specified length', () => {
    expect(safeTruncate('hello world', 5)).toBe('hello')
  })

  it('handles emoji/surrogate pairs correctly', () => {
    const emojiString = 'hello😀world'
    // The emoji is at position 5, if we truncate at 5, we should get the emoji too
    expect(safeTruncate(emojiString, 6).length).toBeGreaterThanOrEqual(6)
  })

  it('adds suffix when truncating', () => {
    expect(safeTruncate('hello world', 5, '...')).toBe('hello...')
  })
})
