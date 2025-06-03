import { display } from '../tools/display'
import {
  isAllowedTrackingOrigins,
  WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN,
  ERROR_NOT_ALLOWED_TRACKING_ORIGIN,
} from './allowedTrackingOrigins'

const DEFAULT_CONFIG = {
  applicationId: 'xxx',
  clientToken: 'xxx',
  allowedTrackingOrigins: undefined as any,
}

describe('checkForAllowedTrackingOrigins', () => {
  let displayWarnSpy: jasmine.Spy
  let displayErrorSpy: jasmine.Spy

  beforeEach(() => {
    displayWarnSpy = spyOn(display, 'warn')
    displayErrorSpy = spyOn(display, 'error')
  })

  it('should not warn if not in extension environment', () => {
    const result = isAllowedTrackingOrigins(DEFAULT_CONFIG, 'https://app.example.com')
    expect(displayWarnSpy).not.toHaveBeenCalled()
    expect(displayErrorSpy).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  describe('when configuration has allowedTrackingOrigins and origin is allowed', () => {
    it('should not warn if origin matches exactly', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: ['https://app.example.com'],
        },
        'https://app.example.com'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should not warn if origin matches regex pattern', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [/^https:\/\/.*\.example\.com$/],
        },
        'https://app.example.com'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should not warn if origin matches predicate function', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [(origin: string) => origin.includes('example.com')],
        },
        'https://app.example.com'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should handle multiple patterns', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [
            'https://exact-match.com',
            /^https:\/\/.*\.example\.com$/,
            (origin: string) => origin.startsWith('https://app.'),
          ],
        },
        'https://app.example.com'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('when configuration has allowedTrackingOrigins but origin is not allowed in extension context', () => {
    it('should error when origin does not match any allowed pattern', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: ['https://different.com'],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when origin does not match regex pattern', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [/^https:\/\/specific-[a-z]+\.com$/],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when origin does not match predicate function', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [(origin: string) => origin.includes('specific-id')],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should error when origin does not match any of multiple patterns', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [
            'https://specific.com',
            /^https:\/\/.*\.specific\.com$/,
            (origin: string) => origin.includes('specific-id'),
          ],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })
  })

  describe('when configuration does not have allowedTrackingOrigins', () => {
    it('should warn when in extension environment and allowedTrackingOrigins is undefined', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: undefined,
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayWarnSpy).toHaveBeenCalledWith(WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(true)
    })

    it('should error when in extension environment and allowedTrackingOrigins is an empty array', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayErrorSpy).toHaveBeenCalledWith(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
      expect(result).toBe(false)
    })

    it('should not warn when not in extension environment and allowedTrackingOrigins is undefined', () => {
      const result = isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: undefined,
        },
        'https://example.com',
        'Error: at https://example.com/script.js:10:15'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })
})
