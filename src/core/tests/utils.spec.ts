import { cache, jsonStringify, round, throttle, toSnakeCase, withSnakeCaseKeys } from '../utils'

describe('utils', () => {
  it('should throttle only once by given period', () => {
    jasmine.clock().install()
    jasmine.clock().mockDate()
    const spy = jasmine.createSpy()

    const throttled = throttle(spy, 1)

    throttled()
    expect(spy).toHaveBeenCalledTimes(1)

    throttled()
    throttled()
    expect(spy).toHaveBeenCalledTimes(1)

    jasmine.clock().tick(2)
    throttled()
    throttled()
    expect(spy).toHaveBeenCalledTimes(2)

    jasmine.clock().uninstall()
  })

  it('should cache function result for a given duration', () => {
    jasmine.clock().install()
    let result: number | undefined = 1
    const spy = jasmine.createSpy().and.callFake(() => result)

    const cached = cache(spy, 1)

    expect(cached()).toEqual(result)
    expect(spy).toHaveBeenCalledTimes(1)

    expect(cached()).toEqual(result)
    expect(cached()).toEqual(result)
    expect(spy).toHaveBeenCalledTimes(1)

    jasmine.clock().tick(1)
    result = undefined
    expect(cached()).toEqual(result)
    expect(cached()).toEqual(result)
    expect(spy).toHaveBeenCalledTimes(2)

    jasmine.clock().uninstall()
  })

  it('should round', () => {
    expect(round(10.12591, 0)).toEqual(10)
    expect(round(10.12591, 1)).toEqual(10.1)
    expect(round(10.12591, 2)).toEqual(10.13)
    expect(round(10.12591, 3)).toEqual(10.126)
  })

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
})
