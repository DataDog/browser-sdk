import { display } from '@datadog/browser-core'
import {
  checkForAllowedTrackingOrigins,
  containsExtensionUrl,
  EXTENSION_PREFIXES,
  isUnsupportedExtensionEnvironment,
} from './extensionUtils'

const DEFAULT_CONFIG = {
  applicationId: 'xxx',
  clientToken: 'xxx',
}

describe('containsExtensionUrl', () => {
  it('should return true if string contains an extension URL', () => {
    EXTENSION_PREFIXES.forEach((prefix) => {
      expect(containsExtensionUrl(`${prefix}some/path`)).toBe(true)
    })
  })

  it('should return false if string does not contain extension URL', () => {
    expect(containsExtensionUrl('https://example.com')).toBe(false)
    expect(containsExtensionUrl('')).toBe(false)
  })
})

describe('testIsUnsupportedExtensionEnvironment', () => {
  it('should return true when window location is a regular URL and error stack contains extension URL', () => {
    expect(
      isUnsupportedExtensionEnvironment('https://example.com', 'Error: at chrome-extension://abcdefg/content.js:10:15')
    ).toBe(true)
  })

  it('should return false when both window location and error stack are regular URLs', () => {
    expect(
      isUnsupportedExtensionEnvironment('https://example.com', 'Error: at https://example.com/script.js:10:15')
    ).toBe(false)
  })

  it('should return false when window location is an extension URL', () => {
    EXTENSION_PREFIXES.forEach((prefix) => {
      expect(
        isUnsupportedExtensionEnvironment(`${prefix}some/path`, 'Error: at chrome-extension://abcdefg/content.js:10:15')
      ).toBe(false)
    })
  })

  it('should return false when error stack is empty', () => {
    expect(isUnsupportedExtensionEnvironment('https://example.com', '')).toBe(false)
  })

  it('should handle each extension prefix in error stack', () => {
    EXTENSION_PREFIXES.forEach((prefix) => {
      expect(
        isUnsupportedExtensionEnvironment('https://example.com', `Error: at ${prefix}abcdefg/content.js:10:15`)
      ).toBe(true)
    })
  })

  it('should handle case when Error.stack is undefined', () => {
    const mockError = new Error()
    mockError.stack = undefined
    spyOn(window, 'Error').and.returnValue(mockError)

    expect(isUnsupportedExtensionEnvironment('https://example.com')).toBe(false)
  })

  it('should handle undefined parameters correctly', () => {
    const result = isUnsupportedExtensionEnvironment()
    expect(result).toBe(false)
  })

  it('should handle extension stack trace', () => {
    const mockError = new Error()
    mockError.stack = 'Error: at chrome-extension://abcdefg/content.js:10:15'
    spyOn(window, 'Error').and.returnValue(mockError)

    expect(isUnsupportedExtensionEnvironment('https://example.com')).toBe(true)
  })
})

describe('checkForAllowedTrackingOrigins', () => {
  let displayWarnSpy: jasmine.Spy

  beforeEach(() => {
    displayWarnSpy = spyOn(display, 'warn')
  })

  afterEach(() => {
    displayWarnSpy.calls.reset()
  })

  it('should not warn if not in extension environment', () => {
    checkForAllowedTrackingOrigins(DEFAULT_CONFIG, 'https://app.example.com')
    expect(displayWarnSpy).not.toHaveBeenCalled()
  })

  it('should not warn if extension origin matches exact string', () => {
    checkForAllowedTrackingOrigins(
      {
        ...DEFAULT_CONFIG,
        allowedTrackingOrigins: ['chrome-extension://abcdefghijklmno'],
      },
      'chrome-extension://abcdefghijklmno'
    )
    expect(displayWarnSpy).not.toHaveBeenCalled()
  })

  it('should not warn if extension origin matches regex pattern', () => {
    checkForAllowedTrackingOrigins(
      {
        ...DEFAULT_CONFIG,
        allowedTrackingOrigins: [/^chrome-extension:\/\/[a-f0-9-]+$/],
      },
      'chrome-extension://abcdef123456'
    )
    expect(displayWarnSpy).not.toHaveBeenCalled()
  })

  it('should not warn if extension origin matches predicate function', () => {
    checkForAllowedTrackingOrigins(
      {
        ...DEFAULT_CONFIG,
        allowedTrackingOrigins: [(origin: string) => origin.startsWith('chrome-extension://')],
      },
      'chrome-extension://abcdefghijklmno'
    )
    expect(displayWarnSpy).not.toHaveBeenCalled()
  })

  it('should handle multiple patterns', () => {
    checkForAllowedTrackingOrigins(
      {
        ...DEFAULT_CONFIG,
        allowedTrackingOrigins: [
          'chrome-extension://exact-match',
          /^chrome-extension:\/\/[a-f0-9-]+$/,
          (origin: string) => origin.startsWith('moz-extension://'),
        ],
      },
      'moz-extension://abcdefghijklmno'
    )
    expect(displayWarnSpy).not.toHaveBeenCalled()
  })
})
