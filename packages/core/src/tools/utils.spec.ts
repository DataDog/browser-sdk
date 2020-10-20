import {
  combine,
  deepClone,
  findCommaSeparatedValue,
  jsonStringify,
  performDraw,
  round,
  safeTruncate,
  throttle,
  toSnakeCase,
  withSnakeCaseKeys,
} from './utils'

describe('utils', () => {
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
      // tslint:disable-next-line: no-null-keyword
      expect(combine({ a: {} }, { a: null as any })).toEqual({ a: null })
    })

    it('should ignore null arguments', () => {
      // tslint:disable-next-line: no-null-keyword
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
    it('should return a result deeply equal to the source', () => {
      const clonedValue = deepClone({ a: 1 })
      expect(clonedValue).toEqual({ a: 1 })
    })

    it('should return a different reference', () => {
      const value = { a: 1 }
      const clonedValue = deepClone(value)
      expect(clonedValue).not.toBe(value)
    })

    it('should return different references for objects sub values', () => {
      const value = { a: { b: 1 } }
      const clonedValue = deepClone(value)
      expect(clonedValue.a).not.toBe(value.a)
    })

    it('should return different references for arrays items', () => {
      const value = { a: [1] }
      const clonedValue = deepClone(value)
      expect(clonedValue.a).not.toBe(value.a)
    })
  })

  describe('throttle', () => {
    let spy: jasmine.Spy
    let throttled: () => void
    let cancel: () => void

    beforeEach(() => {
      jasmine.clock().install()
      jasmine.clock().mockDate()
      spy = jasmine.createSpy()
    })

    afterEach(() => {
      jasmine.clock().uninstall()
    })

    describe('when {leading: false, trailing:false}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2, { leading: false, trailing: false }).throttled
      })

      it('should not call throttled function', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)
        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(0)
      })

      it('should not called throttled function after the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(0)
      })

      it('should not called throttled function performed after the wait period', () => {
        throttled()
        jasmine.clock().tick(2)
        throttled()
        jasmine.clock().tick(2)
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
        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should dismiss calls made during the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        jasmine.clock().tick(2)
        throttled()
        jasmine.clock().tick(2)
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
        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should dismiss calls made during the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(2)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(2)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        jasmine.clock().tick(2)
        throttled()
        jasmine.clock().tick(2)
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
        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should postpone calls made during the wait period to after the period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(2)

        throttled()
        expect(spy).toHaveBeenCalledTimes(3)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(3)

        jasmine.clock().tick(1)
        expect(spy).toHaveBeenCalledTimes(3)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        jasmine.clock().tick(2)
        throttled()
        jasmine.clock().tick(2)
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

        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should allow future calls', () => {
        cancel()
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)
        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('format', () => {
    it('should format a string to snake case', () => {
      expect(toSnakeCase('camelCaseWord')).toEqual('camel_case_word')
      expect(toSnakeCase('PascalCase')).toEqual('pascal_case')
      expect(toSnakeCase('kebab-case')).toEqual('kebab_case')
    })

    it('should format object keys in snake case', () => {
      expect(
        withSnakeCaseKeys({
          camelCase: 1,
          nestedKey: { 'kebab-case': 'helloWorld', array: [{ camelCase: 1 }, { camelCase: 2 }] },
          // tslint:disable-next-line: no-null-keyword
          nullValue: null,
        })
      ).toEqual({
        camel_case: 1,
        nested_key: { kebab_case: 'helloWorld', array: [{ camel_case: 1 }, { camel_case: 2 }] },
        // tslint:disable-next-line: no-null-keyword
        null_value: null,
      })
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
      // tslint:disable-next-line:no-null-keyword
      expect(jsonStringify(null)).toEqual('null')
      expect(jsonStringify(1)).toEqual('1')
      expect(jsonStringify(true)).toEqual('true')
    })

    it('should not crash on serialization error', () => {
      const circularReference: any = { otherData: 123 }
      ;(circularReference as any).myself = circularReference

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
