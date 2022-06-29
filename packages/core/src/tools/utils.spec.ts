import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import {
  combine,
  cssEscape,
  deepClone,
  elementMatches,
  findCommaSeparatedValue,
  getType,
  jsonStringify,
  mergeInto,
  performDraw,
  round,
  safeTruncate,
  startsWith,
  throttle,
} from './utils'

describe('utils', () => {
  describe('throttle', () => {
    let spy: jasmine.Spy
    let throttled: () => void
    let cancel: () => void
    let clock: Clock

    beforeEach(() => {
      clock = mockClock()
      spy = jasmine.createSpy()
    })

    afterEach(() => {
      clock.cleanup()
    })

    describe('when {leading: false, trailing:false}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2, { leading: false, trailing: false }).throttled
      })

      it('should not call throttled function', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(0)
      })

      it('should not called throttled function after the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)
      })

      it('should not called throttled function performed after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(0)
      })
    })

    describe('when {leading: false, trailing:true}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2, { leading: false }).throttled
      })

      it('should call throttled function after the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should dismiss calls made during the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(2)
      })
    })

    describe('when {leading: true, trailing:false}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2, { trailing: false }).throttled
      })

      it('should call throttled function immediately', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should dismiss calls made during the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(2)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(2)
      })
    })

    describe('when {leading: true, trailing:true}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2).throttled
      })

      it('should call throttled function immediately', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should postpone calls made during the wait period to after the period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)

        throttled()
        expect(spy).toHaveBeenCalledTimes(3)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(3)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(3)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(2)
      })
    })

    describe('cancel', () => {
      beforeEach(() => {
        const result = throttle(spy, 2)
        cancel = result.cancel
        throttled = result.throttled
      })

      it('should abort pending execution', () => {
        throttled()
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        cancel()

        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should allow future calls', () => {
        cancel()
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })
    })

    it('passes last parameters as arguments', () => {
      const throttled = throttle(spy, 2).throttled
      throttled(1)
      throttled(2)
      throttled(3)
      clock.tick(2)
      expect(spy.calls.allArgs()).toEqual([[1], [3]])
    })
  })

  describe('jsonStringify', () => {
    it('should jsonStringify an object with toJSON directly defined', () => {
      const value = [{ 1: 'a' }]
      const expectedJson = JSON.stringify(value)

      expect(jsonStringify(value)).toEqual(expectedJson)
      ;(value as any).toJSON = () => '42'
      expect(jsonStringify(value)).toEqual(expectedJson)
      expect(JSON.stringify(value)).toEqual('"42"')
    })

    it('should jsonStringify an object with toJSON defined on prototype', () => {
      const value = [{ 2: 'b' }]
      const expectedJson = JSON.stringify(value)

      expect(jsonStringify(value)).toEqual(expectedJson)
      ;(Array.prototype as any).toJSON = () => '42'
      expect(jsonStringify(value)).toEqual(expectedJson)
      expect(JSON.stringify(value)).toEqual('"42"')

      delete (Array.prototype as any).toJSON
    })

    it('should jsonStringify edge cases', () => {
      expect(jsonStringify(undefined)).toEqual(undefined)
      expect(jsonStringify(null)).toEqual('null')
      expect(jsonStringify(1)).toEqual('1')
      expect(jsonStringify(true)).toEqual('true')
    })

    it('should not crash on serialization error', () => {
      const circularReference: any = { otherData: 123 }
      circularReference.myself = circularReference

      expect(jsonStringify(circularReference)).toEqual('<error: unable to serialize object>')
    })
  })

  describe('safeTruncate', () => {
    it('should truncate a string', () => {
      const truncated = safeTruncate('1234😎7890', 6)
      expect(truncated.length).toBe(6)
      expect(truncated).toBe('1234😎')
    })

    it('should not break a surrogate characters pair', () => {
      const truncated = safeTruncate('12345😎890', 6)
      expect(truncated.length).toBe(7)
      expect(truncated).toBe('12345😎')
    })

    it('should add the suffix when the string is truncated', () => {
      const truncated = safeTruncate('12345😎890', 6, '...')
      expect(truncated).toBe('12345😎...')
    })

    it('should not add the suffix when the string is not truncated', () => {
      const truncated = safeTruncate('1234😎', 5, '...')
      expect(truncated).toBe('1234😎')
    })
  })

  it('should perform a draw', () => {
    let random = 0
    spyOn(Math, 'random').and.callFake(() => random)

    expect(performDraw(0)).toBe(false)
    expect(performDraw(100)).toEqual(true)

    random = 1
    expect(performDraw(100)).toEqual(true)

    random = 0.0001
    expect(performDraw(0.01)).toEqual(true)

    random = 0.1
    expect(performDraw(0.01)).toEqual(false)
  })

  it('should round', () => {
    expect(round(10.12591, 0)).toEqual(10)
    expect(round(10.12591, 1)).toEqual(10.1)
    expect(round(10.12591, 2)).toEqual(10.13)
    expect(round(10.12591, 3)).toEqual(10.126)
  })
})

