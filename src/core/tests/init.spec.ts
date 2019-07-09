import { commonInit, SECOND_INIT_WARNING_MESSAGE } from '../init'

describe('init', () => {
  beforeEach(() => {
    spyOn(console, 'warn')
  })

  it('should warn of multiple call to init', () => {
    commonInit({ clientToken: 'first' })
    commonInit({ clientToken: 'second' })
    expect(console.warn).toHaveBeenCalledWith(SECOND_INIT_WARNING_MESSAGE)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})
