import {
  STACK_WITH_INIT_IN_EXTENSION,
  STACK_WITH_INIT_IN_EXTENSION_FIREFOX,
  STACK_WITH_INIT_IN_PAGE,
} from '../../../test'
import { containsExtensionUrl, EXTENSION_PREFIXES, isUnsupportedExtensionEnvironment } from './extensionUtils'

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
})
