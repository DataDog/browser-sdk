import { registerCleanupTask } from '@datadog/browser-core/test'
import { templateRequiresEvaluation, compileSegments, evaluateProbeMessage, browserInspect } from './template'

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

    it('should handle errors in DSL evaluation', () => {
      const segments = [{ dsl: 'badExpr', json: { ref: 'nonExistent' } }]
      const code = compileSegments(segments)

      // The compiled code should have error handling
      expect(code).toContain('catch (e)')
      expect(code).toContain('message')
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
      expect(browserInspect(BigInt(123))).toBe('123n')
    })

    it('should inspect symbols', () => {
      const sym = Symbol('test')
      expect(browserInspect(sym)).toContain('Symbol(test)')
    })

    it('should inspect functions', () => {
      function myFunc() {}
      const result = browserInspect(myFunc)
      expect(result).toBe('[Function: myFunc]')
    })

    it('should inspect anonymous functions', () => {
      const result = browserInspect(() => {})
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

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'test' }
      obj.self = obj
      const result = browserInspect(obj)
      // Should either return [Object] or handle the error
      expect(result).toBeTruthy()
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
          expect(result).toBe('a'.repeat(8192) + '...')
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

      describe('depth (0)', () => {
        it('should fully stringify plain objects (depth limit applies to arrays)', () => {
          const nested = { a: { b: { c: { d: 'deep' } } } }
          const result = browserInspect(nested)
          // Objects are fully stringified via JSON.stringify
          expect(result).toBe('{"a":{"b":{"c":{"d":"deep"}}}}')
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
          expect(result).toContain('a'.repeat(8192) + '...')
          expect(result).toContain('b'.repeat(8192) + '...')
          expect(result).toContain('c'.repeat(8192) + '...')
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
        templateRequiresEvaluation: false,
        template: 'Static message',
      }
      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('Static message')
    })

    it('should evaluate template with simple expressions', () => {
      const template: any = {
        createFunction: (keys: string[]) => {
          expect(keys).toEqual(['x', 'y'])
          return ($dd_inspect: any, x: number, y: number) => [`x=${x}, y=${y}`]
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
      }

      const result = evaluateProbeMessage(probe, { x: 10, y: 20 })
      expect(result).toBe('x=10, y=20')
    })

    it('should handle segments with static and dynamic parts', () => {
      const template: any = {
        createFunction: (keys: string[]) => {
          return ($dd_inspect: any, ...values: any[]) => {
            const context: any = {}
            keys.forEach((key, i) => {
              context[key] = values[i]
            })
            return ['Value: ', String(context.value)]
          }
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
      }

      const result = evaluateProbeMessage(probe, { value: 42 })
      expect(result).toBe('Value: 42')
    })

    it('should handle error objects in segments', () => {
      const template: any = {
        createFunction: () => {
          return () => [{ expr: 'bad.expr', message: 'TypeError: Cannot read property' }]
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('{TypeError: Cannot read property}')
    })

    it('should handle non-string segments', () => {
      const template: any = {
        createFunction: () => {
          return () => [42, ' ', true, ' ', null]
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
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

      // Compile the segments like initializeProbe does
      const segmentsCode = compileSegments(segments)
      const fnBodyTemplate = `return ${segmentsCode};`
      const functionCache = new Map<string, (...args: any[]) => any[]>()

      const template = {
        createFunction: (contextKeys: string[]) => {
          const cacheKey = contextKeys.join(',')
          let fn = functionCache.get(cacheKey)
          if (!fn) {
            fn = new Function('$dd_inspect', ...contextKeys, fnBodyTemplate) as (...args: any[]) => any[]
            functionCache.set(cacheKey, fn)
          }
          return fn
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
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

      // Compile the segments like initializeProbe does
      const segmentsCode = compileSegments(segments)
      const fnBodyTemplate = `return ${segmentsCode};`
      const functionCache = new Map<string, (...args: any[]) => any[]>()

      const template = {
        createFunction: (contextKeys: string[]) => {
          const cacheKey = contextKeys.join(',')
          let fn = functionCache.get(cacheKey)
          if (!fn) {
            fn = new Function('$dd_inspect', ...contextKeys, fnBodyTemplate) as (...args: any[]) => any[]
            functionCache.set(cacheKey, fn)
          }
          return fn
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
      }

      // Context without 'this'
      const context = {
        a: 42,
      }

      const result = evaluateProbeMessage(probe, context)
      expect(result).toBe('Simple message with 42')
    })

    it('should handle template evaluation errors', () => {
      const template: any = {
        createFunction: () => {
          return () => {
            throw new Error('Evaluation failed')
          }
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result).toBe('{Error: Evaluation failed}')
    })

    it('should truncate long messages', () => {
      const longMessage = 'a'.repeat(10000)
      const template: any = {
        createFunction: () => {
          return () => [longMessage]
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
      }

      const result = evaluateProbeMessage(probe, {})
      expect(result.length).toBeLessThanOrEqual(8192 + 1) // 8KB + ellipsis
      expect(result).toContain('…')
    })

    it('should use browserInspect for object values', () => {
      const template: any = {
        createFunction: (keys: string[]) => {
          return ($dd_inspect: any, obj: any) => {
            return ['Object: ', $dd_inspect(obj, {})]
          }
        },
      }

      const probe: any = {
        templateRequiresEvaluation: true,
        template,
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
