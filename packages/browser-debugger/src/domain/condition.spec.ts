import { evaluateProbeCondition, isConditionEvaluationError } from './condition'
import { compile } from './expression'

describe('condition', () => {
  describe('evaluateProbeCondition', () => {
    it('should return true when probe has no condition', () => {
      const probe: any = {}
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(true)
    })

    it('should return true for simple true condition', () => {
      const probe: any = {
        condition: compile(true),
      }
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(true)
    })

    it('should return false for simple false condition', () => {
      const probe: any = {
        condition: compile(false),
      }
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(false)
    })

    it('should evaluate condition with context variables', () => {
      const probe: any = {
        condition: compile({ gt: [{ ref: 'x' }, 5] }),
      }

      expect(evaluateProbeCondition(probe, { x: 10 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 3 })).toBe(false)
    })

    it('should evaluate complex conditions', () => {
      const probe: any = {
        condition: compile({ and: [{ gt: [{ ref: 'x' }, 5] }, { lt: [{ ref: 'y' }, 20] }] }),
      }

      expect(evaluateProbeCondition(probe, { x: 10, y: 15 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 3, y: 15 })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: 10, y: 25 })).toBe(false)
    })

    it('should evaluate conditions with string operations', () => {
      const probe: any = {
        condition: compile({ eq: [{ ref: 'name' }, 'John'] }),
      }

      expect(evaluateProbeCondition(probe, { name: 'John' })).toBe(true)
      expect(evaluateProbeCondition(probe, { name: 'Jane' })).toBe(false)
    })

    it('should evaluate conditions with multiple variables', () => {
      const probe: any = {
        condition: compile({ eq: [{ ref: 'a' }, { ref: 'b' }] }),
      }

      expect(evaluateProbeCondition(probe, { a: 5, b: 5 })).toBe(true)
      expect(evaluateProbeCondition(probe, { a: 3, b: 4 })).toBe(false)
    })

    it('should coerce non-boolean results to boolean', () => {
      const probe: any = {
        condition: compile({ ref: 'x' }),
      }

      expect(evaluateProbeCondition(probe, { x: 1 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 0 })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: 'hello' })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: '' })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: null })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: undefined })).toBe(false)
    })

    it('should return an evaluation error when condition evaluation fails', () => {
      const probe: any = {
        id: 'test-probe',
        when: {
          dsl: 'nonExistent.property',
        },
        condition: compile({ getmember: [{ ref: 'nonExistent' }, 'property'] }),
      }

      expect(() => evaluateProbeCondition(probe, {})).toThrowMatching((error) => {
        expect(isConditionEvaluationError(error)).toBeTrue()
        expect(isConditionEvaluationError(error) && error.evaluationError).toEqual({
          expr: 'nonExistent.property',
          message: jasmine.stringMatching(/^ReferenceError: /),
        })
        return true
      })
    })

    it('should handle type errors in condition', () => {
      const probe: any = {
        when: {
          dsl: 'len(x)',
        },
        condition: compile({ len: { ref: 'x' } }),
      }

      expect(() => evaluateProbeCondition(probe, { x: 42 })).toThrowMatching((error) => {
        expect(isConditionEvaluationError(error)).toBeTrue()
        expect(isConditionEvaluationError(error) && error.evaluationError).toEqual({
          expr: 'len(x)',
          message: 'TypeError: Cannot get length of variable',
        })
        return true
      })
    })

    it('should handle syntax errors in condition', () => {
      const probe: any = {
        when: {
          dsl: 'matches(s, "[")',
        },
        condition: compile({ matches: [{ ref: 's' }, '['] }),
      }

      expect(() => evaluateProbeCondition(probe, { s: 'foo' })).toThrowMatching((error) => {
        expect(isConditionEvaluationError(error)).toBeTrue()
        expect(isConditionEvaluationError(error) && error.evaluationError).toEqual({
          expr: 'matches(s, "[")',
          message: jasmine.stringMatching(/^SyntaxError: /),
        })
        return true
      })
    })

    it('should handle cross-realm Error condition failures', () => {
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      const iframeWindow = iframe.contentWindow as Window & { Error: ErrorConstructor }
      const iframeError = new iframeWindow.Error('Iframe error')
      iframe.remove()
      const probe: any = {
        when: {
          dsl: 'throw iframe error',
        },
        condition: () => {
          throw iframeError
        },
      }

      expect(() => evaluateProbeCondition(probe, {})).toThrowMatching((error) => {
        expect(isConditionEvaluationError(error)).toBeTrue()
        expect(isConditionEvaluationError(error) && error.evaluationError).toEqual({
          expr: 'throw iframe error',
          message: 'Error: Iframe error',
        })
        return true
      })
    })

    it('should handle condition errors that cannot be coerced to strings', () => {
      const probe: any = {
        when: {
          dsl: 'throw non-coercible value',
        },
        condition: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw {
            toString() {
              throw new Error('Cannot coerce')
            },
          }
        },
      }

      expect(() => evaluateProbeCondition(probe, {})).toThrowMatching((error) => {
        expect(isConditionEvaluationError(error)).toBeTrue()
        expect(isConditionEvaluationError(error) && error.evaluationError).toEqual({
          expr: 'throw non-coercible value',
          message: '<error: unable to stringify error>',
        })
        return true
      })
    })

    it('should handle Error-like condition errors with hostile name and message getters', () => {
      const probe: any = {
        when: {
          dsl: 'throw hostile error-like value',
        },
        condition: () => {
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

      expect(() => evaluateProbeCondition(probe, {})).toThrowMatching((error) => {
        expect(isConditionEvaluationError(error)).toBeTrue()
        expect(isConditionEvaluationError(error) && error.evaluationError).toEqual({
          expr: 'throw hostile error-like value',
          message: '[object Error]',
        })
        return true
      })
    })

    it('should handle conditions with special variables', () => {
      const probe: any = {
        condition: compile({ gt: [{ ref: '@return' }, 0] }),
      }

      expect(evaluateProbeCondition(probe, { $dd_return: 10 })).toBe(true)
      expect(evaluateProbeCondition(probe, { $dd_return: -5 })).toBe(false)
    })

    it('should handle conditions with this context', () => {
      const probe: any = {
        condition: compile({ eq: [{ getmember: [{ ref: 'this' }, 'value'] }, 42] }),
      }

      expect(evaluateProbeCondition(probe, { this: { value: 42 } })).toBe(true)
      expect(evaluateProbeCondition(probe, { this: { value: 10 } })).toBe(false)
    })

    it('should handle array operations', () => {
      const probe: any = {
        condition: compile({ gt: [{ len: { ref: 'arr' } }, 0] }),
      }

      expect(evaluateProbeCondition(probe, { arr: [1, 2, 3] })).toBe(true)
      expect(evaluateProbeCondition(probe, { arr: [] })).toBe(false)
    })

    it('should handle object property checks', () => {
      const probe: any = {
        condition: compile({ ne: [{ getmember: [{ ref: 'obj' }, 'key'] }, { ref: 'undefined' }] }),
      }

      expect(evaluateProbeCondition(probe, { obj: { key: 'value' } })).toBe(true)
      expect(evaluateProbeCondition(probe, { obj: {} })).toBe(false)
    })

    it('should handle typeof checks', () => {
      const probe: any = {
        condition: compile({ instanceof: [{ ref: 'value' }, 'number'] }),
      }

      expect(evaluateProbeCondition(probe, { value: 42 })).toBe(true)
      expect(evaluateProbeCondition(probe, { value: 'string' })).toBe(false)
    })

    it('should handle nested property access', () => {
      const probe: any = {
        condition: compile({ ge: [{ getmember: [{ getmember: [{ ref: 'user' }, 'profile'] }, 'age'] }, 18] }),
      }

      expect(evaluateProbeCondition(probe, { user: { profile: { age: 25 } } })).toBe(true)
      expect(evaluateProbeCondition(probe, { user: { profile: { age: 15 } } })).toBe(false)
    })

    it('should handle null/undefined checks', () => {
      const probe: any = {
        condition: compile({
          and: [{ ne: [{ ref: 'value' }, null] }, { ne: [{ ref: 'value' }, { ref: 'undefined' }] }],
        }),
      }

      expect(evaluateProbeCondition(probe, { value: 42 })).toBe(true)
      expect(evaluateProbeCondition(probe, { value: null })).toBe(false)
      expect(evaluateProbeCondition(probe, { value: undefined })).toBe(false)
    })
  })
})
