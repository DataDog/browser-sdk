import { combine, deepClone, toSnakeCase, withSnakeCaseKeys } from './context'

describe('context', () => {
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
})
