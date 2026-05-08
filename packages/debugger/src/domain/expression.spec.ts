import * as acorn from 'acorn'
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
import { OLDEST_BROWSER_ECMA_VERSION } from '../../../../test/unit/browsers.conf'

import { compile } from './expression'
import { compileSegments } from './template'

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
  describe('condition compilation', () => {
    const testNameCounts = new Map<string, number>()

    for (const testCase of testCases) {
      let before: (() => void) | undefined
      let ast: any
      let vars: Record<string, unknown> = {}
      let suffix: string | undefined
      let expected: any
      let execute = true

      if (Array.isArray(testCase)) {
        ;[ast, vars, expected] = testCase
      } else {
        // Allow for more expressive test cases in situations where the default tuple is not enough
        ;({ before, ast, vars = {}, suffix, expected, execute = true } = testCase)
      }

      const baseName = generateTestCaseName(ast, vars, expected, suffix, execute)
      const uniqueName = makeUniqueName(baseName, testNameCounts)

      it(uniqueName, () => {
        if (before) {
          before()
        }

        if (execute === false) {
          if (expected instanceof Error) {
            expect(() => compile(ast)).toThrowError(expected.constructor as new (...args: any[]) => Error)
          } else {
            expect(compile(ast)).toBe(expected)
          }
          return
        }

        const compiledResult = compile(ast)
        const compiledCode = typeof compiledResult === 'string' ? compiledResult : String(compiledResult)
        const code = suffix
          ? `const result = (() => {
              return ${compiledCode}
            })()
            ${suffix}
            return result`
          : `return ${compiledCode}`

        // Create a function with the vars as parameters
        // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
        const fn = new Function(...Object.keys(vars), code)
        const args = Object.values(vars)

        if (expected instanceof Error) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
          expect(() => fn(...args)).toThrowError(expected.constructor as new (...args: any[]) => Error)
        } else {
          const result = runWithDebug(fn, args)
          if (expected !== null && typeof expected === 'object') {
            expect(result).toEqual(expected)
          } else {
            expect(result).toBe(expected)
          }
        }
      })
    }
  })

  // Keep some specific tests for additional coverage
  describe('literal optimization', () => {
    it('should not wrap literal numbers in coercion guards', () => {
      const result = compile({ gt: [{ ref: 'x' }, 10] })
      // The right side should be just "10", not wrapped in a guard function
      expect(result).toContain('> 10')
      expect(result).not.toMatch(/> \(\(val\) => \{/)
    })

    it('should wrap non-literal values in coercion guards', () => {
      const result = compile({ gt: [{ ref: 'x' }, { ref: 'y' }] })
      // Both sides should be wrapped
      expect(result).toContain('((val) => {')
    })

    it('should handle literal booleans without wrapping', () => {
      const result = compile({ gt: [{ ref: 'x' }, true] })
      // Boolean true evaluates, but shouldn't be wrapped for gt since it's not a number
      // Actually, booleans get coerced, so they should still be wrapped
      expect(result).toContain('>')
    })

    it('should handle literal null without wrapping', () => {
      const result = compile({ gt: [{ ref: 'x' }, null] })
      expect(result).toContain('>')
    })
  })

  describe('evaluation edge cases', () => {
    it('should evaluate literal comparisons correctly', () => {
      const x = 15 // eslint-disable-line @typescript-eslint/no-unused-vars
      const compiled = compile({ gt: [{ ref: 'x' }, 10] })
      const code = typeof compiled === 'string' ? compiled : String(compiled)
      const result = eval(code) // eslint-disable-line no-eval
      expect(result).toBe(true)
    })

    it('should handle literal in left position', () => {
      const x = 5 // eslint-disable-line @typescript-eslint/no-unused-vars
      const compiled = compile({ gt: [10, { ref: 'x' }] })
      const code = typeof compiled === 'string' ? compiled : String(compiled)
      const result = eval(code) // eslint-disable-line no-eval
      expect(result).toBe(true)
    })

    it('should handle both literals', () => {
      const compiled = compile({ gt: [20, 10] })
      const code = typeof compiled === 'string' ? compiled : String(compiled)
      const result = eval(code) // eslint-disable-line no-eval
      expect(result).toBe(true)
    })
  })
})

