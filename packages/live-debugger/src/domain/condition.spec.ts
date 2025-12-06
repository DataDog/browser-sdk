import { registerCleanupTask } from '@datadog/browser-core/test'
import { evaluateProbeCondition } from './condition'

describe('condition', () => {
  let consoleErrorSpy: jasmine.Spy

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error')
  })

  describe('evaluateProbeCondition', () => {
    it('should return true when probe has no condition', () => {
      const probe: any = {}
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(true)
    })

    it('should return true for simple true condition', () => {
      const probe: any = {
        condition: 'true',
      }
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(true)
    })

    it('should return false for simple false condition', () => {
      const probe: any = {
        condition: 'false',
      }
      const result = evaluateProbeCondition(probe, {})

      expect(result).toBe(false)
    })

    it('should evaluate condition with context variables', () => {
      const probe: any = {
        condition: 'x > 5',
      }

      expect(evaluateProbeCondition(probe, { x: 10 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 3 })).toBe(false)
    })

    it('should evaluate complex conditions', () => {
      const probe: any = {
        condition: 'x > 5 && y < 20',
      }

      expect(evaluateProbeCondition(probe, { x: 10, y: 15 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 3, y: 15 })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: 10, y: 25 })).toBe(false)
    })

    it('should evaluate conditions with string operations', () => {
      const probe: any = {
        condition: 'name === "John"',
      }

      expect(evaluateProbeCondition(probe, { name: 'John' })).toBe(true)
      expect(evaluateProbeCondition(probe, { name: 'Jane' })).toBe(false)
    })

    it('should evaluate conditions with multiple variables', () => {
      const probe: any = {
        condition: 'a + b === 10',
      }

      expect(evaluateProbeCondition(probe, { a: 5, b: 5 })).toBe(true)
      expect(evaluateProbeCondition(probe, { a: 3, b: 4 })).toBe(false)
    })

    it('should coerce non-boolean results to boolean', () => {
      const probe: any = {
        condition: 'x',
      }

      expect(evaluateProbeCondition(probe, { x: 1 })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: 0 })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: 'hello' })).toBe(true)
      expect(evaluateProbeCondition(probe, { x: '' })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: null })).toBe(false)
      expect(evaluateProbeCondition(probe, { x: undefined })).toBe(false)
    })

    it('should handle condition evaluation errors gracefully', () => {
      const probe: any = {
        id: 'test-probe',
        condition: 'nonExistent.property',
      }

      // Should return true (fire probe) when condition evaluation fails
      const result = evaluateProbeCondition(probe, {})
      expect(result).toBe(true)

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        jasmine.stringContaining('Failed to evaluate condition for probe test-probe'),
        jasmine.any(Error)
      )
    })

    it('should handle syntax errors in condition', () => {
      const probe: any = {
        condition: 'invalid syntax !!!',
      }

      const result = evaluateProbeCondition(probe, {})
      expect(result).toBe(true)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should handle conditions with special variables', () => {
      const probe: any = {
        condition: '$dd_return > 0', // Compiled condition (@ prefix already converted to $dd_)
      }

      expect(evaluateProbeCondition(probe, { $dd_return: 10 })).toBe(true)
      expect(evaluateProbeCondition(probe, { $dd_return: -5 })).toBe(false)
    })

    it('should handle conditions with this context', () => {
      const probe: any = {
        condition: 'this.value === 42',
      }

      expect(evaluateProbeCondition(probe, { this: { value: 42 } })).toBe(true)
      expect(evaluateProbeCondition(probe, { this: { value: 10 } })).toBe(false)
    })

    it('should handle array operations', () => {
      const probe: any = {
        condition: 'arr.length > 0',
      }

      expect(evaluateProbeCondition(probe, { arr: [1, 2, 3] })).toBe(true)
      expect(evaluateProbeCondition(probe, { arr: [] })).toBe(false)
    })

    it('should handle object property checks', () => {
      const probe: any = {
        condition: 'obj.hasOwnProperty("key")',
      }

      expect(evaluateProbeCondition(probe, { obj: { key: 'value' } })).toBe(true)
      expect(evaluateProbeCondition(probe, { obj: {} })).toBe(false)
    })

    it('should handle typeof checks', () => {
      const probe: any = {
        condition: 'typeof value === "number"',
      }

      expect(evaluateProbeCondition(probe, { value: 42 })).toBe(true)
      expect(evaluateProbeCondition(probe, { value: 'string' })).toBe(false)
    })

    it('should handle nested property access', () => {
      const probe: any = {
        condition: 'user.profile.age >= 18',
      }

      expect(evaluateProbeCondition(probe, { user: { profile: { age: 25 } } })).toBe(true)
      expect(evaluateProbeCondition(probe, { user: { profile: { age: 15 } } })).toBe(false)
    })

    it('should handle null/undefined checks', () => {
      const probe: any = {
        condition: 'value !== null && value !== undefined',
      }

      expect(evaluateProbeCondition(probe, { value: 42 })).toBe(true)
      expect(evaluateProbeCondition(probe, { value: null })).toBe(false)
      expect(evaluateProbeCondition(probe, { value: undefined })).toBe(false)
    })
  })
})
