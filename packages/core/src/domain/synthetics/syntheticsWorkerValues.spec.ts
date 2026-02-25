import { mockSyntheticsWorkerValues } from '../../../test'
import { getSyntheticsContext, willSyntheticsInjectRum } from './syntheticsWorkerValues'

describe('syntheticsWorkerValues', () => {
  describe('willSyntheticsInjectRum', () => {
    it('returns false if nothing is defined', () => {
      mockSyntheticsWorkerValues({}, 'globals')

      expect(willSyntheticsInjectRum()).toBeFalse()
    })

    it('returns false if the INJECTS_RUM global variable is false', () => {
      mockSyntheticsWorkerValues({ injectsRum: false }, 'globals')

      expect(willSyntheticsInjectRum()).toBeFalse()
    })

    it('returns true if the INJECTS_RUM global variable is truthy', () => {
      mockSyntheticsWorkerValues({ injectsRum: true }, 'globals')

      expect(willSyntheticsInjectRum()).toBeTrue()
    })

    it('returns true if the INJECTS_RUM cookie is truthy', () => {
      mockSyntheticsWorkerValues({ injectsRum: true }, 'cookies')

      expect(willSyntheticsInjectRum()).toBeTrue()
    })
  })

  describe('getSyntheticsContext', () => {
    it('returns undefined if nothing is defined', () => {
      mockSyntheticsWorkerValues({}, 'globals')

      expect(getSyntheticsContext()).toBeUndefined()
    })

    it('returns the context from the global variable', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo', result_id: 'bar' } }, 'globals')

      expect(getSyntheticsContext()).toEqual({ test_id: 'foo', result_id: 'bar' })
    })

    it('returns undefined if the global variable is missing test_id or result_id', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo' } as any }, 'globals')

      expect(getSyntheticsContext()).toBeUndefined()
    })

    it('returns undefined if test_id or result_id are not strings', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 1, result_id: 2 } as any }, 'globals')

      expect(getSyntheticsContext()).toBeUndefined()
    })

    it('includes extra properties from the context', () => {
      mockSyntheticsWorkerValues(
        { context: { test_id: 'foo', result_id: 'bar', run_type: 'scheduled', suite_ids: ['abc'] as any } },
        'globals'
      )

      expect(getSyntheticsContext()).toEqual({
        test_id: 'foo',
        result_id: 'bar',
        run_type: 'scheduled',
        suite_ids: ['abc'],
      })
    })

    it('returns the context from the cookie', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo', result_id: 'bar' } }, 'cookies')

      expect(getSyntheticsContext()).toEqual({ test_id: 'foo', result_id: 'bar' })
    })

    it('returns undefined if the cookie context is missing required fields', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo' } as any }, 'cookies')

      expect(getSyntheticsContext()).toBeUndefined()
    })

    it('falls back to legacy globals when the new context is absent', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar' }, 'globals')

      expect(getSyntheticsContext()).toEqual({ test_id: 'foo', result_id: 'bar' })
    })

    it('falls back to legacy cookies when the new context is absent', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar' }, 'cookies')

      expect(getSyntheticsContext()).toEqual({ test_id: 'foo', result_id: 'bar' })
    })

    it('returns undefined from legacy fallback if one of the two values is missing', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo' }, 'globals')

      expect(getSyntheticsContext()).toBeUndefined()
    })

    it('prefers the new context over legacy globals when both are present', () => {
      mockSyntheticsWorkerValues(
        { context: { test_id: 'new-id', result_id: 'new-result' }, publicId: 'old-id', resultId: 'old-result' },
        'globals'
      )

      expect(getSyntheticsContext()).toEqual({ test_id: 'new-id', result_id: 'new-result' })
    })
  })
})
