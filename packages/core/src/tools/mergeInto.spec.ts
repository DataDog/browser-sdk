import { deepClone, mergeInto, combine } from './mergeInto'

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
