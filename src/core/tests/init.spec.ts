import { ALREADY_INITIALIZED_MESSAGE, commonInit } from '../init'

describe('init', () => {
  beforeEach(() => {
    spyOn(console, 'warn')
  })

  it('should warn of multiple call to init', () => {
    commonInit({ clientToken: 'first' })
    commonInit({ clientToken: 'second' })
    expect(console.warn).toHaveBeenCalledWith(ALREADY_INITIALIZED_MESSAGE)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})
