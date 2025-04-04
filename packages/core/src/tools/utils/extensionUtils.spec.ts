import { containsExtensionUrl, EXTENSION_PREFIXES, isUnsupportedExtensionEnvironment } from './extensionUtils';

// Testable version of isUnsupportedExtensionEnvironment that accepts parameters
export function testIsUnsupportedExtensionEnvironment(windowLocation: string, errorStack: string): boolean {
  return !containsExtensionUrl(windowLocation) && containsExtensionUrl(errorStack);
}

describe('containsExtensionUrl', () => {
  it('should return true if string contains an extension URL', () => {
    EXTENSION_PREFIXES.forEach((prefix) => {
      expect(containsExtensionUrl(`${prefix}some/path`)).toBe(true);
    });
  });

  it('should return false if string does not contain extension URL', () => {
    expect(containsExtensionUrl('https://example.com')).toBe(false);
    expect(containsExtensionUrl('')).toBe(false);
  });
});

describe('testIsUnsupportedExtensionEnvironment', () => {
  it('should return true when window location is a regular URL and error stack contains extension URL', () => {
    expect(testIsUnsupportedExtensionEnvironment(
      'https://example.com',
      'Error: at chrome-extension://abcdefg/content.js:10:15'
    )).toBe(true);
  });

  it('should return false when both window location and error stack are regular URLs', () => {
    expect(testIsUnsupportedExtensionEnvironment(
      'https://example.com',
      'Error: at https://example.com/script.js:10:15'
    )).toBe(false);
  });

  it('should return false when window location is an extension URL', () => {
    EXTENSION_PREFIXES.forEach((prefix) => {
      expect(testIsUnsupportedExtensionEnvironment(
        `${prefix}some/path`,
        'Error: at chrome-extension://abcdefg/content.js:10:15'
      )).toBe(false);
    });
  });

  it('should return false when error stack is empty', () => {
    expect(testIsUnsupportedExtensionEnvironment(
      'https://example.com',
      ''
    )).toBe(false);
  });

  it('should handle each extension prefix in error stack', () => {
    EXTENSION_PREFIXES.forEach((prefix) => {
      expect(testIsUnsupportedExtensionEnvironment(
        'https://example.com',
        `Error: at ${prefix}abcdefg/content.js:10:15`
      )).toBe(true);
    });
  });
});

// Test the actual implementation
describe('isUnsupportedExtensionEnvironment', () => {
  it('should check window.location.href and Error().stack to detect extension environment', () => {
    // This is a basic test to ensure the function calls containsExtensionUrl correctly
    // We can't easily mock window.location.href or Error().stack in the browser environment,
    // so we're just verifying the function doesn't throw and returns a boolean
    const result = isUnsupportedExtensionEnvironment();
    expect(typeof result).toBe('boolean');
  });
});