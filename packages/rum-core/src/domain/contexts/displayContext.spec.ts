import { addExperimentalFeatures, ExperimentalFeature, resetExperimentalFeatures } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../test'
import type { DisplayContext } from './displayContext'
import { startDisplayContext } from './displayContext'

describe('displayContext', () => {
  let displayContext: DisplayContext
  let requestAnimationFrameSpy: jasmine.Spy
  beforeEach(() => {
    requestAnimationFrameSpy = spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      callback(1)
      return 1
    })
  })

  afterEach(() => {
    displayContext.stop()
    resetExperimentalFeatures()
  })

  it('should return current display context using requestAnimationFrame if FF enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.DELAY_VIEWPORT_COLLECTION])
    displayContext = startDisplayContext(mockRumConfiguration())

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)
    expect(displayContext.get()).toEqual({
      viewport: {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
      },
    })
  })

  it('should return current display context without using requestAnimationFrame if FF disabled', () => {
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(0)
    displayContext = startDisplayContext(mockRumConfiguration())

    expect(displayContext.get()).toEqual({
      viewport: {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
      },
    })
  })
})
