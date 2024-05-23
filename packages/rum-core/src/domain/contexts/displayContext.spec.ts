import type { RumConfiguration } from '../configuration'
import type { DisplayContext } from './displayContext'
import { startDisplayContext } from './displayContext'

describe('displayContext', () => {
  let configuration: RumConfiguration
  let displayContext: DisplayContext

  beforeEach(() => {
    configuration = {} as RumConfiguration
    displayContext = startDisplayContext(configuration)
  })

  afterEach(() => {
    displayContext.stop()
  })

  it('should return current display context', () => {
    expect(displayContext.get()).toEqual({
      viewport: {
        height: jasmine.any(Number),
        width: jasmine.any(Number),
      },
    })
  })
})
