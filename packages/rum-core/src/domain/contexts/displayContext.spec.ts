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
    displayContext = startDisplayContext(mockRumConfiguration())
  })

  afterEach(() => {
    displayContext.stop()
  })

  it('should return current display context using requestAnimationFrame', () => {
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)
    expect(displayContext.get()).toEqual({
      viewport: {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
      },
    })
  })
})
