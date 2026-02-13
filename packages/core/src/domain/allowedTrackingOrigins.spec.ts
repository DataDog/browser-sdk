import { vi, type Mock } from 'vitest'
import { replaceMockable, STACK_WITH_INIT_IN_EXTENSION, STACK_WITH_INIT_IN_PAGE } from '../../test'
import { display } from '../tools/display'
import {
  isAllowedTrackingOrigins,
  ERROR_NOT_ALLOWED_TRACKING_ORIGIN,
  ERROR_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN,
} from './allowedTrackingOrigins'

const DEFAULT_CONFIG = {
  applicationId: 'xxx',
  clientToken: 'xxx',
  allowedTrackingOrigins: undefined as any,
}

describe('checkForAllowedTrackingOrigins', () => {
  let displayErrorSpy: Mock

  function mockOrigin(origin: string) {
    replaceMockable(location, { origin } as Location)
  }

  beforeEach(() => {
    displayErrorSpy = vi.spyOn(display, 'error')
  })

  it('should not warn if not in extension environment', () => {
    mockOrigin('https://app.example.com')
    const result = isAllowedTrackingOrigins(DEFAULT_CONFIG, STACK_WITH_INIT_IN_PAGE)
    expect(displayErrorSpy).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  describe('when configuration has allowedTrackingOrigins and origin is allowed', () => {
    it('should not warn if origin matches exactly', () => {
      mockOrigin('https://app.example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: ['https://app.example.com'],
        },
        STACK_WITH_INIT_IN_PAGE
      )
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should not warn if origin matches regex pattern', () => {
      mockOrigin('https://app.example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [/^https:\/\/.*\.example\.com$/],
        },
        STACK_WITH_INIT_IN_PAGE
      )
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should not warn if origin matches predicate function', () => {
      mockOrigin('https://app.example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [(origin: string) => origin.includes('example.com')],
        },
        STACK_WITH_INIT_IN_PAGE
      )
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should handle multiple patterns', () => {
      mockOrigin('https://app.example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [
            'https://exact-match.com',
            /^https:\/\/.*\.example\.com$/,
            (origin: string) => origin.startsWith('https://app.'),
          ],
        },
        STACK_WITH_INIT_IN_PAGE
      )
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('when configuration has allowedTrackingOrigins but origin is not allowed in extension context', () => {
    it('should error when origin does not match any allowed pattern', () => {
      mockOrigin('https://example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: ['https://different.com'],
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when origin does not match regex pattern', () => {
      mockOrigin('https://example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [/^https:\/\/specific-[a-z]+\.com$/],
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when origin does not match predicate function', () => {
      mockOrigin('https://example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [(origin: string) => origin.includes('specific-id')],
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when origin does not match any of multiple patterns', () => {
      mockOrigin('https://example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [
            'https://specific.com',
            /^https:\/\/.*\.specific\.com$/,
            (origin: string) => origin.includes('specific-id'),
          ],
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when origin is a partial match', () => {
      mockOrigin('https://example.com.extra.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: ['https://example.com'],
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should not error when in extension and origin matches', () => {
      mockOrigin('chrome-extension://abcdefghijklmno')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [/^chrome-extension:\/\//],
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('when configuration does not have allowedTrackingOrigins', () => {
    it('should log an error when in extension environment and allowedTrackingOrigins is undefined', () => {
      mockOrigin('https://example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: undefined,
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when in extension environment and allowedTrackingOrigins is an empty array', () => {
      mockOrigin('https://example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [],
        },
        STACK_WITH_INIT_IN_EXTENSION
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should not warn when not in extension environment and allowedTrackingOrigins is undefined', () => {
      mockOrigin('https://example.com')
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: undefined,
        },
        STACK_WITH_INIT_IN_PAGE
      )
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })
})
