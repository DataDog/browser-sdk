import { getDefaultViewName } from './getDefaultViewName'

// Replicating the tests from SimpleUrlGroupingProcessorTest.java
describe('getDefaultViewName', () => {
  describe('url grouping', () => {
    it('should handle empty path', () => {
      expect(getDefaultViewName('')).toBe('/')
    })

    it('should handle simple URL path with numeric ID', () => {
      expect(getDefaultViewName('/user/342')).toBe('/user/?')
    })

    it('should handle URL path with alphanumeric ID', () => {
      expect(getDefaultViewName('/user/3A2')).toBe('/user/?')
    })

    it('should handle versioned URL path with alphanumeric ID', () => {
      expect(getDefaultViewName('/v1/user/3A2')).toBe('/v1/user/?')
    })

    it('should handle versioned URL path with alphanumeric ID and additional segments', () => {
      expect(getDefaultViewName('/v1/user/3A2/profile')).toBe('/v1/user/?/profile')
    })

    it('should handle multiple alphanumeric segments', () => {
      expect(getDefaultViewName('/v1/user/3A2/profile/2A3')).toBe('/v1/user/?/profile/?')
    })

    it('should handle UUID and alphanumeric segments', () => {
      expect(getDefaultViewName('/v1/user/dc893c65-a46d-4f63-a7be-e119b97b1b32/profile/2A3')).toBe(
        '/v1/user/?/profile/?'
      )
    })

    it('should not touch text-only segments', () => {
      expect(getDefaultViewName('/v1/user/explorer')).toBe('/v1/user/explorer')
    })
  })
})
