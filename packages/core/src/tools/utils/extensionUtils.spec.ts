import { RumConfiguration } from '@datadog/browser-rum-core'
import { display } from '../display'
import { checkForAllowedTrackingOrigins, WarnDoesNotHaveAllowedTrackingOrigin, WarnNotAllowedTrackingOrigin } from './extensionUtils'
import { containsExtensionUrl, EXTENSION_PREFIXES, isUnsupportedExtensionEnvironment } from './extensionUtils'

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
  
    it('should warn if allowedTrackingUrls is not provided', () => {
      const config = {
        applicationId: 'xxx',
        clientToken: 'xxx',
      } as unknown as RumConfiguration
  
      const windowLocation = 'https://example.com'
      const errorStack = 'Error: at chrome-extension://abcdefg/content.js:10:15'
  
      checkForAllowedTrackingOrigins(config, windowLocation, errorStack)
  
      expect(displayWarnSpy).toHaveBeenCalledWith(WarnDoesNotHaveAllowedTrackingOrigin)
      expect(displayWarnSpy).toHaveBeenCalledTimes(1)
    })

    it('should warn if window location is not in allowedTrackingOrigin', () => {
        const config = {
            applicationId: 'xxx',
            clientToken: 'xxx',
            allowedTrackingOrigin: ['chrome-extension://onknnkkjabakplhdagapdhegichdcphj/*'],
          } as unknown as RumConfiguration

        const windowLocation = 'https://example.com'
        const errorStack = 'Error: at chrome-extension://abcdefg/content.js:10:15'

        checkForAllowedTrackingOrigins(config, windowLocation, errorStack)

        expect(displayWarnSpy).toHaveBeenCalledWith(WarnNotAllowedTrackingOrigin)
    })

    it('should not warn if window location is in allowedTrackingOrigin', () => {
        const config = {
            applicationId: 'xxx',
            clientToken: 'xxx',
            allowedTrackingOrigin: ['chrome-extension://onknnkkjabakplhdagapdhegichdcphj/*'],
          } as unknown as RumConfiguration

        const windowLocation = 'chrome-extension://onknnkkjabakplhdagapdhegichdcphj/content.js'
        const errorStack = 'Error: at chrome-extension://onknnkkjabakplhdagapdhegichdcphj/content.js:10:15'

        checkForAllowedTrackingOrigins(config, windowLocation, errorStack)

        expect(displayWarnSpy).not.toHaveBeenCalled()
    })

    it('should warn if allowedTrackingOrigin does not contain extension prefix', () => {
        const config = {
            applicationId: 'xxx',
            clientToken: 'xxx',
            allowedTrackingOrigin: ['https://example.com/*'],
          } as unknown as RumConfiguration

        const windowLocation = 'https://example.com'
        const errorStack = 'Error: at chrome-extension://abcdefg/content.js:10:15'

        checkForAllowedTrackingOrigins(config, windowLocation, errorStack)

        expect(displayWarnSpy).toHaveBeenCalledWith(WarnNotAllowedTrackingOrigin)
    })

    it('should not warn if not in extension environment', () => {
        const config = {
            applicationId: 'xxx',
            clientToken: 'xxx',
            allowedTrackingOrigin: ['https://example.com/*'],
          } as unknown as RumConfiguration

        const windowLocation = 'https://example.com'
        const errorStack = 'Error: at content.js:10:15'

        checkForAllowedTrackingOrigins(config, windowLocation, errorStack)

        expect(displayWarnSpy).not.toHaveBeenCalled()
    })
})