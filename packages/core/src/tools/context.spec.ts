import {
  combine,
  createCircularReferenceChecker,
  deepClone,
  mergeInto,
  toSnakeCase,
  withSnakeCaseKeys,
} from './context'

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

    it('should set cyclic references on objects to undefined', () => {
      const a: { [k: string]: any } = { foo: 1 }
      a.cyclicRef = a
      expect(deepClone(a)).toEqual({ foo: 1, cyclicRef: undefined })
    })

    it('should set cyclic references on arrays to undefined', () => {
      const a: any[] = [1]
      a.push(a)
      expect(deepClone(a)).toEqual([1, undefined])
    })
  })

  describe('mergeInto', () => {
    describe('source is not an object or array', () => {
      it('should ignore undefined sources', () => {
        const destination = {}
        expect(mergeInto(destination, undefined, createCircularReferenceChecker())).toBe(destination)
      })

      it('should ignore undefined destination', () => {
        expect(mergeInto(undefined, 1, createCircularReferenceChecker())).toBe(1)
      })

      it('should ignore destinations with a different type', () => {
        expect(mergeInto({}, 1, createCircularReferenceChecker())).toBe(1)
      })
    })

    describe('source is an array', () => {
      it('should create a new array if destination is undefined', () => {
        const source = [1]
        const result = mergeInto(undefined, source, createCircularReferenceChecker())
        expect(result).not.toBe(source)
        expect(result).toEqual(source)
      })

      it('should return the source if the destination is not an array', () => {
        const source = [1]
        expect(mergeInto({}, source, createCircularReferenceChecker())).toBe(source)
      })

      it('should mutate and return destination if it is an array', () => {
        const destination = ['destination']
        const source = ['source']
        const result = mergeInto(destination, source, createCircularReferenceChecker())
        expect(result).toBe(destination)
        expect(result).toEqual(source)
      })
    })

    describe('source is an object', () => {
      it('should create a new object if destination is undefined', () => {
        const source = {}
        const result = mergeInto(undefined, source, createCircularReferenceChecker())
        expect(result).not.toBe(source)
        expect(result).toEqual(source)
      })

      it('should return the source if the destination is not an object', () => {
        const source = { a: 1 }
        expect(mergeInto([], source, createCircularReferenceChecker())).toBe(source)
      })

      it('should mutate and return destination if it is an object', () => {
        const destination = {}
        const source = { a: 'b' }
        const result = mergeInto(destination, source, createCircularReferenceChecker())
        expect(result).toBe(destination)
        expect(result).toEqual(source)
      })
    })

    it('should return undefined if the source has already been seen', () => {
      const source = {}
      const circularReferenceChecker = createCircularReferenceChecker()
      circularReferenceChecker.hasAlreadyBeenSeen(source)
      expect(mergeInto({}, source, circularReferenceChecker)).toBe(undefined)
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
