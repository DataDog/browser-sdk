import { sanitizeUrl } from './sanitizeUrl'

describe('sanitizeUrl', () => {
  it('removes the query string', () => {
    expect(sanitizeUrl('https://example.com/path?token=secret')).toBe('https://example.com/path')
  })

  it('removes the fragment', () => {
    expect(sanitizeUrl('https://example.com/path#token=secret')).toBe('https://example.com/path')
  })

  it('removes both the query string and the fragment', () => {
    expect(sanitizeUrl('https://example.com/path?a=1#b=2')).toBe('https://example.com/path')
  })

  it('removes a query string nested in the fragment, as hash-based routers produce', () => {
    expect(sanitizeUrl('https://example.com/path#/route?token=secret')).toBe('https://example.com/path')
  })

  it('removes the query string and fragment even when they are empty', () => {
    expect(sanitizeUrl('https://example.com/path?#')).toBe('https://example.com/path')
  })

  it('keeps URLs without a query string or fragment intact', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path')
  })

  it('keeps the port', () => {
    expect(sanitizeUrl('http://example.com:8080/a/b?c=d')).toBe('http://example.com:8080/a/b')
  })

  it('falls back to the leading portion for unparseable URLs', () => {
    expect(sanitizeUrl('not a url?token=secret')).toBe('not a url')
    expect(sanitizeUrl('not a url#token=secret')).toBe('not a url')
  })
})
