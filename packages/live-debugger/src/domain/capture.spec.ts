import { capture, captureFields } from './capture'

describe('capture', () => {
  const defaultOpts = {
    maxReferenceDepth: 3,
    maxCollectionSize: 100,
    maxFieldCount: 20,
    maxLength: 255,
  }

  describe('primitive types', () => {
    it('should capture null', () => {
      const result = capture(null, defaultOpts)
      expect(result).toEqual({ type: 'null', isNull: true })
    })

    it('should capture undefined', () => {
      const result = capture(undefined, defaultOpts)
      expect(result).toEqual({ type: 'undefined' })
    })

    it('should capture boolean', () => {
      expect(capture(true, defaultOpts)).toEqual({ type: 'boolean', value: 'true' })
      expect(capture(false, defaultOpts)).toEqual({ type: 'boolean', value: 'false' })
    })

    it('should capture number', () => {
      expect(capture(42, defaultOpts)).toEqual({ type: 'number', value: '42' })
      expect(capture(3.14, defaultOpts)).toEqual({ type: 'number', value: '3.14' })
      expect(capture(NaN, defaultOpts)).toEqual({ type: 'number', value: 'NaN' })
      expect(capture(Infinity, defaultOpts)).toEqual({ type: 'number', value: 'Infinity' })
    })

    it('should capture string', () => {
      const result = capture('hello', defaultOpts)
      expect(result).toEqual({ type: 'string', value: 'hello' })
    })

    it('should capture bigint', () => {
      const result = capture(BigInt(123), defaultOpts)
      expect(result).toEqual({ type: 'bigint', value: '123' })
    })

    it('should capture symbol', () => {
      const sym = Symbol('test')
      const result = capture(sym, defaultOpts)
      expect(result).toEqual({ type: 'symbol', value: 'test' })
    })

    it('should capture symbol without description', () => {
      const sym = Symbol()
      const result = capture(sym, defaultOpts)
      expect(result).toEqual({ type: 'symbol', value: '' })
    })
  })

  describe('string truncation', () => {
    it('should truncate long strings', () => {
      const longString = 'a'.repeat(300)
      const result = capture(longString, { ...defaultOpts, maxLength: 10 })

      expect(result).toEqual({
        type: 'string',
        value: 'aaaaaaaaaa',
        truncated: true,
        size: 300,
      })
    })

    it('should not truncate strings under maxLength', () => {
      const result = capture('short', { ...defaultOpts, maxLength: 10 })
      expect(result).toEqual({ type: 'string', value: 'short' })
    })
  })

  describe('built-in objects', () => {
    it('should capture Date', () => {
      const date = new Date('2024-01-01T00:00:00.000Z')
      const result = capture(date, defaultOpts)
      expect(result).toEqual({ type: 'Date', value: '2024-01-01T00:00:00.000Z' })
    })

    it('should capture RegExp', () => {
      const regex = /test/gi
      const result = capture(regex, defaultOpts)
      expect(result).toEqual({ type: 'RegExp', value: '/test/gi' })
    })

    it('should capture Error', () => {
      const error = new Error('test error')
      const result = capture(error, defaultOpts) as any

      expect(result).toEqual({
        type: 'Error',
        fields: {
          message: { type: 'string', value: 'test error' },
          name: { type: 'string', value: 'Error' },
          stack: { type: 'string', value: jasmine.any(String), truncated: true, size: error.stack!.length },
        },
      })
    })

    it('should capture custom Error types', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }
      const error = new CustomError('custom error')
      const result = capture(error, defaultOpts) as any

      expect(result.type).toBe('CustomError')
      expect(result.fields.name).toEqual({ type: 'string', value: 'CustomError' })
    })

    it('should capture Error with cause', () => {
      const cause = new Error('cause error')
      // @ts-expect-error - cause is not a valid argument for Error constructor
      const error = new Error('main error', { cause })
      const result = capture(error, defaultOpts) as any

      expect(result.fields.cause).toEqual({
        type: 'Error',
        fields: {
          message: { type: 'string', value: 'cause error' },
          name: { type: 'string', value: 'Error' },
          stack: { type: 'string', value: jasmine.any(String), truncated: true, size: cause.stack!.length },
        },
      })
    })

    it('should capture Promise', () => {
      const promise = Promise.resolve(42)
      const result = capture(promise, defaultOpts)
      expect(result).toEqual({ type: 'Promise', notCapturedReason: 'Promise state cannot be inspected' })
    })
  })

  describe('arrays', () => {
    it('should capture array', () => {
      const arr = [1, 'two', true]
      const result = capture(arr, defaultOpts) as any

      expect(result.type).toBe('Array')
      expect(result.elements).toEqual([
        { type: 'number', value: '1' },
        { type: 'string', value: 'two' },
        { type: 'boolean', value: 'true' },
      ])
    })

    it('should truncate large arrays', () => {
      const arr = Array(200).fill(1)
      const result = capture(arr, { ...defaultOpts, maxCollectionSize: 3 }) as any

      expect(result.type).toBe('Array')
      expect(result.elements.length).toBe(3)
      expect(result.notCapturedReason).toBe('collectionSize')
      expect(result.size).toBe(200)
    })

    it('should handle nested arrays', () => {
      const arr = [
        [1, 2],
        [3, 4],
      ]
      const result = capture(arr, defaultOpts) as any

      expect(result.type).toBe('Array')
      expect(result.elements[0].type).toBe('Array')
      expect(result.elements[0].elements).toEqual([
        { type: 'number', value: '1' },
        { type: 'number', value: '2' },
      ])
    })
  })

  describe('Map and Set', () => {
    it('should capture Map', () => {
      const map = new Map<string, any>([
        ['key1', 'value1'],
        ['key2', 42],
      ])
      const result = capture(map, defaultOpts) as any

      expect(result.type).toBe('Map')
      expect(result.entries).toEqual([
        [
          { type: 'string', value: 'key1' },
          { type: 'string', value: 'value1' },
        ],
        [
          { type: 'string', value: 'key2' },
          { type: 'number', value: '42' },
        ],
      ])
    })

    it('should truncate large Maps', () => {
      const map = new Map()
      for (let i = 0; i < 200; i++) {
        map.set(`key${i}`, i)
      }
      const result = capture(map, { ...defaultOpts, maxCollectionSize: 3 }) as any

      expect(result.entries.length).toBe(3)
      expect(result.notCapturedReason).toBe('collectionSize')
      expect(result.size).toBe(200)
    })

    it('should capture Set', () => {
      const set = new Set([1, 'two', true])
      const result = capture(set, defaultOpts) as any

      expect(result.type).toBe('Set')
      expect(result.elements).toEqual([
        { type: 'number', value: '1' },
        { type: 'string', value: 'two' },
        { type: 'boolean', value: 'true' },
      ])
    })

    it('should truncate large Sets', () => {
      const set = new Set()
      for (let i = 0; i < 200; i++) {
        set.add(i)
      }
      const result = capture(set, { ...defaultOpts, maxCollectionSize: 3 }) as any

      expect(result.elements.length).toBe(3)
      expect(result.notCapturedReason).toBe('collectionSize')
      expect(result.size).toBe(200)
    })

    it('should handle WeakMap', () => {
      const weakMap = new WeakMap()
      const result = capture(weakMap, defaultOpts)
      expect(result).toEqual({ type: 'WeakMap', notCapturedReason: 'WeakMap contents cannot be enumerated' })
    })

    it('should handle WeakSet', () => {
      const weakSet = new WeakSet()
      const result = capture(weakSet, defaultOpts)
      expect(result).toEqual({ type: 'WeakSet', notCapturedReason: 'WeakSet contents cannot be enumerated' })
    })
  })

  describe('objects', () => {
    it('should capture plain object', () => {
      const obj = { a: 1, b: 'two' }
      const result = capture(obj, defaultOpts) as any

      expect(result.type).toBe('Object')
      expect(result.fields.a).toEqual({ type: 'number', value: '1' })
      expect(result.fields.b).toEqual({ type: 'string', value: 'two' })
    })

    it('should capture nested objects', () => {
      const obj = { outer: { inner: 'value' } }
      const result = capture(obj, defaultOpts) as any

      expect(result.fields.outer.type).toBe('Object')
      expect(result.fields.outer.fields.inner).toEqual({ type: 'string', value: 'value' })
    })

    it('should respect maxReferenceDepth', () => {
      const obj = { level1: { level2: { level3: { level4: 'deep' } } } }
      const result = capture(obj, { ...defaultOpts, maxReferenceDepth: 2 }) as any

      expect(result.fields.level1.fields.level2.notCapturedReason).toBe('depth')
    })

    it('should truncate objects with many fields', () => {
      const obj: any = {}
      for (let i = 0; i < 30; i++) {
        obj[`field${i}`] = i
      }
      const result = capture(obj, { ...defaultOpts, maxFieldCount: 5 }) as any

      expect(Object.keys(result.fields).length).toBe(5)
      expect(result.notCapturedReason).toBe('fieldCount')
      expect(result.size).toBe(30)
    })

    it('should handle objects with symbol keys', () => {
      const sym = Symbol('test')
      const obj = { [sym]: 'value' }
      const result = capture(obj, defaultOpts) as any

      expect(result.fields.test).toEqual({ type: 'string', value: 'value' })
    })

    it('should escape dots in field names', () => {
      const obj = { 'field.with.dots': 'value' }
      const result = capture(obj, defaultOpts) as any

      expect(result.fields.field_with_dots).toEqual({ type: 'string', value: 'value' })
    })

    it('should handle getters that throw', () => {
      const obj = {
        get throwing() {
          throw new Error('getter error')
        },
      }
      const result = capture(obj, defaultOpts) as any

      expect(result.fields.throwing).toEqual({
        type: 'undefined',
        notCapturedReason: 'Error accessing property',
      })
    })

    it('should capture custom class instances', () => {
      class MyClass {
        public field = 'value'
      }
      const instance = new MyClass()
      const result = capture(instance, defaultOpts) as any

      expect(result.type).toBe('MyClass')
      expect(result.fields.field).toEqual({ type: 'string', value: 'value' })
    })
  })

  describe('functions', () => {
    it('should capture function', () => {
      function myFunc() {} // eslint-disable-line @typescript-eslint/no-empty-function
      const result = capture(myFunc, defaultOpts) as any

      expect(result.type).toBe('Function')
    })

    it('should capture class as class', () => {
      class MyClass {}
      const result = capture(MyClass, defaultOpts)

      expect(result.type).toBe('class MyClass')
    })

    it('should capture anonymous class', () => {
      const AnonymousClass = class {}
      const result = capture(AnonymousClass, defaultOpts)

      expect(result.type).toBe('class')
    })

    it('should respect depth for functions', () => {
      function myFunc() {} // eslint-disable-line @typescript-eslint/no-empty-function
      const result = capture(myFunc, { ...defaultOpts, maxReferenceDepth: 0 })

      expect(result).toEqual({ type: 'Function', notCapturedReason: 'depth' })
    })
  })

  describe('binary data', () => {
    it('should capture ArrayBuffer', () => {
      const buffer = new ArrayBuffer(16)
      const result = capture(buffer, defaultOpts)

      expect(result).toEqual({
        type: 'ArrayBuffer',
        value: '[ArrayBuffer(16)]',
      })
    })

    it('should capture SharedArrayBuffer', () => {
      if (typeof SharedArrayBuffer === 'undefined') {
        // Skip test if SharedArrayBuffer is not available
        return
      }
      const buffer = new SharedArrayBuffer(16)
      const result = capture(buffer, defaultOpts)

      expect(result).toEqual({
        type: 'SharedArrayBuffer',
        value: '[SharedArrayBuffer(16)]',
      })
    })

    it('should capture DataView', () => {
      const buffer = new ArrayBuffer(16)
      const view = new DataView(buffer, 4, 8)
      const result = capture(view, defaultOpts) as any

      expect(result.type).toBe('DataView')
      expect(result.fields.byteLength).toEqual({ type: 'number', value: '8' })
      expect(result.fields.byteOffset).toEqual({ type: 'number', value: '4' })
      expect(result.fields.buffer).toEqual({ type: 'ArrayBuffer', value: '[ArrayBuffer(16)]' })
    })

    it('should capture Uint8Array', () => {
      const arr = new Uint8Array([1, 2, 3])
      const result = capture(arr, defaultOpts) as any

      expect(result.type).toBe('Uint8Array')
      expect(result.elements).toEqual([
        { type: 'number', value: '1' },
        { type: 'number', value: '2' },
        { type: 'number', value: '3' },
      ])
      expect(result.fields.byteLength).toEqual({ type: 'number', value: '3' })
      expect(result.fields.length).toEqual({ type: 'number', value: '3' })
    })

    it('should truncate large TypedArrays', () => {
      const arr = new Uint8Array(200)
      const result = capture(arr, { ...defaultOpts, maxCollectionSize: 3 }) as any

      expect(result.elements.length).toBe(3)
      expect(result.notCapturedReason).toBe('collectionSize')
      expect(result.size).toBe(200)
    })
  })

  describe('circular references', () => {
    it('should handle circular references by respecting depth limit', () => {
      const obj: any = { name: 'root' }
      obj.self = obj
      const result = capture(obj, { ...defaultOpts, maxReferenceDepth: 1 }) as any

      expect(result.fields.name).toEqual({ type: 'string', value: 'root' })
      expect(result.fields.self.notCapturedReason).toBe('depth')
    })
  })
})

