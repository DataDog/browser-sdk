import { getDisplayContext, resetDisplayContext } from './displayContext'

describe('displayContext', () => {
  afterEach(() => {
    resetDisplayContext()
  })

  it('should return current display context', () => {
    expect(getDisplayContext()).toEqual({
      viewport: {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
      },
    })
  })
})
