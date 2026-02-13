import {
  ExperimentalFeature,
  addExperimentalFeatures,
  initFeatureFlags,
  isExperimentalFeatureEnabled,
} from './experimentalFeatures'

const TEST_FEATURE_FLAG_ONE = 'foo' as ExperimentalFeature
const TEST_FEATURE_FLAG_TWO = 'bar' as ExperimentalFeature

describe('experimentalFeatures', () => {
  it('initial state is empty', () => {
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBe(false)
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBe(false)
  })

  it('should define enabled experimental features', () => {
    addExperimentalFeatures([TEST_FEATURE_FLAG_ONE])
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBe(true)
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBe(false)
  })

  it('should allow to be shared between products', () => {
    addExperimentalFeatures([TEST_FEATURE_FLAG_ONE])
    addExperimentalFeatures([TEST_FEATURE_FLAG_TWO])

    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBe(true)
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_TWO)).toBe(true)
  })
})

describe('initFeatureFlags', () => {
  beforeEach(() => {
    ;(ExperimentalFeature as any).FOO = TEST_FEATURE_FLAG_ONE
  })

  afterEach(() => {
    delete (ExperimentalFeature as any).FOO
  })

  it('ignores unknown experimental features', () => {
    initFeatureFlags(['bar', undefined as any, null as any, 11 as any])

    expect(isExperimentalFeatureEnabled('bar' as any)).toBe(false)
    expect(isExperimentalFeatureEnabled(undefined as any)).toBe(false)
    expect(isExperimentalFeatureEnabled(null as any)).toBe(false)
    expect(isExperimentalFeatureEnabled(11 as any)).toBe(false)
  })

  it('updates experimental feature flags', () => {
    initFeatureFlags(['foo'])
    expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG_ONE)).toBe(true)
  })
})