describe('findCommaSeparatedValue', () => {
  it('returns the value from a comma separated hash', () => {
    expect(findCommaSeparatedValue('foo=a;bar=b', 'foo')).toBe('a')
    expect(findCommaSeparatedValue('foo=a;bar=b', 'bar')).toBe('b')
  })

  it('returns undefined if the value is not found', () => {
    expect(findCommaSeparatedValue('foo=a;bar=b', 'baz')).toBe(undefined)
  })
})

describe('getType', () => {
  it('should return "null" for null value', () => {
    expect(getType(null)).toEqual('null')
    expect(getType(undefined)).not.toEqual('null')
  })

  it('should return "array" for array value', () => {
    expect(getType([])).toEqual('array')
    expect(getType([1, 2, 3])).toEqual('array')
    expect(getType([1, 2, [3, 4, 5]])).toEqual('array')
  })

  it('should return result of typeof operator for other types', () => {
    expect(getType({})).toEqual('object')
    expect(getType(() => null)).toEqual('function')
    expect(getType('test')).toEqual('string')
    expect(getType(1)).toEqual('number')
    expect(getType(false)).toEqual('boolean')
    expect(getType(new Date())).toEqual('object')
  })
})

describe('mergeInto', () => {
  describe('source is not an object or array', () => {
    it('should ignore undefined sources', () => {
      const destination = {}
      expect(mergeInto(destination, undefined)).toBe(destination)
    })

    it('should ignore undefined destination', () => {
      expect(mergeInto(undefined, 1)).toBe(1)
    })

    it('should ignore destinations with a different type', () => {
      expect(mergeInto({}, 1)).toBe(1)
    })
  })

  describe('source is an array', () => {
    it('should create a new array if destination is undefined', () => {
      const source = [1]
      const result = mergeInto(undefined, source)
      expect(result).not.toBe(source)
      expect(result).toEqual(source)
    })

    it('should return the copy of source if the destination is not an array', () => {
      const source = [1]
      expect(mergeInto({}, source)).toEqual(source)
    })

    it('should mutate and return destination if it is an array', () => {
      const destination = ['destination']
      const source = ['source']
      const result = mergeInto(destination, source)
      expect(result).toBe(destination)
      expect(result).toEqual(source)
    })
  })

  describe('source is an object', () => {
    it('should create a new object if destination is undefined', () => {
      const source = {}
      const result = mergeInto(undefined, source)
      expect(result).not.toBe(source)
      expect(result).toEqual(source)
    })

    it('should return the copy of source if the destination is not an object', () => {
      const source = { a: 1 }
      expect(mergeInto([], source)).toEqual(source)
    })

    it('should mutate and return destination if it is an object', () => {
      const destination = {}
      const source = { a: 'b' }
      const result = mergeInto(destination, source)
      expect(result).toBe(destination as any)
      expect(result).toEqual(source)
    })
  })
})

