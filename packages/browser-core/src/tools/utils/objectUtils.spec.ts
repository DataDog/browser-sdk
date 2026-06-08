import { getConstructorName } from './objectUtils'

describe('objectUtils', () => {
  describe('getConstructorName', () => {
    it('should return the constructor name of an object', () => {
      class Custom {}

      expect(getConstructorName({})).toBe('Object')
      expect(getConstructorName([])).toBe('Array')
      expect(getConstructorName(new Custom())).toBe('Custom')
      expect(getConstructorName(new Error())).toBe('Error')
    })

    it('should return undefined when there is no usable constructor name', () => {
      expect(getConstructorName(Object.create(null))).toBeUndefined()
      expect(getConstructorName(null)).toBeUndefined()
      expect(getConstructorName(undefined)).toBeUndefined()
    })

    it('should return undefined when constructor access throws', () => {
      const value = {}
      Object.defineProperty(value, 'constructor', {
        get() {
          throw new Error('Cannot access constructor')
        },
      })

      expect(getConstructorName(value)).toBeUndefined()
    })

    it('should return undefined when the constructor name is not a non-empty string', () => {
      expect(getConstructorName({ constructor: { name: '' } })).toBeUndefined()
      expect(getConstructorName({ constructor: { name: 42 } })).toBeUndefined()
    })
  })
})
