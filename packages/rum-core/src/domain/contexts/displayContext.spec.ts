import { mockRumConfiguration } from '../../../test'
import type { DisplayContext } from './displayContext'
import { startDisplayContext } from './displayContext'

describe('displayContext', () => {
  let displayContext: DisplayContext

  beforeEach(() => {
    displayContext = startDisplayContext(mockRumConfiguration())
  })

  afterEach(() => {
    displayContext.stop()
  })

  it('should return current display context', () => {
    expect(displayContext.get()).toEqual({
      viewport: {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
      },
    })
  })
})