describe('captureFields', () => {
  const defaultOpts = {
    maxReferenceDepth: 3,
    maxCollectionSize: 100,
    maxFieldCount: 20,
    maxLength: 255,
  }

  it('should return fields directly without wrapper', () => {
    const obj = { a: 1, b: 'hello', c: true }
    const result = captureFields(obj, defaultOpts)

    // Should be Record<string, CapturedValue>, not CapturedValue
    expect(result).toEqual({
      a: { type: 'number', value: '1' },
      b: { type: 'string', value: 'hello' },
      c: { type: 'boolean', value: 'true' },
    })

    // Should NOT have type/fields wrapper
    expect((result as any).type).toBeUndefined()
    expect((result as any).fields).toBeUndefined()
  })

  it('should capture nested objects in fields', () => {
    const obj = {
      name: 'test',
      nested: { value: 42 },
    }
    const result = captureFields(obj, defaultOpts)

    expect(result).toEqual({
      name: { type: 'string', value: 'test' },
      nested: {
        type: 'Object',
        fields: {
          value: { type: 'number', value: '42' },
        },
      },
    })
  })

  it('should respect maxFieldCount', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 }
    const result = captureFields(obj, { ...defaultOpts, maxFieldCount: 3 })

    const keys = Object.keys(result)
    expect(keys.length).toBe(3)
  })

  it('should respect maxReferenceDepth', () => {
    const obj = {
      level1: {
        level2: {
          level3: 'deep',
        },
      },
    }
    const result = captureFields(obj, { ...defaultOpts, maxReferenceDepth: 2 })

    expect(result.level1).toEqual({
      type: 'Object',
      fields: {
        level2: {
          type: 'Object',
          notCapturedReason: 'depth',
        },
      },
    })
  })

  it('should handle properties with dots in names', () => {
    const obj = { 'some.property': 'value' }
    const result = captureFields(obj, defaultOpts)

    expect(result['some_property']).toEqual({ type: 'string', value: 'value' })
  })

  it('should handle symbol keys', () => {
    const sym = Symbol('test')
    const obj = { [sym]: 'symbolValue' }
    const result = captureFields(obj, defaultOpts)

    expect(result.test).toEqual({ type: 'string', value: 'symbolValue' })
  })

  it('should handle property access errors', () => {
    const obj = {}
    Object.defineProperty(obj, 'throwing', {
      get() {
        throw new Error('Access denied')
      },
      enumerable: true,
    })
    const result = captureFields(obj, defaultOpts)

    expect(result.throwing).toEqual({
      type: 'undefined',
      notCapturedReason: 'Error accessing property',
    })
  })
})
