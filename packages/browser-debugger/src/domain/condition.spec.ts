import { describe, expect, it } from 'vitest'
import { evaluateProbeCondition, compileCondition, isConditionEvaluationError } from './condition'

describe('condition', () => {
  describe('evaluateProbeCondition', () => {
    it('should return true when probe has no condition', () => {
      const probe: any = {}
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(true)
    })

    it('should return true for simple true condition', () => {
      const probe: any = {
        condition: compileCondition('true'),
      }
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(true)
    })

    it('should return false for simple false condition', () => {
      const probe: any = {
        condition: compileCondition('false'),
      }
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(false)
    })

    it('should evaluate condition with context variables', () => {
      const probe: any = {
        condition: compileCondition('x > 5'),
      }

      expect(evaluateProbeCondition(probe, { x: 10 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 3 })).toBe(false)
    })

    it('should evaluate complex conditions', () => {
      const probe: any = {
        condition: compileCondition('x > 5 && y < 20'),
      }

      expect(evaluateProbeCondition(probe, { x: 10, y: 15 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 3, y: 15 })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: 10, y: 25 })).toBe(false)
    })

    it('should evaluate conditions with string operations', () => {
      const probe: any = {
        condition: compileCondition('name === "John"'),
      }

      expect(evaluateProbeCondition(probe, { name: 'John' })).toBe(true)
      expect(evaluateProbeCondition(probe, { name: 'Jane' })).toBe(false)
    })

    it('should evaluate conditions with multiple variables', () => {
      const probe: any = {
        condition: compileCondition('a + b === 10'),
      }

      expect(evaluateProbeCondition(probe, { a: 5, b: 5 })).toBe(true)
      expect(evaluateProbeCondition(probe, { a: 3, b: 4 })).toBe(false)
    })

    it('should coerce non-boolean results to boolean', () => {
      const probe: any = {
        condition: compileCondition('x'),
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
        condition: compileCondition('nonExistent.property'),
      }

      expect(() => evaluateProbeCondition(probe, {})).toThrow()
      let thrownError: unknown
      try {
        evaluateProbeCondition(probe, {})
      } catch (e) {
        thrownError = e
      }
      expect(isConditionEvaluationError(thrownError)).toBe(true)
      if (isConditionEvaluationError(thrownError)) {
        expect(thrownError.evaluationError).toEqual({
          expr: 'nonExistent.property',
          message: expect.stringMatching(/^ReferenceError: /),
        })
      }
    })

    it('should handle syntax errors in condition', () => {
      const probe: any = {
        when: {
          dsl: 'invalid syntax !!!',
        },
        condition: compileCondition('invalid syntax !!!'),
      }

      expect(() => evaluateProbeCondition(probe, {})).toThrow()
      let thrownError: unknown
      try {
        evaluateProbeCondition(probe, {})
      } catch (e) {
        thrownError = e
      }
      expect(isConditionEvaluationError(thrownError)).toBe(true)
      if (isConditionEvaluationError(thrownError)) {
        expect(thrownError.evaluationError).toEqual({
          expr: 'invalid syntax !!!',
          message: expect.stringMatching(/^SyntaxError: /),
        })
      }
    })

    it('should handle conditions with special variables', () => {
      const probe: any = {
        condition: compileCondition('$dd_return > 0'),
      }

      expect(evaluateProbeCondition(probe, { $dd_return: 10 })).toBe(true)
      expect(evaluateProbeCondition(probe, { $dd_return: -5 })).toBe(false)
    })

    it('should handle conditions with this context', () => {
      const probe: any = {
        condition: compileCondition('this.value === 42'),
      }

      expect(evaluateProbeCondition(probe, { this: { value: 42 } })).toBe(true)
      expect(evaluateProbeCondition(probe, { this: { value: 10 } })).toBe(false)
    })

    it('should handle array operations', () => {
      const probe: any = {
        condition: compileCondition('arr.length > 0'),
      }

      expect(evaluateProbeCondition(probe, { arr: [1, 2, 3] })).toBe(true)
      expect(evaluateProbeCondition(probe, { arr: [] })).toBe(false)
    })

    it('should handle object property checks', () => {
      const probe: any = {
        condition: compileCondition('obj.hasOwnProperty("key")'),
      }

      expect(evaluateProbeCondition(probe, { obj: { key: 'value' } })).toBe(true)
      expect(evaluateProbeCondition(probe, { obj: {} })).toBe(false)
    })

    it('should handle typeof checks', () => {
      const probe: any = {
        condition: compileCondition('typeof value === "number"'),
      }

      expect(evaluateProbeCondition(probe, { value: 42 })).toBe(true)
      expect(evaluateProbeCondition(probe, { value: 'string' })).toBe(false)
    })

    it('should handle nested property access', () => {
      const probe: any = {
        condition: compileCondition('user.profile.age >= 18'),
      }

      expect(evaluateProbeCondition(probe, { user: { profile: { age: 25 } } })).toBe(true)
      expect(evaluateProbeCondition(probe, { user: { profile: { age: 15 } } })).toBe(false)
    })

    it('should handle null/undefined checks', () => {
      const probe: any = {
        condition: compileCondition('value !== null && value !== undefined'),
      }

      expect(evaluateProbeCondition(probe, { value: 42 })).toBe(true)
      expect(evaluateProbeCondition(probe, { value: null })).toBe(false)
      expect(evaluateProbeCondition(probe, { value: undefined })).toBe(false)
    })
  })
})
