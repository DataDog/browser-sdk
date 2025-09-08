import {
  containsExtensionUrl,
  EXTENSION_PREFIXES,
  extractExtensionUrlFromStack,
  isUnsupportedExtensionEnvironment,
} from './extensionUtils'

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

  it('should handle case when stack trace is undefined', () => {
    expect(isUnsupportedExtensionEnvironment('https://example.com')).toBe(false)
  })

  it('should handle extension stack trace', () => {
    expect(
      isUnsupportedExtensionEnvironment('https://example.com', 'Error: at chrome-extension://abcdefg/content.js:10:15')
    ).toBe(true)
  })
})

describe('callsite-based detection (top caller frame)', () => {
  it('should return true when the top caller frame is an extension URL', () => {
    const stack =
      'Error\n    at monitor (https://cdn.datadoghq.com/sdk.js:1:1)\n    at e.init (chrome-extension://abcdefg/content.js:10:15)\n    at other (https://example.com/app.js:5:10)'

    expect(isUnsupportedExtensionEnvironment('https://example.com', stack)).toBe(true)
  })

  it('should return false when an extension URL exists deeper in the stack but the top caller frame is a regular URL', () => {
    const stack =
      'Error\n    at monitor (https://cdn.datadoghq.com/sdk.js:1:1)\n    at e.init (https://example.com/app.js:10:15)\n    at injected (chrome-extension://abcdefg/content.js:5:10)'

    expect(isUnsupportedExtensionEnvironment('https://example.com', stack)).toBe(false)
  })
})

describe('callsite via callMonitored wrapper', () => {
  it('should skip callMonitored and use the next frame as callsite', () => {
    const stack =
      'Error\n    at callMonitored (https://cdn.datadoghq.com/sdk.js:1:1)\n    at init (https://example.com/app.js:10:15)\n    at apply (chrome-extension://abcdefg/content.js:5:10)'

    expect(isUnsupportedExtensionEnvironment('https://example.com', stack)).toBe(false)
  })

  it('should detect extension when the next frame after callMonitored is extension URL', () => {
    const stack =
      'Error\n    at callMonitored (https://cdn.datadoghq.com/sdk.js:1:1)\n    at init (chrome-extension://abcdefg/content.js:10:15)\n    at other (https://example.com/app.js:5:10)'

    expect(isUnsupportedExtensionEnvironment('https://example.com', stack)).toBe(true)
  })
})

describe('extractExtensionUrlFromStack', () => {
  it('should extract extension URL from stack trace', () => {
    const stack = `Error
    at foo (<anonymous>:549:44)
    at bar (<anonymous>:701:91)
    at e.init (chrome-extension://boceobohkgenpcpogecpjlnmnfbdigda/content-script-main.js:1:1009)`
    expect(extractExtensionUrlFromStack(stack)).toBe('chrome-extension://boceobohkgenpcpogecpjlnmnfbdigda')
  })

  it('should return undefined when no extension URL found', () => {
    const stack = 'Error at https://example.com/script.js:10:15'
    expect(extractExtensionUrlFromStack(stack)).toBeUndefined()
  })
})
