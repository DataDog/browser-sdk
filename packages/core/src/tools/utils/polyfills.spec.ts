import { startsWith, arrayFrom, cssEscape, elementMatches } from './polyfills'

describe('polyfills', () => {
  describe('startWith', () => {
    it('should return true if the candidate does not start with the searched string', () => {
      expect(startsWith('foobar', 'foo')).toEqual(true)
    })

    it('should return false if the candidate does not start with the searched string', () => {
      expect(startsWith('barfoo', 'foo')).toEqual(false)
    })
  })

  describe('arrayFrom', () => {
    it('should return an array from a Set', () => {
      const set = new Set()
      set.add('foo')

      expect(arrayFrom(set)).toEqual(['foo'])
    })

    it('should return an array from a array like object', () => {
      const div = document.createElement('div')
      div.classList.add('foo')

      expect(arrayFrom(div.classList)).toEqual(['foo'])
    })
  })

  describe('cssEscape', () => {
    it('should escape a string', () => {
      expect(cssEscape('.foo#bar')).toEqual('\\.foo\\#bar')
      expect(cssEscape('()[]{}')).toEqual('\\(\\)\\[\\]\\{\\}')
      expect(cssEscape('--a')).toEqual('--a')
      expect(cssEscape('\0')).toEqual('\ufffd')
    })
  })

  describe('elementMatches', () => {
    it('should return true if the element matches the selector', () => {
      const element = document.createElement('div')
      element.classList.add('foo')
      expect(elementMatches(element, '.foo')).toEqual(true)
    })

    it('should return false if the element does not match the selector', () => {
      const element = document.createElement('div')
      element.classList.add('bar')
      expect(elementMatches(element, '.foo')).toEqual(false)
    })
  })
})
