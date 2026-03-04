import { isEqual, diffMerge } from './viewDiff'

describe('isEqual', () => {
  it('should return true for identical primitives', () => {
    expect(isEqual(1, 1)).toBe(true)
    expect(isEqual('a', 'a')).toBe(true)
    expect(isEqual(true, true)).toBe(true)
    expect(isEqual(null, null)).toBe(true)
    expect(isEqual(undefined, undefined)).toBe(true)
  })

  it('should return false for different primitives', () => {
    expect(isEqual(1, 2)).toBe(false)
    expect(isEqual('a', 'b')).toBe(false)
    expect(isEqual(true, false)).toBe(false)
    expect(isEqual(null, undefined)).toBe(false)
  })

  it('should return true for deeply equal objects', () => {
    expect(isEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true)
  })

  it('should return false for objects with different values', () => {
    expect(isEqual({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('should return false for objects with different keys', () => {
    expect(isEqual({ a: 1 }, { b: 1 })).toBe(false)
  })

  it('should return true for equal arrays', () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  })

  it('should return false for arrays with different lengths', () => {
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false)
  })

  it('should return false for arrays with different values', () => {
    expect(isEqual([1, 2, 3], [1, 2, 4])).toBe(false)
  })

  it('should return false when comparing array to non-array', () => {
    expect(isEqual([1], { 0: 1 })).toBe(false)
  })

  it('should return false for type mismatch', () => {
    expect(isEqual(1, '1')).toBe(false)
  })
})

describe('diffMerge', () => {
  it('should return undefined when there are no changes', () => {
    const result = diffMerge({ a: 1, b: 'x' }, { a: 1, b: 'x' })
    expect(result).toBeUndefined()
  })

  it('should return changed primitive fields', () => {
    const result = diffMerge({ a: 1, b: 2 }, { a: 1, b: 1 })
    expect(result).toEqual({ b: 2 })
  })

  it('should include new fields not present in lastSent', () => {
    const result = diffMerge({ a: 1, b: 2 }, { a: 1 })
    expect(result).toEqual({ b: 2 })
  })

  it('should set null for deleted keys', () => {
    const result = diffMerge({ a: 1 }, { a: 1, b: 2 })
    expect(result).toEqual({ b: null })
  })

  it('should recursively diff nested objects', () => {
    const result = diffMerge({ nested: { x: 1, y: 2 } }, { nested: { x: 1, y: 1 } })
    expect(result).toEqual({ nested: { y: 2 } })
  })

  it('should return undefined for unchanged nested objects', () => {
    const result = diffMerge({ nested: { x: 1 } }, { nested: { x: 1 } })
    expect(result).toBeUndefined()
  })

  it('should include new nested objects', () => {
    const result = diffMerge({ nested: { x: 1 } }, {})
    expect(result).toEqual({ nested: { x: 1 } })
  })

  describe('replaceKeys option', () => {
    it('should use full replace strategy for specified keys', () => {
      const result = diffMerge({ arr: [1, 2, 3] }, { arr: [1, 2] }, { replaceKeys: new Set(['arr']) })
      expect(result).toEqual({ arr: [1, 2, 3] })
    })

    it('should not include replace key if unchanged', () => {
      const result = diffMerge({ arr: [1, 2] }, { arr: [1, 2] }, { replaceKeys: new Set(['arr']) })
      expect(result).toBeUndefined()
    })
  })

  describe('appendKeys option', () => {
    it('should append only new trailing elements for array keys', () => {
      const result = diffMerge({ items: [1, 2, 3] }, { items: [1, 2] }, { appendKeys: new Set(['items']) })
      expect(result).toEqual({ items: [3] })
    })

    it('should include full array when it first appears', () => {
      const result = diffMerge({ items: [1, 2] }, {}, { appendKeys: new Set(['items']) })
      expect(result).toEqual({ items: [1, 2] })
    })

    it('should not include append key if array has not grown', () => {
      const result = diffMerge({ items: [1, 2] }, { items: [1, 2] }, { appendKeys: new Set(['items']) })
      expect(result).toBeUndefined()
    })
  })
})
