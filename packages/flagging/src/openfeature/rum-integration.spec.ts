import { newDatadogRumIntegration } from './rum-integration'

const mockDatadogRum = {
  addFeatureFlagEvaluation: jasmine.createSpy('addFeatureFlagEvaluation'),
  addAction: jasmine.createSpy('addAction'),
}

describe('DatadogRumIntegration', () => {
  let rumIntegration: ReturnType<typeof newDatadogRumIntegration>

  beforeEach(() => {
    // Mock RUM SDK methods
    rumIntegration = newDatadogRumIntegration(mockDatadogRum)
  })

  describe('trackFeatureFlag', () => {
    it('should call addFeatureFlagEvaluation with correct parameters', () => {
      const flagKey = 'test-flag'
      const value = true

      rumIntegration.trackFeatureFlag(flagKey, value)

      expect(mockDatadogRum.addFeatureFlagEvaluation).toHaveBeenCalledWith(flagKey, value)
    })
  })

  describe('trackExposure', () => {
    it('should call addAction with correct parameters', () => {
      const params = {
        flagKey: 'test-flag',
        allocationKey: 'test-allocation',
        exposureKey: 'test-flag-test-allocation',
        subjectKey: 'test-subject',
        subjectAttributes: { user: 'test' },
        variantKey: 'test-variant',
        metadata: { source: 'test' }
      }

      rumIntegration.trackExposure(params)

      expect(mockDatadogRum.addAction).toHaveBeenCalledWith('__dd_exposure', {
        timestamp: 0,
        flag_key: params.flagKey,
        allocation_key: params.allocationKey,
        exposure_key: params.exposureKey,
        subject_key: params.subjectKey,
        subject_attributes: params.subjectAttributes,
        variant_key: params.variantKey,
        metadata: params.metadata
      })
    })

    it('should handle optional parameters', () => {
      const params = {
        flagKey: 'test-flag',
        exposureKey: 'test-flag-test-allocation'
      }

      rumIntegration.trackExposure(params)

      expect(mockDatadogRum.addAction).toHaveBeenCalledWith('__dd_exposure', {
        timestamp: 0,
        flag_key: params.flagKey,
        exposure_key: params.exposureKey,
        allocation_key: undefined,
        subject_key: undefined,
        subject_attributes: undefined,
        variant_key: undefined,
        metadata: undefined
      })
    })
  })
}) 
