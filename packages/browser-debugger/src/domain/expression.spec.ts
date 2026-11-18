import {
  literals,
  references,
  propertyAccess,
  sizes,
  equality,
  stringManipulation,
  stringComparison,
  logicalOperators,
  collectionOperations,
  membershipAndMatching,
  typeAndDefinitionChecks,
} from '../../test'
import type { TestCase } from '../../test'

import { compile } from './expression'

// Flatten all test cases into a single array
const testCases: TestCase[] = [
  ...literals,
  ...references,
  ...propertyAccess,
  ...sizes,
  ...equality,
  ...stringManipulation,
  ...stringComparison,
  ...logicalOperators,
  ...collectionOperations,
  ...membershipAndMatching,
  ...typeAndDefinitionChecks,
]

describe('Expression language', () => {
  describe('evaluation', () => {
    const testNameCounts = new Map<string, number>()

    for (const testCase of testCases) {
      let before: (() => void) | undefined
      let ast: any
      let vars: Record<string, unknown> = {}
      let expected: any
      let execute = true

      if (Array.isArray(testCase)) {
        ;[ast, vars, expected] = testCase
      } else {
        // Allow for more expressive test cases in situations where the default tuple is not enough
        ;({ before, ast, vars = {}, expected, execute = true } = testCase)
      }

      const baseName = generateTestCaseName(ast, vars, expected, execute)
      const uniqueName = makeUniqueName(baseName, testNameCounts)

      it(uniqueName, () => {
        if (before) {
          before()
        }

        if (execute === false) {
          if (expected instanceof Error) {
            expect(() => compile(ast)).toThrowError(expected.constructor as new (...args: any[]) => Error)
          } else {
            expect(() => compile(ast)).not.toThrow()
          }
          return
        }

        const evaluate = compile(ast)

        if (expected instanceof Error) {
          expect(() => evaluate(vars)).toThrowError(expected.constructor as new (...args: any[]) => Error)
        } else {
          const result = evaluate(vars)
          if (expected !== null && typeof expected === 'object') {
            expect(result).toEqual(expected)
          } else {
            expect(result).toBe(expected)
          }
        }
      })
    }
  })

  describe('evaluation edge cases', () => {
    it('should evaluate literal comparisons correctly', () => {
      expect(compile({ gt: [{ ref: 'x' }, 10] })({ x: 15 })).toBe(true)
    })

    it('should handle literal in left position', () => {
      expect(compile({ gt: [10, { ref: 'x' }] })({ x: 5 })).toBe(true)
    })

    it('should handle both literals', () => {
      expect(compile({ gt: [20, 10] })({})).toBe(true)
    })

    it('should name the variable in the error thrown for an undefined reference', () => {
      expect(() => compile({ ref: 'foo' })({})).toThrowError(ReferenceError, 'foo is not defined')
    })

    it('should evaluate the same compiled expression against contexts with different keys', () => {
      const evaluate = compile({ ref: 'x' })

      expect(evaluate({ x: 1 })).toBe(1)
      expect(evaluate({ x: 2, $dd_return: 3 })).toBe(2)
    })
  })
})

function makeUniqueName(baseName: string, testNameCounts: Map<string, number>): string {
  const count = testNameCounts.get(baseName) || 0
  testNameCounts.set(baseName, count + 1)

  if (count === 0) {
    return baseName
  }

  return `${baseName} [#${count + 1}]`
}

function generateTestCaseName(ast: any, vars: Record<string, unknown>, expected: any, execute?: boolean): string {
  const code = Object.entries(vars)
    .map(([key, value]) => `${key} = ${serialize(value)}`)
    .join('; ')

  const expectedStr = expected instanceof Error ? expected.constructor.name : serialize(expected)
  let name = `${JSON.stringify(ast)} + "${code}" => ${expectedStr}`

  // Indicate when compilation is tested without execution
  if (execute === false) {
    name += ' [compile-only]'
  }

  return name
}

function serialize(value: any): string {
  try {
    if (value === undefined) {
      return 'undefined'
    }
    if (typeof value === 'function') {
      return 'function'
    }
    if (typeof value === 'symbol') {
      return value.toString()
    }

    // Distinguish between primitive strings and String objects
    if (typeof value === 'string') {
      return JSON.stringify(value)
    }
    if (value instanceof String) {
      return `String(${JSON.stringify(value.valueOf())})`
    }

    // Handle other objects with constructor names for better distinction
    if (value && typeof value === 'object') {
      const constructorName = value.constructor?.name
      if (constructorName && constructorName !== 'Object' && constructorName !== 'Array') {
        // For built-in types like Set, Map, WeakSet, etc., show constructor name
        if (['Set', 'Map', 'WeakSet', 'WeakMap', 'Int16Array', 'Int32Array', 'RegExp'].includes(constructorName)) {
          return `${constructorName}(${JSON.stringify(value).substring(0, 50)})`
        }
        // For custom objects, just show the constructor name
        return `${constructorName}{}`
      }
    }

    return JSON.stringify(value)
  } catch {
    // Some values are not serializable to JSON, so we fall back to stringification
    const str = String(value)
    return str.length > 50 ? `${str.substring(0, 50)}…` : str
  }
}
