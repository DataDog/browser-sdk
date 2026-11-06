import { jsonStringify } from './jsonStringify'

describe('jsonStringify', () => {
  // Vitest sends messages from the page to its server, serialized with `JSON.stringify`: while
  // `Object.prototype` or `Array.prototype` has a `toJSON` method, they are garbled, which can stall
  // the test run. Only define one synchronously, for the time of the callback.
  function withPrototypeToJSON(prototype: object, callback: () => void) {
    ;(prototype as any).toJSON = () => '42'
    try {
      callback()
    } finally {
      delete (prototype as any).toJSON
    }
  }

  it('should jsonStringify a value with toJSON directly defined', () => {
    const value = { 1: 'a' }
    const expectedJson = JSON.stringify(value)

    expect(jsonStringify(value)).toEqual(expectedJson)
    ;(value as any).toJSON = () => '42'
    expect(jsonStringify(value)).toEqual(expectedJson)
    expect(JSON.stringify(value)).toEqual('"42"')
  })

  it('should jsonStringify a value with toJSON defined on its prototype', () => {
    const value = createSampleClassInstance()
    const expectedJson = JSON.stringify(value)

    expect(jsonStringify(value)).toEqual(expectedJson)
    Object.getPrototypeOf(value).toJSON = () => '42'
    expect(jsonStringify(value)).toEqual(expectedJson)
    expect(JSON.stringify(value)).toEqual('"42"')
  })

  it('should jsonStringify a value when toJSON is defined on Object prototype', () => {
    const value = createSampleClassInstance()
    const expectedJson = JSON.stringify(value)

    expect(jsonStringify(value)).toEqual(expectedJson)
    withPrototypeToJSON(Object.prototype, () => {
      expect(jsonStringify(value)).toEqual(expectedJson)
      expect(JSON.stringify(value)).toEqual('"42"')
    })
  })

  it('should jsonStringify a value when toJSON is defined on Array prototype', () => {
    const value = createSampleClassInstance([1])
    const expectedJson = JSON.stringify(value)

    expect(jsonStringify(value)).toEqual(expectedJson)
    withPrototypeToJSON(Array.prototype, () => {
      expect(jsonStringify(value)).toEqual(expectedJson)
      expect(JSON.stringify(value)).toEqual('{"value":"42"}')
    })
  })

  it('should not restore the toJSON method on the wrong prototype', () => {
    const value = [{ 1: 'a' }]
    withPrototypeToJSON(Object.prototype, () => {
      jsonStringify(value)
      expect(Object.prototype.hasOwnProperty.call(Array.prototype, 'toJSON')).toBe(false)
    })
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

  function createSampleClassInstance(value: any = 'value') {
    class Foo {
      value = value
    }
    return new Foo()
  }
})
