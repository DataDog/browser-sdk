import { display } from './display'
import { matchList } from './matchOption'

describe('matchList', () => {
  it('should match exact value', () => {
    const list = ['foo', 'bar']
    expect(matchList(list, 'foo')).toBe(true)
    expect(matchList(list, 'bar')).toBe(true)
    expect(matchList(list, 'qux')).toBe(false)
  })

  it('should match regexp', () => {
    const list = [/^foo/, /foo$/]
    expect(matchList(list, 'foobar')).toBe(true)
    expect(matchList(list, 'barfoo')).toBe(true)
    expect(matchList(list, 'barqux')).toBe(false)
  })

  it('should match function', () => {
    const list = [(value: string) => value === 'foo', (value: string) => value === 'bar']
    expect(matchList(list, 'foo')).toBe(true)
    expect(matchList(list, 'bar')).toBe(true)
    expect(matchList(list, 'qux')).toBe(false)
  })

  it('should compare strings using startsWith when enabling the option', () => {
    const list = ['http://my.domain.com']
    expect(matchList(list, 'http://my.domain.com/action', true)).toBe(true)
  })

  it('should catch error from provided function', () => {
    spyOn(display, 'error')
    const list = [
      (_: string) => {
        throw new Error('oops')
      },
    ]
    expect(matchList(list, 'foo')).toBe(false)
    expect(display.error).toHaveBeenCalled()
  })

  describe('with MatchMode', () => {
    describe('origin mode', () => {
      it('should extract origin from URL and match exactly', () => {
        const list = ['https://example.com']
        expect(matchList(list, 'https://example.com/path/to/page?query=value', 'origin')).toBe(true)
        expect(matchList(list, 'https://example.com', 'origin')).toBe(true)
        expect(matchList(list, 'https://other.com/path', 'origin')).toBe(false)
      })

      it('should handle URLs with ports', () => {
        const list = ['https://example.com:8080']
        expect(matchList(list, 'https://example.com:8080/api/data', 'origin')).toBe(true)
        expect(matchList(list, 'https://example.com/api/data', 'origin')).toBe(false)
      })

      it('should work with regex patterns against origins', () => {
        const list = [/^https:\/\/.*\.example\.com$/]
        expect(matchList(list, 'https://app.example.com/path', 'origin')).toBe(true)
        expect(matchList(list, 'https://api.example.com', 'origin')).toBe(true)
        expect(matchList(list, 'https://malicious.example.com.evil.com/path', 'origin')).toBe(false)
      })

      it('should work with function matchers against origins', () => {
        const list = [(origin: string) => origin.endsWith('.example.com')]
        expect(matchList(list, 'https://app.example.com/path', 'origin')).toBe(true)
        expect(matchList(list, 'https://other.com/path', 'origin')).toBe(false)
      })

      it('should handle invalid URLs gracefully', () => {
        const list = ['invalid-url']
        expect(matchList(list, 'invalid-url', 'origin')).toBe(true)
        expect(matchList(list, 'different-invalid', 'origin')).toBe(false)
      })
    })

    describe('url-start mode', () => {
      it('should match if URL starts with the option', () => {
        const list = ['https://example.com']
        expect(matchList(list, 'https://example.com/path', 'url-start')).toBe(true)
        expect(matchList(list, 'https://example.com', 'url-start')).toBe(true)
        expect(matchList(list, 'https://other.com', 'url-start')).toBe(false)
      })
    })

    describe('url mode', () => {
      it('should match entire URL exactly', () => {
        const list = ['https://example.com/specific/path']
        expect(matchList(list, 'https://example.com/specific/path', 'url')).toBe(true)
        expect(matchList(list, 'https://example.com/specific/path/subpath', 'url')).toBe(false)
        expect(matchList(list, 'https://example.com', 'url')).toBe(false)
      })
    })
  })

  describe('backward compatibility', () => {
    it('should maintain backward compatibility with useStartsWith=true', () => {
      const list = ['https://example.com']
      expect(matchList(list, 'https://example.com/path', true)).toBe(true)
      expect(matchList(list, 'https://example.com/path', 'url-start')).toBe(true)
    })

    it('should maintain backward compatibility with useStartsWith=false', () => {
      const list = ['https://example.com']
      expect(matchList(list, 'https://example.com', false)).toBe(true)
      expect(matchList(list, 'https://example.com/path', false)).toBe(false)
      expect(matchList(list, 'https://example.com', 'url')).toBe(true)
      expect(matchList(list, 'https://example.com/path', 'url')).toBe(false)
    })
  })
})
