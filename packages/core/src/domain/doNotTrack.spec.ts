import { registerCleanupTask } from '../../test'
import { isTrackingAllowedByBrowser } from './doNotTrack'

describe('doNotTrack', () => {
  let originalDoNotTrack: string | null | undefined

  function setDoNotTrack(value) {
      Object.defineProperty(navigator, 'doNotTrack', {
      value,
      writable: true,
      configurable: true,
    })
  }

  beforeEach(() => {
    originalDoNotTrack = navigator.doNotTrack

    registerCleanupTask(() => {
      setDoNotTrack(originalDoNotTrack)
    })
  })

  it('should return ENABLED state when navigator.doNotTrack is "1"', () => {
    setDoNotTrack('1')
    expect(isTrackingAllowedByBrowser()).toBe(false)
  })

  it('should return DISABLED state when navigator.doNotTrack is "0"', () => {
    setDoNotTrack('0')
    expect(isTrackingAllowedByBrowser()).toBe(true)
  })

  it('should return DISABLED state when navigator.doNotTrack is undefined', () => {
    setDoNotTrack()
    expect(isTrackingAllowedByBrowser()).toBe(true)
  })

  it('should return DISABLED state when navigator.doNotTrack is null', () => {
    setDoNotTrack(null)
    expect(isTrackingAllowedByBrowser()).toBe(true)
  })
})
