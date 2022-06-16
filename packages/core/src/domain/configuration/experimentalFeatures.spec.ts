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

  it('should sample experimental features', () => {
    updateExperimentalFeatures([{ foo: 100 }, { bar: 0 }, 'baz'])

    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
    expect(isExperimentalFeatureEnabled('bar')).toBeFalse()
    expect(isExperimentalFeatureEnabled('baz')).toBeTrue()
  })
})
