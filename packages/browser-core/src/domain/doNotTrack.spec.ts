import { setNavigatorDoNotTrack } from '../../test'
import { isTrackingAllowedByBrowser } from './doNotTrack'

describe('doNotTrack', () => {
  it('returns false when navigator.doNotTrack is "1"', () => {
    setNavigatorDoNotTrack('1')
    expect(isTrackingAllowedByBrowser()).toBe(false)
  })

  it('returns true when navigator.doNotTrack is "0"', () => {
    setNavigatorDoNotTrack('0')
    expect(isTrackingAllowedByBrowser()).toBe(true)
  })

  it('returns true when navigator.doNotTrack is undefined', () => {
    setNavigatorDoNotTrack(undefined)
    expect(isTrackingAllowedByBrowser()).toBe(true)
  })

  it('returns true when navigator.doNotTrack is null', () => {
    setNavigatorDoNotTrack(null)
    expect(isTrackingAllowedByBrowser()).toBe(true)
  })
})
