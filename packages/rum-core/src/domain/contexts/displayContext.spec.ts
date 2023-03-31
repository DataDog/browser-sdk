import { ExperimentalFeature, resetExperimentalFeatures, addExperimentalFeatures } from '@datadog/browser-core'
import { getDisplayContext, resetDisplayContext } from './displayContext'

describe('displayContext', () => {
  afterEach(() => {
    resetExperimentalFeatures()
    resetDisplayContext()
  })

  it('should return current display context when ff enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.CLICKMAP])

    expect(getDisplayContext()).toEqual({
      viewport: {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
      },
    })
  })

  it('should not return current display context when ff disabled', () => {
    expect(getDisplayContext()).not.toBeDefined()
  })
})