describe('combine', () => {
  it('should deeply add and replace keys', () => {
    const sourceA = { a: { b: 'toBeReplaced', c: 'source a' } }
    const sourceB = { a: { b: 'replaced', d: 'source b' } }
    expect(combine(sourceA, sourceB)).toEqual({ a: { b: 'replaced', c: 'source a', d: 'source b' } })
  })

  it('should not replace with undefined', () => {
    expect(combine({ a: 1 }, { a: undefined as number | undefined })).toEqual({ a: 1 })
  })

  it('should replace a sub-value with null', () => {
    expect(combine({ a: {} }, { a: null as any })).toEqual({ a: null })
  })

  it('should ignore null arguments', () => {
    expect(combine({ a: 1 }, null)).toEqual({ a: 1 })
  })

  it('should merge arrays', () => {
    const sourceA = [{ a: 'source a' }, 'extraString'] as any
    const sourceB = [{ b: 'source b' }] as any
    expect(combine(sourceA, sourceB)).toEqual([{ a: 'source a', b: 'source b' }, 'extraString'])
  })

  it('should merge multiple objects', () => {
    expect(combine({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('should not keep references on objects', () => {
    const source = { a: { b: 1 } }
    const result = combine({}, source)
    expect(result.a).not.toBe(source.a)
  })

  it('should not keep references on arrays', () => {
    const source = { a: [1] }
    const result = combine({}, source)
    expect(result.a).not.toBe(source.a)
  })
})

describe('deepClone', () => {
  it('should pass-through primitive values', () => {
    expect(deepClone('test')).toBe('test')
    expect(deepClone(true)).toBe(true)
    expect(deepClone(false)).toBe(false)
    expect(deepClone(null)).toBe(null)
    expect(deepClone(undefined)).toBe(undefined)
    expect(deepClone(1)).toBe(1)
    expect(deepClone(NaN)).toBeNaN()
    expect(deepClone(Infinity)).toBe(Infinity)
    expect(deepClone(-Infinity)).toBe(-Infinity)
  })

  it('should pass-through functions', () => {
    const fn = () => null
    expect(deepClone(fn)).toBe(fn)
  })

  it('should pass-through classes', () => {
    class Foo {}
    // typeof class is 'function' so it will behave the same as for function case
    expect(deepClone(Foo)).toBe(Foo)
  })

  it('should clone array recursively', () => {
    const source = [1, undefined, null, [4, 5, 6]]
    const clone = deepClone(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    source.push(7)
    ;(source[3] as any[]).push(8)

    expect(clone[4]).toBeUndefined()
    expect((clone[3] as any[])[3]).toBeUndefined()
  })

  it('should clone object recursively', () => {
    const source = { foo: 'bar', baz: { arr: [1, 2], fn: () => undefined } }
    const clone = deepClone(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    source.baz.arr.push(1)
    ;(source.baz as any).added = 'test'

    expect(clone.baz.arr).toEqual([1, 2])
    expect((clone.baz as any).added).toBeUndefined()
  })

  it('should clone regexp', () => {
    const source = { reg: /test/gi }
    const clone = deepClone(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone.reg).not.toBe(source.reg)

    expect(clone.reg.ignoreCase).toBe(true)
    expect(clone.reg.global).toBe(true)
    expect(clone.reg.multiline).toBe(false)
  })

  it('should clone date', () => {
    const source = [1, new Date('2012-12-12')] as const
    const clone = deepClone(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone[1]).not.toBe(source[1])

    const originalTime = source[1].getTime()
    source[1].setTime(originalTime + 100)
    expect(clone[1].getTime()).toEqual(originalTime)
  })

  it('should remove circular references', () => {
    const a: Record<string, any> = { foo: 'bar', ref: null }
    const b: Record<string, any> = { baz: 'bar', ref: null }
    // create circular reference
    a.ref = b
    b.ref = a

    const clonedA = deepClone(a)
    const clonedB = deepClone(b)

    expect(clonedA).not.toEqual(a)
    expect(clonedA.ref.ref).toBeUndefined()

    expect(clonedB).not.toEqual(b)
    expect(clonedB.ref.ref).toBeUndefined()
  })
})

describe('startWith', () => {
  it('should return true if the candidate does not start with the searched string', () => {
    expect(startsWith('foobar', 'foo')).toEqual(true)
  })

  it('should return false if the candidate does not start with the searched string', () => {
    expect(startsWith('barfoo', 'foo')).toEqual(false)
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
