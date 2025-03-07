import { encodedContextCache, encodeToUtf8Base64, getEncodedContext } from './encodedContextCache'

describe('encodeToUtf8Base64', () => {
  it('should encode non-ascii to base64 in utf8', () => {
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa
    const encoded = encodeToUtf8Base64('a Ā 𐀀 文 🦄')
    expect(encoded).toBe('YSDEgCDwkICAIOaWhyDwn6aE')
  })
})

describe('encodedContextCache', () => {
  let encodeToUtf8Base64Spy: jasmine.Spy
  encodedContextCache['text'] = 'encoded'
  it('should return undefined when input is empty or undefined', () => {
    encodeToUtf8Base64Spy = jasmine.createSpy()
    expect(getEncodedContext(undefined, encodeToUtf8Base64Spy)).toBeUndefined()
    expect(getEncodedContext('', encodeToUtf8Base64Spy)).toBeUndefined()
    expect(encodeToUtf8Base64Spy).not.toHaveBeenCalled()
  })

  it('should return undefined if cache key is not a string', () => {
    encodeToUtf8Base64Spy = jasmine.createSpy()
    expect(getEncodedContext(42 as any, encodeToUtf8Base64Spy)).toBeUndefined()
    expect(encodeToUtf8Base64Spy).not.toHaveBeenCalled()
  })

  it('should use cache when context is the same', () => {
    encodeToUtf8Base64Spy = jasmine.createSpy()
    getEncodedContext('text', encodeToUtf8Base64Spy)
    expect(encodeToUtf8Base64Spy).not.toHaveBeenCalled()
  })

  it('should update cache when context is different', () => {
    encodeToUtf8Base64Spy = jasmine.createSpy()
    getEncodedContext('text2', encodeToUtf8Base64Spy)
    expect(encodeToUtf8Base64Spy).toHaveBeenCalled()
  })
})
