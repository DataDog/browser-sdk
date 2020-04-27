import { jsonStringify, performDraw, round, throttle, toSnakeCase, withSnakeCaseKeys } from '../src/utils'

describe('utils', () => {
  describe('throttle', () => {
    let spy: jasmine.Spy
    let throttled: () => void
    let stop: () => void

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

    describe('stop', () => {
      beforeEach(() => {
        const result = throttle(spy, 2)
        stop = result.stop
        throttled = result.throttled
      })

      it('should abort pending execution', () => {
        throttled()
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        stop()

        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should dismiss future calls', () => {
        stop()
        throttled()
        jasmine.clock().tick(2)
        expect(spy).toHaveBeenCalledTimes(0)
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
        })
      ).toEqual({
        camel_case: 1,
        nested_key: { kebab_case: 'helloWorld', array: [{ camel_case: 1 }, { camel_case: 2 }] },
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
