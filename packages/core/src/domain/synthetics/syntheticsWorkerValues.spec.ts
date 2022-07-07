import { mockSyntheticsWorkerValues, cleanupSyntheticsWorkerValues } from '../../../test/syntheticsWorkerValues'
import { getSyntheticsResultId, getSyntheticsTestId, willSyntheticsInjectRum } from './syntheticsWorkerValues'

describe('syntheticsWorkerValues', () => {
  afterEach(() => {
    cleanupSyntheticsWorkerValues()
  })

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

  describe('getSyntheticsTestId', () => {
    it('returns undefined if nothing is defined', () => {
      mockSyntheticsWorkerValues({}, 'globals')

      expect(getSyntheticsTestId()).toBeUndefined()
    })

    it('returns the test id if the PUBLIC_ID global variable is defined', () => {
      mockSyntheticsWorkerValues({ publicId: 'toto' }, 'globals')

      expect(getSyntheticsTestId()).toBe('toto')
    })

    it('returns undefined if the PUBLIC_ID global variable is not a string', () => {
      mockSyntheticsWorkerValues({ publicId: 1 }, 'globals')

      expect(getSyntheticsTestId()).toBeUndefined()
    })

    it('returns undefined if the PUBLIC_ID cookie is defined', () => {
      mockSyntheticsWorkerValues({ publicId: 'toto' }, 'cookies')

      expect(getSyntheticsTestId()).toBe('toto')
    })
  })

  describe('getSyntheticsResultId', () => {
    it('returns undefined if nothing is defined', () => {
      mockSyntheticsWorkerValues({}, 'globals')

      expect(getSyntheticsResultId()).toBeUndefined()
    })

    it('returns the test id if the RESULT_ID global variable is defined', () => {
      mockSyntheticsWorkerValues({ resultId: 'toto' }, 'globals')

      expect(getSyntheticsResultId()).toBe('toto')
    })

    it('returns undefined if the RESULT_ID global variable is not a string', () => {
      mockSyntheticsWorkerValues({ resultId: 1 }, 'globals')

      expect(getSyntheticsResultId()).toBeUndefined()
    })

    it('returns undefined if the RESULT_ID cookie is defined', () => {
      mockSyntheticsWorkerValues({ resultId: 'toto' }, 'cookies')

      expect(getSyntheticsResultId()).toBe('toto')
    })
  })
})
