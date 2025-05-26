import { display } from '../tools/display'
import {
  isAllowedTrackingOrigins,
  WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN,
  WARN_NOT_ALLOWED_TRACKING_ORIGIN,
} from './allowedTrackingOrigins'

const DEFAULT_CONFIG = {
  applicationId: 'xxx',
  clientToken: 'xxx',
  allowedTrackingOrigins: undefined as any,
}

describe('checkForAllowedTrackingOrigins', () => {
  let displayWarnSpy: jasmine.Spy

  beforeEach(() => {
    displayWarnSpy = spyOn(display, 'warn')
  })

  it('should not warn if not in extension environment', () => {
    isAllowedTrackingOrigins(DEFAULT_CONFIG, 'https://app.example.com')
    expect(displayWarnSpy).not.toHaveBeenCalled()
  })

  describe('when configuration has allowedTrackingOrigins and domain is allowed', () => {
    it('should not warn if window location matches exactly', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: ['https://app.example.com'],
        },
        'https://app.example.com'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
    })

    it('should not warn if window location matches regex pattern', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [/^https:\/\/.*\.example\.com$/],
        },
        'https://app.example.com'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
    })

    it('should not warn if window location matches predicate function', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [(origin: string) => origin.includes('example.com')],
        },
        'https://app.example.com'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
    })

    it('should handle multiple patterns', () => {
      isAllowedTrackingOrigins(
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
    })
  })

  describe('when configuration has allowedTrackingOrigins but domain is not allowed in extension context', () => {
    it('should warn when window location does not match any allowed pattern', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: ['https://different.com'],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayWarnSpy).toHaveBeenCalledWith(WARN_NOT_ALLOWED_TRACKING_ORIGIN)
    })

    it('should warn when window location does not match regex pattern', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [/^https:\/\/specific-[a-z]+\.com$/],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayWarnSpy).toHaveBeenCalledWith(WARN_NOT_ALLOWED_TRACKING_ORIGIN)
    })

    it('should warn when window location does not match predicate function', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [(origin: string) => origin.includes('specific-id')],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayWarnSpy).toHaveBeenCalledWith(WARN_NOT_ALLOWED_TRACKING_ORIGIN)
    })

    it('should warn when window location does not match any of multiple patterns', () => {
      isAllowedTrackingOrigins(
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
      expect(displayWarnSpy).toHaveBeenCalledWith(WARN_NOT_ALLOWED_TRACKING_ORIGIN)
    })
  })

  describe('when configuration does not have allowedTrackingOrigins', () => {
    it('should warn when in extension environment and allowedTrackingOrigins is undefined', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: undefined,
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayWarnSpy).toHaveBeenCalledWith(WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN)
    })

    it('should warn when in extension environment and allowedTrackingOrigins is an empty array', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: [],
        },
        'https://example.com',
        'Error: at chrome-extension://abcdefghijklmno/content.js:10:15'
      )
      expect(displayWarnSpy).toHaveBeenCalledWith(WARN_NOT_ALLOWED_TRACKING_ORIGIN)
    })

    it('should not warn when not in extension environment and allowedTrackingOrigins is undefined', () => {
      isAllowedTrackingOrigins(
        {
          ...DEFAULT_CONFIG,
          allowedTrackingOrigins: undefined,
        },
        'https://example.com',
        'Error: at https://example.com/script.js:10:15'
      )
      expect(displayWarnSpy).not.toHaveBeenCalled()
    })
  })
})
