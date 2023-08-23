import type { RumConfiguration } from '../configuration'
import { getDisplayContext, resetDisplayContext } from './displayContext'

describe('displayContext', () => {
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
  })

  afterEach(() => {
    resetDisplayContext()
  })

  it('should return current display context', () => {
    expect(getDisplayContext(configuration)).toEqual({
      viewport: {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
      },
    })
  })
})