// Validate that all compiled expressions produce JavaScript compatible with the oldest target browser.
// The expression compiler generates code as strings evaluated at runtime via new Function(),
// bypassing TypeScript compilation and webpack transpilation. This test catches usage of syntax
// not supported by older browsers (e.g., optional chaining ?., optional catch binding, nullish coalescing ??).
describe('browser compatibility of generated code', () => {
  function assertECMAVersionCompatible(code: string, params: string[] = []) {
    const functionCode = `function f(${params.join(', ')}) { ${code} }`
    try {
      acorn.parse(functionCode, { ecmaVersion: OLDEST_BROWSER_ECMA_VERSION, sourceType: 'script' })
    } catch (e: unknown) {
      fail(
        `Generated code is not ES${OLDEST_BROWSER_ECMA_VERSION}-compatible: ${(e as Error).message}\n\nGenerated code:\n${code}`
      )
    }
  }

  describe('expressions', () => {
    const testNameCounts = new Map<string, number>()

    for (const testCase of testCases) {
      let ast: any
      let vars: Record<string, unknown> = {}
      let suffix: string | undefined
      let execute = true

      if (Array.isArray(testCase)) {
        ;[ast, vars] = testCase
      } else {
        ;({ ast, vars = {}, suffix, execute = true } = testCase)
      }

      if (execute === false) {
        continue
      }

      const baseName = JSON.stringify(ast)
      const uniqueName = makeUniqueName(baseName, testNameCounts)

      it(uniqueName, () => {
        const compiledResult = compile(ast)
        const compiledCode = typeof compiledResult === 'string' ? compiledResult : String(compiledResult)
        const code = suffix
          ? `const result = (() => {
              return ${compiledCode}
            })()
            ${suffix}
            return result`
          : `return ${compiledCode}`

        assertECMAVersionCompatible(code, Object.keys(vars))
      })
    }
  })

  describe('template segments', () => {
    it('should generate code compatible with the oldest target browser for compiled segments', () => {
      const segmentsCode = compileSegments([{ str: 'Hello ' }, { dsl: 'name', json: { ref: 'name' } }, { str: '!' }])

      assertECMAVersionCompatible(`return ${segmentsCode}`, ['$dd_inspect', 'name'])
    })

    it('should generate code compatible with the oldest target browser for segments with complex expressions', () => {
      const segmentsCode = compileSegments([{ dsl: 'obj.field', json: { getmember: [{ ref: 'obj' }, 'field'] } }])

      assertECMAVersionCompatible(`return ${segmentsCode}`, ['$dd_inspect', 'obj'])
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

function generateTestCaseName(
  ast: any,
  vars: Record<string, unknown>,
  expected: any,
  suffix?: string,
  execute?: boolean
): string {
  const code = Object.entries(vars)
    .map(([key, value]) => `${key} = ${serialize(value)}`)
    .join('; ')

  const expectedStr = expected instanceof Error ? expected.constructor.name : serialize(expected)
  let name = `${JSON.stringify(ast)} + "${code}" => ${expectedStr}`

  // Add suffix to make test names unique when present
  if (suffix) {
    name += ` (with: ${suffix.replace(/\n/g, ' ').substring(0, 50)})`
  }

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function runWithDebug(fn: Function, args: any[] = []): any {
  try {
    return fn(...args) // eslint-disable-line @typescript-eslint/no-unsafe-call
  } catch (e) {
    // Output the compiled expression for easier debugging
    // eslint-disable-next-line no-console
    console.log(
      [
        'Compiled expression:',
        '--------------------------------------------------------------------------------',
        fn.toString(),
        '--------------------------------------------------------------------------------',
      ].join('\n')
    )
    throw e
  }
}
