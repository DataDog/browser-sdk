import { isIE } from './browserDetection'
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
      if (isIE()) {
        // IE does not provide access to function name
        expect(sanitize(testFunction)).toBe('[Function] unknown')
      } else {
        expect(sanitize(testFunction)).toBe('[Function] testFunction')
      }
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
      let event: CustomEvent
      if (isIE()) {
        event = document.createEvent('CustomEvent')
        event.initCustomEvent('MyEvent', false, false, {})
      } else {
        event = new CustomEvent('MyEvent')
      }

      expect(sanitize(event)).toEqual({
        type: 'MyEvent',
        isTrusted: false,
      })
    })

    it('should serialize objects like maps as a string', () => {
      const map = new Map([
        ['a', 13],
        ['b', 37],
      ])
      if (isIE()) {
        // IE does not distinguish maps, weakmaps, sets... from generic objects
        expect(sanitize(map)).toEqual({})
      } else {
        expect(sanitize(map)).toBe('[Map]')
      }
    })
  })

  describe('arrays handling', () => {
    // JSON.stringify ignores properties on arrays - We replicate the behavior
    it('should ignore non-numerical properties on arrays', () => {
      const arr = [1, 2, 3, 4]
      ;(arr as any)['test'] = 'test'

      expect(sanitize(arr)).toEqual([1, 2, 3, 4])
    })
  })

  describe('circular references handling', () => {
    it('should remove circular references', () => {
      const obj: any = { a: 42 }
      obj.self = obj

      expect(sanitize(obj)).toEqual({ a: 42, self: '[Circular Ref]' })
    })

    it('should replace already visited objects with a json path', () => {
      const inner = [1]
      const obj = { a: inner, b: inner }

      expect(sanitize(obj)).toEqual({ a: [1], b: '[Visited] $.a' })
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
      if (isIE()) {
        // IE does not provide access to function name
        expect(sanitize(obj)).toEqual({ b: 42, toJSON: '[Function] unknown' })
      } else {
        expect(sanitize(obj)).toEqual({ b: 42, toJSON: '[Function] faulty' })
      }
    })
  })

  describe('maxSize verification', () => {
    it('should return nothing if a simple type is over max size ', () => {
      const str = 'A not so long string...'

      expect(sanitize(str, 5)).toBe(undefined)
    })

    it('should stop cloning if an object container type reaches max size', () => {
      const obj = { a: 'abc', b: 'def', c: 'ghi' } // Length of 31 after JSON.stringify
      const sanitized = sanitize(obj, 21)
      expect(sanitized).toEqual({ a: 'abc', b: 'def' }) // Length of 21 after JSON.stringify
    })

    it('should stop cloning if an array container type reaches max size', () => {
      const obj = [1, 2, 3, 4] // Length of 9 after JSON.stringify
      const sanitized = sanitize(obj, 5)
      expect(sanitized).toEqual([1, 2]) // Length of 5 after JSON.stringify
    })
  })
})
