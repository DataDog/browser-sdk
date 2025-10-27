import { getCustomOrDefaultViewName } from './getCustomOrDefaultViewName'

describe('getCustomOrDefaultViewName', () => {
  describe('when customViewName is provided', () => {
    it('should return the custom view name when it is a non-empty string', () => {
      expect(getCustomOrDefaultViewName('Custom View Name', '/user/123')).toBe('Custom View Name')
    })

    it('should return the default view name when it is an empty string', () => {
      expect(getCustomOrDefaultViewName('', '/user/123')).toBe('/user/?')
    })

    it('should return the custom view name for various URL paths', () => {
      expect(getCustomOrDefaultViewName('Home Page', '/')).toBe('Home Page')
      expect(getCustomOrDefaultViewName('User Profile', '/user/342')).toBe('User Profile')
      expect(getCustomOrDefaultViewName('API Endpoint', '/v1/user/3A2/profile')).toBe('API Endpoint')
    })
  })

  describe('when customViewName is undefined', () => {
    it('should fall back to default view name for empty path', () => {
      expect(getCustomOrDefaultViewName(undefined, '')).toBe('/')
    })

    it('should fall back to default view name for simple path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/user/342')).toBe('/user/?')
    })

    it('should fall back to default view name for alphanumeric path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/user/3A2')).toBe('/user/?')
    })

    it('should fall back to default view name for versioned path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/v1/user/3A2')).toBe('/v1/user/?')
    })

    it('should fall back to default view name for complex path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/v1/user/3A2/profile/2A3')).toBe('/v1/user/?/profile/?')
    })

    it('should fall back to default view name for UUID path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/v1/user/dc893c65-a46d-4f63-a7be-e119b97b1b32/profile/2A3')).toBe(
        '/v1/user/?/profile/?'
      )
    })
  })

  describe('edge cases', () => {
    it('should handle null customViewName (treated as undefined)', () => {
      expect(getCustomOrDefaultViewName(null as any, '/user/123')).toBe('/user/?')
    })

    it('should handle customViewName with special characters', () => {
      expect(getCustomOrDefaultViewName('Special & Characters!', '/user/123')).toBe('Special & Characters!')
    })

    it('should handle very long custom view names', () => {
      const longName = 'A'.repeat(1000)
      expect(getCustomOrDefaultViewName(longName, '/user/123')).toBe(longName)
    })

    it('should handle customViewName that matches the default pattern', () => {
      expect(getCustomOrDefaultViewName('/user/?', '/user/123')).toBe('/user/?')
    })
  })
})
