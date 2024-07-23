import { arrayFrom } from './polyfills'

describe('polyfills', () => {
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
