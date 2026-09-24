import { templateRequiresEvaluation, compileSegments, evaluateProbeMessage, browserInspect } from './template'
import { formatUnknownError } from './error'

function defineThrowingGetter(obj: object) {
  Object.defineProperty(obj, 'throwing', {
    get() {
      throw new Error('Cannot access property')
    },
    enumerable: true,
  })
}

describe('template', () => {
  describe('templateRequiresEvaluation', () => {
    it('should return false for undefined segments', () => {
      expect(templateRequiresEvaluation(undefined)).toBe(false)
    })

    it('should return false for segments with only static strings', () => {
      const segments = [{ str: 'hello' }, { str: ' world' }]
      expect(templateRequiresEvaluation(segments)).toBe(false)
    })

    it('should return true for segments with DSL expressions', () => {
      const segments = [{ str: 'Value: ' }, { dsl: 'x', json: { ref: 'x' } }]
      expect(templateRequiresEvaluation(segments)).toBe(true)
    })

    it('should return true if any segment has DSL', () => {
      const segments = [{ str: 'hello' }, { dsl: 'x', json: { ref: 'x' } }, { str: 'world' }]
      expect(templateRequiresEvaluation(segments)).toBe(true)
    })
  })

  describe('compileSegments', () => {
    it('should compile static string segments', () => {
      const segments = [{ str: 'hello' }, { str: ' world' }]
      const result = compileSegments(segments)

      expect(result).toBe('["hello"," world"]')
    })

    it('should compile DSL expression segments', () => {
      const segments = [{ str: 'Value: ' }, { dsl: 'x', json: { ref: 'x' } }]
      const result = compileSegments(segments)

      expect(result).toContain('(() => {')
      expect(result).toContain('try {')
      expect(result).toContain('catch (e) {')
    })

    it('should compile mixed static and dynamic segments', () => {
      const segments = [
        { str: 'x=' },
        { dsl: 'x', json: { ref: 'x' } },
        { str: ', y=' },
        { dsl: 'y', json: { ref: 'y' } },
      ]
      const result = compileSegments(segments)

      expect(result).toContain('"x="')
      expect(result).toContain('(() => {')
      expect(result).toContain('", y="')
    })

    it('should generate error handling for DSL evaluation', () => {
      const segments = [{ dsl: 'badExpr', json: { ref: 'nonExistent' } }]
      const code = compileSegments(segments)

      expect(code).toContain('catch (e)')
      expect(code).toContain('expr: "badExpr"')
      expect(code).toContain('message: $dd_format_error(e)')
    })
  })

  describe('browserInspect', () => {
    it('should inspect null', () => {
      expect(browserInspect(null)).toBe('null')
    })

    it('should inspect undefined', () => {
      expect(browserInspect(undefined)).toBe('undefined')
    })

    it('should inspect strings', () => {
      expect(browserInspect('hello')).toBe('hello')
    })

    it('should inspect numbers', () => {
      expect(browserInspect(42)).toBe('42')
      expect(browserInspect(3.14)).toBe('3.14')
    })

    it('should inspect booleans', () => {
      expect(browserInspect(true)).toBe('true')
      expect(browserInspect(false)).toBe('false')
    })

    it('should inspect bigint', () => {
      if (typeof BigInt === 'undefined') {
        pending('BigInt is not supported in this browser')
        return
      }
      expect(browserInspect(BigInt(123))).toBe('123n')
    })

    it('should inspect symbols', () => {
      const sym = Symbol('test')
      expect(browserInspect(sym)).toContain('Symbol(test)')
    })

    it('should inspect functions', () => {
      function myFunc() {} // eslint-disable-line @typescript-eslint/no-empty-function
      const result = browserInspect(myFunc)
      expect(result).toBe('[Function: myFunc]')
    })

    it('should inspect anonymous functions', () => {
      const result = browserInspect(() => {}) // eslint-disable-line @typescript-eslint/no-empty-function
      expect(result).toContain('[Function:')
    })

    it('should inspect plain objects', () => {
      const result = browserInspect({ a: 1, b: 2 })
      expect(result).toBe('{"a":1,"b":2}')
    })

    it('should inspect arrays', () => {
      const result = browserInspect([1, 2, 3])
      expect(result).toBe('[1,2,3]')
    })

    it('should handle circular references', () => {
      const obj: any = { name: 'test' }
      obj.self = obj
      expect(browserInspect(obj)).toBe('{"name":"test","self":[Object]}')
    })

    it('should not call custom toString when object serialization fails', () => {
      const obj: any = {
        toString: jasmine.createSpy('toString', () => 'custom').and.callThrough(),
      }
      defineThrowingGetter(obj)

      expect(browserInspect(obj)).toBe('[Object]')
      expect(obj.toString).not.toHaveBeenCalled()
    })

    it('should use constructor name when object serialization fails', () => {
      class Custom {}
      const obj: any = new Custom()
      defineThrowingGetter(obj)

      expect(browserInspect(obj)).toBe('[Custom]')
    })

    it('should fall back when constructor name access throws', () => {
      const obj: any = {}
      defineThrowingGetter(obj)
      Object.defineProperty(obj, 'constructor', {
        get() {
          throw new Error('Cannot access constructor')
        },
      })

      expect(browserInspect(obj)).toBe('[Object]')
    })

    it('should handle objects without constructor', () => {
      const obj = Object.create(null)
      const result = browserInspect(obj)
      expect(result).toBe('{}')
    })

    describe('limits', () => {
      describe('maxStringLength (8KB)', () => {
        it('should truncate very long strings', () => {
          const longString = 'a'.repeat(10000)
          const result = browserInspect(longString)
          expect(result).toBe(`${'a'.repeat(8192)}…`)
        })

        it('should not truncate strings shorter than 8KB', () => {
          const shortString = 'a'.repeat(100)
          const result = browserInspect(shortString)
          expect(result).toBe(shortString)
        })
      })

      describe('maxArrayLength (3)', () => {
        it('should truncate arrays longer than 3 elements', () => {
          const longArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          const result = browserInspect(longArray)
          expect(result).toBe('[1,2,3, ... 7 more items]')
        })

        it('should not truncate arrays with 3 or fewer elements', () => {
          const shortArray = [1, 2, 3]
          const result = browserInspect(shortArray)
          expect(result).toBe('[1,2,3]')
        })

        it('should handle empty arrays', () => {
          const result = browserInspect([])
          expect(result).toBe('[]')
        })
      })

      describe('maxObjectProperties (5)', () => {
        it('should truncate objects with more than 5 properties', () => {
          const result = browserInspect({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 })
          expect(result).toBe('{"a":1,"b":2,"c":3,"d":4,"e":5, ... 2 more properties}')
        })

        it('should not truncate objects with 5 or fewer properties', () => {
          const result = browserInspect({ a: 1, b: 2, c: 3, d: 4, e: 5 })
          expect(result).toBe('{"a":1,"b":2,"c":3,"d":4,"e":5}')
        })

        it('should not read omitted properties', () => {
          const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 }
          const getter = jasmine.createSpy('getter')
          Object.defineProperty(obj, 'f', { get: getter, enumerable: true })

          expect(browserInspect(obj)).toBe('{"a":1,"b":2,"c":3,"d":4,"e":5, ... 1 more properties}')
          expect(getter).not.toHaveBeenCalled()
        })
      })

      describe('depth (0)', () => {
        it('should show root object but collapse nested objects and arrays', () => {
          const nested = { a: { b: { c: 'deep' } }, d: [1, 2] }
          const result = browserInspect(nested)
          expect(result).toBe('{"a":[Object],"d":[Array]}')
        })

        it('should inspect property values like array items', () => {
          const result = browserInspect({
            str: 'foo',
            nil: null,
            undef: undefined,
            fn: function foo() {
              return 1
            },
          })
          expect(result).toBe('{"str":"foo","nil":null,"undef":undefined,"fn":[Function: foo]}')
        })

        it('should inspect objects with a JSON representation through it', () => {
          expect(browserInspect(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"')
          expect(browserInspect({ date: new Date(0) })).toBe('{"date":[Object]}')
        })

        it('should inspect structured JSON representations at root depth', () => {
          expect(browserInspect({ toJSON: () => ({ a: 1, b: { c: 2 } }) })).toBe('{"a":1,"b":[Object]}')
          expect(browserInspect({ toJSON: () => [1, { a: 1 }] })).toBe('[1,[Object]]')
        })

        it('should not apply toJSON of JSON representations', () => {
          const obj: Record<string, unknown> = { a: 1, toJSON: () => obj }
          expect(browserInspect(obj)).toBe('{"a":1,"toJSON":[Function: toJSON]}')
        })

        it('should read toJSON once and call it with the root key', () => {
          const toJSON = jasmine.createSpy('toJSON').and.returnValue('json')
          const getter = jasmine.createSpy('getter').and.returnValues(toJSON, undefined)
          const obj = {}
          Object.defineProperty(obj, 'toJSON', { get: getter })

          expect(browserInspect(obj)).toBe('"json"')
          expect(getter).toHaveBeenCalledTimes(1)
          expect(toJSON).toHaveBeenCalledOnceWith('')
        })

        it('should show root array but collapse nested arrays at depth 0', () => {
          const nested = [[['deep']]]
          const result = browserInspect(nested)
          expect(result).toBe('[[Array]]')
        })

        it('should show array structure but collapse nested objects in arrays', () => {
          const nested = [{ a: 1 }, { b: 2 }, { c: 3 }]
          const result = browserInspect(nested)
          expect(result).toBe('[[Object],[Object],[Object]]')
        })
      })

      describe('combined limits', () => {
        it('should apply both maxStringLength and maxArrayLength', () => {
          const data = ['a'.repeat(10000), 'b'.repeat(10000), 'c'.repeat(10000), 'd'.repeat(10000)]
          const result = browserInspect(data)
          expect(result).toContain(`${'a'.repeat(8192)}…`)
          expect(result).toContain(`${'b'.repeat(8192)}…`)
          expect(result).toContain(`${'c'.repeat(8192)}…`)
          expect(result).toContain('1 more items')
        })

        it('should respect depth with maxArrayLength', () => {
          const nested = [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }]
          const result = browserInspect(nested)
          expect(result).toBe('[[Object],[Object],[Object], ... 1 more items]')
        })
      })
    })
  })

  describe('evaluateProbeMessage', () => {
    it('should return static template string when no evaluation needed', () => {
      const probe: any = {
        template: 'Static message',
      }
      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('Static message')
    })

    it('should evaluate template with simple expressions', () => {
      const probe: any = {
        evaluateTemplate: (context: any) => [`x=${context.x}, y=${context.y}`],
      }

      const result = evaluateProbeMessage(probe, { x: 10, y: 20 })
      expect(result).toBe('x=10, y=20')
    })

    it('should handle segments with static and dynamic parts', () => {
      const probe: any = {
        evaluateTemplate: (context: any) => ['Value: ', String(context.value)],
      }

      const result = evaluateProbeMessage(probe, { value: 42 })
      expect(result).toBe('Value: 42')
    })

    it('should handle error objects in segments', () => {
      const probe: any = {
        evaluateTemplate: () => [{ expr: 'bad.expr', message: 'TypeError: Cannot read property' }],
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('{TypeError: Cannot read property}')
    })

    it('should handle non-string segments', () => {
      const probe: any = {
        evaluateTemplate: () => [42, ' ', true, ' ', null],
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('42 true null')
    })

    it('should handle templates with this context', () => {
      const segments = [
        { str: 'Method called on ' },
        { dsl: 'this.name', json: { getmember: [{ ref: 'this' }, 'name'] } },
        { str: ' with arg=' },
        { dsl: 'a', json: { ref: 'a' } },
      ]

      const probe: any = {
        evaluateTemplate: evaluateSegments(segments),
      }

      const context = {
        this: { name: 'MyClass' },
        a: 42,
      }

      const result = evaluateProbeMessage(probe, context)
      expect(result).toBe('Method called on MyClass with arg=42')
    })

    it('should handle templates without this context', () => {
      const segments = [{ str: 'Simple message with ' }, { dsl: 'a', json: { ref: 'a' } }]

      const probe: any = {
        evaluateTemplate: evaluateSegments(segments),
      }

      // Context without 'this'
      const context = {
        a: 42,
      }

      const result = evaluateProbeMessage(probe, context)
      expect(result).toBe('Simple message with 42')
    })

    it('should handle template evaluation errors', () => {
      const probe: any = {
        evaluateTemplate: () => {
          throw new Error('Evaluation failed')
        },
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('{Error: Evaluation failed}')
    })

    it('should handle template evaluation errors that cannot be coerced', () => {
      const probe: any = {
        evaluateTemplate: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw {
            toString() {
              throw new Error('Cannot coerce')
            },
          }
        },
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('{<error: unable to stringify error>}')
    })

    it('should handle template evaluation errors with hostile name and message getters', () => {
      const probe: any = {
        evaluateTemplate: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw {
            [Symbol.toStringTag]: 'Error',
            get name() {
              throw new Error('Cannot read name')
            },
            get message() {
              throw new Error('Cannot read message')
            },
          }
        },
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('{[object Error]}')
    })

    it('should truncate long messages', () => {
      const longMessage = 'a'.repeat(10000)
      const probe: any = {
        evaluateTemplate: () => [longMessage],
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result.length).toBeLessThanOrEqual(8192 + 1) // 8KB + ellipsis
      expect(result).toContain('…')
    })

    it('should use browserInspect for object values', () => {
      const probe: any = {
        evaluateTemplate: (context: any) => ['Object: ', browserInspect(context.obj)],
      }

      const result = evaluateProbeMessage(probe, { obj: { a: 1, b: 2 } })
      expect(result).toBe('Object: {"a":1,"b":2}')
    })
  })

  describe('integration', () => {
    it('should compile and evaluate complete template', () => {
      const segments = [
        { str: 'User ' },
        { dsl: 'name', json: { ref: 'name' } },
        { str: ' has ' },
        { dsl: 'count', json: { ref: 'count' } },
        { str: ' items' },
      ]

      const compiledCode = compileSegments(segments)
      expect(compiledCode).toBeTruthy()

      // The compiled code would be used to create a function
      // This demonstrates the flow even though the actual function creation
      // happens in the probe initialization
    })
  })
})

function evaluateSegments(segments: Array<{ str?: string; dsl?: string; json?: any }>) {
  const fnBodyTemplate = `return ${compileSegments(segments)};`

  return (context: Record<string, any>): unknown[] => {
    const { this: thisValue, ...otherContext } = context
    const contextKeys = Object.keys(otherContext)
    const contextValues = Object.values(otherContext)
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    const fn = new Function('$dd_inspect', '$dd_format_error', ...contextKeys, fnBodyTemplate) as (
      ...args: any[]
    ) => unknown[]
    return fn.call(thisValue, browserInspect, formatUnknownError, ...contextValues)
  }
}
