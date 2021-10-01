import {
  updateExperimentalFeatures,
  isExperimentalFeatureEnabled,
  resetExperimentalFeatures,
} from './experimentalFeatures'

describe('experimentalFeatures', () => {
  afterEach(() => {
    resetExperimentalFeatures()
  })

  it('initial state is empty', () => {
    expect(isExperimentalFeatureEnabled('foo')).toBeFalse()
    expect(isExperimentalFeatureEnabled('bar')).toBeFalse()
  })

  it('should define enabled experimental features', () => {
    updateExperimentalFeatures(['foo'])
    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
    expect(isExperimentalFeatureEnabled('bar')).toBeFalse()
  })

  it("functions won't throw an error", () => {
    resetExperimentalFeatures()
    resetExperimentalFeatures()
    updateExperimentalFeatures(undefined)
    updateExperimentalFeatures(undefined)
    expect(isExperimentalFeatureEnabled('foo')).toBeFalse()

    updateExperimentalFeatures(['foo'])
    updateExperimentalFeatures([11 as any, [] as any, {} as any, null as any, undefined as any])
    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
  })
})
