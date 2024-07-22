import { display } from '../display'
import { createNewEvent } from '../../../test'
import { sanitize } from './sanitize'

describe('sanitize', () => {
  it('should deep clone an object', () => {
    const obj = { a: 1, b: { c: 42 } }
    const clone = sanitize(obj)

    expect(clone).toEqual(obj)
    expect(clone).not.toBe(obj)
  })

  it('should survive an undefined input', () => {
    const obj = undefined
    expect(sanitize(obj)).toBe(undefined)
  })

  describe('simple types handling', () => {
    it('should handle numbers', () => {
      expect(sanitize(42)).toBe(42)
    })

    it('should handle strings', () => {
      expect(sanitize('test')).toBe('test')
    })

    it('should handle functions', () => {
      function testFunction() {
        return true
      }
      expect(sanitize(testFunction)).toBe('[Function] testFunction')
    })

    it('should handle bigint', () => {
      const bigIntFunction: (val: number) => any = (window as any).BigInt
      if (typeof bigIntFunction === 'function') {
        const bigint = bigIntFunction(2)
        expect(sanitize(bigint)).toEqual('[BigInt] 2')
      } else {
        pending('BigInt is not supported on this browser')
      }
    })

    it('shoud handle symbols', () => {
      const symbolFunction: (description: string) => any = (window as any).Symbol
      if (typeof symbolFunction === 'function') {
        const symbol = symbolFunction('description')
        expect(sanitize(symbol)).toEqual('[Symbol] description')
      } else {
        pending('Symbol is not supported on this browser')
      }
    })
  })

  describe('objects handling', () => {
    it('should serialize a Date as a string', () => {
      const date = new Date('2022-12-12')
      expect(sanitize(date)).toBe('2022-12-12T00:00:00.000Z')
    })

    it('should not traverse instrumented DOM nodes', () => {
      const node = document.createElement('div')
      ;(node as any).__hiddenProp = { value: 42 }

      expect(sanitize(node)).toBe('[HTMLDivElement]')
    })

    it('should serialize events', () => {
      const event = createNewEvent('click')

      expect(sanitize(event)).toEqual({
        isTrusted: false,
      })
    })

    it('should serialize errors as JSON.stringify does', () => {
      // Explicitely keep the previous behavior to avoid breaking changes in 4.x
      // Browsers have different behaviors:
      // IE11 adds a description field
      // Safari IOS12 adds parts of the stack
      const error = new Error('My Error')
      expect(sanitize(error)).toEqual({ ...error })
    })

    it('should keep additional properties from errors', () => {
      // JSON.stringify does not serialize message/name/stack from an Error, but
      // will serialize all other additional properties
      const error = new Error('My Error')
      ;(error as any).additionalProperty = { inner: 'test' }
      expect(sanitize(error)).toEqual({ ...error })
    })

    it('should serialize objects like maps as a string', () => {
      const map = new Map([
        ['a', 13],
        ['b', 37],
      ])
      expect(sanitize(map)).toBe('[Map]')
    })

    it('should survive when toStringTag throws', () => {
      class CannotSerialize {
        get [Symbol.toStringTag]() {
          throw Error('Cannot serialize')
        }
      }
      const cannotSerialize = new CannotSerialize()

      expect(sanitize(cannotSerialize)).toEqual('[Unserializable]')
    })

    it('should handle objects with properties including null or undefined', () => {
      const obj = { a: null, b: undefined }
      expect(sanitize(obj)).toEqual({ a: null, b: undefined })
    })
  })

  describe('arrays handling', () => {
    // JSON.stringify ignores properties on arrays - We replicate the behavior
    it('should ignore non-numerical properties on arrays', () => {
      const arr = [1, 2, 3, 4]
      ;(arr as any)['test'] = 'test'

      expect(sanitize(arr)).toEqual([1, 2, 3, 4])
    })

    it('should handle arrays containing null or undefined', () => {
      const arr = [null, undefined]
      expect(sanitize(arr)).toEqual([null, undefined])
    })
  })

  describe('circular references handling', () => {
    it('should remove circular references', () => {
      const obj: any = { a: 42 }
      obj.self = obj

      expect(sanitize(obj)).toEqual({ a: 42, self: '[Reference seen at $]' })
    })

    it('should remove deep circular references', () => {
      const obj: any = {}
      obj.toto = { inner: obj }

      expect(sanitize(obj)).toEqual({ toto: { inner: '[Reference seen at $]' } })
    })

    it('should remove circular references between two branches in a tree', () => {
      const a: any = {}
      const b: any = {}
      a.link = b
      b.link = a
      const obj = { a, b }

      expect(sanitize(obj)).toEqual({ a: { link: '[Reference seen at $.b]' }, b: { link: '[Reference seen at $.a]' } })
    })

    it('should replace already visited objects with a json path', () => {
      const inner = [1]
      const obj = { a: inner, b: inner }

      expect(sanitize(obj)).toEqual({ a: [1], b: '[Reference seen at $.a]' })
    })

    it('should create an understandable path for visited objects in arrays', () => {
      const inner = { a: 42 }
      const arr = [inner, inner]

      expect(sanitize(arr)).toEqual([{ a: 42 }, '[Reference seen at $.0]'])
    })
  })

  describe('toJson functions handling', () => {
    it('should use toJSON functions if available on root object', () => {
      const toJSON = jasmine.createSpy('toJSON', () => 'Specific').and.callThrough()
      const obj = { a: 1, b: 2, toJSON }

      expect(sanitize(obj)).toEqual('Specific')
      expect(toJSON).toHaveBeenCalledTimes(1)
    })

    it('should use toJSON functions if available on nested objects', () => {
      const toJSON = jasmine.createSpy('toJSON', () => ({ d: 4 })).and.callThrough()
      const obj = { a: 1, b: 2, c: { a: 3, toJSON } }

      expect(sanitize(obj)).toEqual({ a: 1, b: 2, c: { d: 4 } })
      expect(toJSON).toHaveBeenCalledTimes(1)
    })

    it('should switch to the proper container type after applying toJSON', () => {
      const obj = { a: 42, toJSON: () => [42] }
      expect(sanitize(obj)).toEqual([42])
    })

    it('should not use toJSON methods added to arrays and objects prototypes', () => {
      const toJSONArray = jasmine.createSpy('toJSONArray', () => 'Array').and.callThrough()
      const toJSONObject = jasmine.createSpy('toJSONObject', () => 'Object').and.callThrough()
      ;(Array.prototype as any).toJSON = toJSONArray
      ;(Object.prototype as any).toJSON = toJSONObject

      const arr = [{ a: 1, b: 2 }]
      expect(sanitize(arr)).toEqual([{ a: 1, b: 2 }])
      expect(toJSONArray).toHaveBeenCalledTimes(0)
      expect(toJSONObject).toHaveBeenCalledTimes(0)
      delete (Array.prototype as any).toJSON
      delete (Object.prototype as any).toJSON
    })

    it('should survive a faulty toJSON', () => {
      const faulty = () => {
        throw new Error('')
      }
      const obj = { b: 42, toJSON: faulty }

      // Since toJSON throws, sanitize falls back to serialize property by property
      expect(sanitize(obj)).toEqual({ b: 42, toJSON: '[Function] faulty' })
    })
  })

  describe('maxSize verification', () => {
    it('should return nothing if a simple type is over max size ', () => {
      const displaySpy = spyOn(display, 'warn')
      const str = 'A not so long string...'

      expect(sanitize(str, 5)).toBe(undefined)
      expect(displaySpy).toHaveBeenCalled()
    })

    it('should stop cloning if an object container type reaches max size', () => {
      const displaySpy = spyOn(display, 'warn')
      const obj = { a: 'abc', b: 'def', c: 'ghi' } // Length of 31 after JSON.stringify
      const sanitized = sanitize(obj, 21)
      expect(sanitized).toEqual({ a: 'abc', b: 'def' }) // Length of 21 after JSON.stringify
      expect(displaySpy).toHaveBeenCalled()
    })

    it('should stop cloning if an array container type reaches max size', () => {
      const displaySpy = spyOn(display, 'warn')
      const obj = [1, 2, 3, 4] // Length of 9 after JSON.stringify
      const sanitized = sanitize(obj, 5)
      expect(sanitized).toEqual([1, 2]) // Length of 5 after JSON.stringify
      expect(displaySpy).toHaveBeenCalled()
    })

    it('should count size properly when array contains undefined values', () => {
      // This is a special case: JSON.stringify([undefined]) => '[null]'
      const displaySpy = spyOn(display, 'warn')
      const arr = [undefined, undefined] // Length of 11 after JSON.stringify
      const sanitized = sanitize(arr, 10)
      expect(sanitized).toEqual([undefined])
      expect(displaySpy).toHaveBeenCalled()
    })

    it('should count size properly when an object contains properties with undefined values', () => {
      const displaySpy = spyOn(display, 'warn')
      const obj = { a: undefined, b: 42 } // Length of 8 after JSON.stringify
      const sanitized = sanitize(obj, 8)
      expect(sanitized).toEqual({ a: undefined, b: 42 })
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })
})
