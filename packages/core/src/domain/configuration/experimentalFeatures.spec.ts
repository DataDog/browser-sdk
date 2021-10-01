import {
  updateExperimentalFeatures,
  isExperimentalFeatureEnabled,
  resetExperimentalFeatures,
} from './experimentalFeatures'

describe('experimentalFeatures', () => {
  it('initial state is empty', () => {
    resetExperimentalFeatures()
    expect(isExperimentalFeatureEnabled(undefined as any)).toBeFalse()
    expect(isExperimentalFeatureEnabled('foo')).toBeFalse()
    expect(isExperimentalFeatureEnabled('bar')).toBeFalse()
    expect(isExperimentalFeatureEnabled('')).toBeFalse()
  })

  it('updateExperimentalFeatures', () => {
    updateExperimentalFeatures(['foo'])
    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
    expect(isExperimentalFeatureEnabled('bar')).toBeFalse()
  })

  it('resetExperimentalFeatures clears state', () => {
    resetExperimentalFeatures()
    expect(isExperimentalFeatureEnabled('foo')).toBeFalse()
    expect(isExperimentalFeatureEnabled('bar')).toBeFalse()
  })

  it("functions won't throw", () => {
    resetExperimentalFeatures()
    resetExperimentalFeatures()
    expect(isExperimentalFeatureEnabled('foo')).toBeFalse()
    updateExperimentalFeatures(undefined)
    updateExperimentalFeatures(undefined)
    expect(isExperimentalFeatureEnabled('foo')).toBeFalse()
    updateExperimentalFeatures(['foo'])
    updateExperimentalFeatures(['foo'])
    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
  })
})
