import { datadogRum } from '@datadog/browser-rum'
import { DatadogRumAdapter } from './rum-integration'

describe('DatadogRumAdapter', () => {
  let adapter: DatadogRumAdapter

  beforeEach(() => {
    adapter = new DatadogRumAdapter()
    // Mock datadogRum methods
    spyOn(datadogRum, 'addFeatureFlagEvaluation')
    spyOn(datadogRum, 'addAction')
  })

  describe('trackFeatureFlag', () => {
    it('should call addFeatureFlagEvaluation with correct parameters', () => {
      const flagKey = 'test-flag'
      const value = true

      adapter.trackFeatureFlag(flagKey, value)

      expect(datadogRum.addFeatureFlagEvaluation).toHaveBeenCalledWith(flagKey, value)
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

      adapter.trackExposure(params)

      expect(datadogRum.addAction).toHaveBeenCalledWith('__dd_exposure', {
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

      adapter.trackExposure(params)

      expect(datadogRum.addAction).toHaveBeenCalledWith('__dd_exposure', {
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