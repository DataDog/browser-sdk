import { startsWith, arrayFrom } from './polyfills'

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
})
