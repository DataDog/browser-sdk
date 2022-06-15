import {
  updateExperimentalFeatures,
  isExperimentalFeatureEnabled,
  resetExperimentalFeatures,
  setSampledExperimentalFeatures,
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

  it('should allow to be shared between products', () => {
    updateExperimentalFeatures(['foo'])
    updateExperimentalFeatures(['bar'])

    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
    expect(isExperimentalFeatureEnabled('bar')).toBeTrue()
  })

  it('should support some edge cases', () => {
    updateExperimentalFeatures(['foo'])
    updateExperimentalFeatures(undefined)
    updateExperimentalFeatures([])
    updateExperimentalFeatures([11 as any])

    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
  })
})

describe('setSampledExperimentalFeatures', () => {
  it('should sample experimental features', () => {
    setSampledExperimentalFeatures({ foo: 100, bar: 0 })
    updateExperimentalFeatures(['foo', 'bar', 'baz'])

    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
    expect(isExperimentalFeatureEnabled('bar')).toBeFalse()
    expect(isExperimentalFeatureEnabled('baz')).toBeTrue()
  })
})
