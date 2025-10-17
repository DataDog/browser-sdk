import {
  ExperimentalFeature,
  addExperimentalFeatures,
  initFeatureFlags,
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
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBeFalsy()
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBeFalsy()
  })

  it('should define enabled experimental features', () => {
    addExperimentalFeatures([TEST_FEATURE_FLAG_ONE])
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBeTruthy()
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBeFalsy()
  })

  it('should allow to be shared between products', () => {
    addExperimentalFeatures([TEST_FEATURE_FLAG_ONE])
    addExperimentalFeatures([TEST_FEATURE_FLAG_TWO])

    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBeTruthy()
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBeTruthy()
  })
})

describe('initFeatureFlags', () => {
  beforeEach(() => {
    ;(ExperimentalFeature as any).FOO = TEST_FEATURE_FLAG_ONE
  })

  afterEach(() => {
    delete (ExperimentalFeature as any).FOO
    resetExperimentalFeatures()
  })

  it('ignores unknown experimental features', () => {
    initFeatureFlags(['bar', undefined as any, null as any, 11 as any])

    expect(isExperimentalFeatureEnabled('bar' as any)).toBeFalsy()
    expect(isExperimentalFeatureEnabled(undefined as any)).toBeFalsy()
    expect(isExperimentalFeatureEnabled(null as any)).toBeFalsy()
    expect(isExperimentalFeatureEnabled(11 as any)).toBeFalsy()
  })

  it('updates experimental feature flags', () => {
    initFeatureFlags(['foo'])
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBeTruthy()
  })
})
