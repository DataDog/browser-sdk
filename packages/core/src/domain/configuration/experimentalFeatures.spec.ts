import type { ExperimentalFeature } from './experimentalFeatures'
import {
  addExperimentalFeatures,
  isExperimentalFeatureEnabled,
  resetExperimentalFeatures,
} from './experimentalFeatures'

const TEST_FEATURE_FLAG_ONE = 'foo' as ExperimentalFeature
const TEST_FEATURE_FLAG_TWO = 'bar' as ExperimentalFeature

describe('experimentalFeatures', () => {
  afterEach(() => {
    resetExperimentalFeatures()
  })

  it('initial state is empty', () => {
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBeFalse()
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBeFalse()
  })

  it('should define enabled experimental features', () => {
    addExperimentalFeatures([TEST_FEATURE_FLAG_ONE])
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBeTrue()
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBeFalse()
  })

  it('should allow to be shared between products', () => {
    addExperimentalFeatures([TEST_FEATURE_FLAG_ONE])
    addExperimentalFeatures([TEST_FEATURE_FLAG_TWO])

    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBeTrue()
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBeTrue()
  })
})
