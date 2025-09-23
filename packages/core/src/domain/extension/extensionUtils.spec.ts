import {
  STACK_WITH_INIT_IN_EXTENSION,
  STACK_WITH_INIT_IN_EXTENSION_FIREFOX,
  STACK_WITH_INIT_IN_PAGE,
} from '../../../test'
import {
  containsExtensionUrl,
  EXTENSION_PREFIXES,
  extractExtensionUrlFromStack,
  isUnsupportedExtensionEnvironment,
} from './extensionUtils'

describe('extensionUtils', () => {
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

  describe('isUnsupportedExtensionEnvironment', () => {
    it('should return true when window location is a regular URL and error stack init is in an extension', () => {
      expect(isUnsupportedExtensionEnvironment('https://example.com', STACK_WITH_INIT_IN_EXTENSION)).toBe(true)
    })

    it('should return false when both window location and error stack init are regular URLs', () => {
      expect(isUnsupportedExtensionEnvironment('https://example.com', STACK_WITH_INIT_IN_PAGE)).toBe(false)
    })

    it('should return false when error stack is empty', () => {
      expect(isUnsupportedExtensionEnvironment('https://example.com', '')).toBe(false)
    })

    it('should handle each extension prefix in firefox', () => {
      expect(isUnsupportedExtensionEnvironment('https://example.com', STACK_WITH_INIT_IN_EXTENSION_FIREFOX)).toBe(true)
    })

    it('should handle case when stack trace is undefined', () => {
      expect(isUnsupportedExtensionEnvironment('https://example.com')).toBe(false)
    })

    it('should handle extension stack trace', () => {
      expect(isUnsupportedExtensionEnvironment('https://example.com', STACK_WITH_INIT_IN_EXTENSION)).toBe(true)
    })
  })

  describe('extract init caller', () => {
    it('should extract extension URL from stack trace', () => {
      const stack = `Error
    at foo (<anonymous>:549:44)
    at bar (<anonymous>:701:91)
    at e.init (chrome-extension://abcd/content-script-main.js:1:1009)`
      expect(extractExtensionUrlFromStack(stack)).toBe('chrome-extension://abcd')
    })

    it('should return undefined when no extension URL found', () => {
      const stack = 'Error at https://example.com/script.js:10:15'
      expect(extractExtensionUrlFromStack(stack)).toBeUndefined()
    })
  })
})
