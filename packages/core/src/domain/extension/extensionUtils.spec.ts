import { startsWithExtensionUrl, EXTENSION_PREFIXES, isUnsupportedExtensionEnvironment } from './extensionUtils'

describe('containsExtensionUrl', () => {
  it('should return true if string starts with an extension URL', () => {
    EXTENSION_PREFIXES.forEach((prefix) => {
      expect(startsWithExtensionUrl(`${prefix}some/path`)).toBe(true)
    })
  })

  it('should return false if string does not start with extension URL', () => {
    expect(startsWithExtensionUrl('https://example.com//chrome-extension://')).toBe(false)
    expect(startsWithExtensionUrl('')).toBe(false)
  })
})

describe('testIsUnsupportedExtensionEnvironment', () => {
  it('should return true when window location is a regular URL and error stack starts with extension URL', () => {
    expect(
      isUnsupportedExtensionEnvironment('https://example.com', 'Error: at chrome-extension://abcdefg/content.js:10:15')
    ).toBe(true)
  })

  it('should return false when both window location and error stack are regular URLs and does not start with extension URL', () => {
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

  it('should handle extension stack trace', () => {
    const mockError = new Error()
    mockError.stack = 'Error: at chrome-extension://abcdefg/content.js:10:15'
    spyOn(window, 'Error').and.returnValue(mockError)

    expect(isUnsupportedExtensionEnvironment('https://example.com')).toBe(true)
  })
})
