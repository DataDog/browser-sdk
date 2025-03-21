import { encodedContextCache, encodeToUtf8Base64, getEncodedContext } from './encodedContext'

describe('encodeToUtf8Base64', () => {
  it('should encode non-ascii to base64 in utf8', () => {
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa
    const encoded = encodeToUtf8Base64('a Ā 𐀀 文 🦄')
    expect(encoded).toBe('YSDEgCDwkICAIOaWhyDwn6aE')
  })
})

describe('encodedContextCache', () => {
  encodedContextCache.set('text', 'encoded')
  it('should return undefined when input is empty or undefined', () => {
    const btoaSpy = spyOn(window, 'btoa').and.callThrough()

    expect(getEncodedContext(undefined)).toBeUndefined()
    expect(getEncodedContext('')).toBeUndefined()
    expect(btoaSpy).not.toHaveBeenCalled()
  })

  it('should return undefined if cache key is not a string', () => {
    const btoaSpy = spyOn(window, 'btoa').and.callThrough()

    expect(getEncodedContext(42 as any)).toBeUndefined()
    expect(btoaSpy).not.toHaveBeenCalled()
  })

  it('should use cache when context is the same', () => {
    const btoaSpy = spyOn(window, 'btoa').and.callThrough()

    getEncodedContext('text')
    expect(btoaSpy).not.toHaveBeenCalled()
  })

  it('should update cache when context is different', () => {
    const btoaSpy = spyOn(window, 'btoa').and.callThrough()

    getEncodedContext('text2')
    expect(btoaSpy).toHaveBeenCalled()
  })
})
