import { setNavigatorDoNotTrack, setNavigatorGlobalPrivacyControl } from '../../test'
import { isTrackingAllowedByPrivacySignals } from './privacySignals'

describe('privacySignals', () => {
  describe('Do Not Track', () => {
    it('returns false when navigator.doNotTrack is "1"', () => {
      setNavigatorDoNotTrack('1')
      expect(isTrackingAllowedByPrivacySignals()).toBe(false)
    })

    it('returns true when navigator.doNotTrack is "0"', () => {
      setNavigatorDoNotTrack('0')
      expect(isTrackingAllowedByPrivacySignals()).toBe(true)
    })

    it('returns true when navigator.doNotTrack is undefined', () => {
      setNavigatorDoNotTrack(undefined)
      expect(isTrackingAllowedByPrivacySignals()).toBe(true)
    })

    it('returns true when navigator.doNotTrack is null', () => {
      setNavigatorDoNotTrack(null)
      expect(isTrackingAllowedByPrivacySignals()).toBe(true)
    })
  })

  describe('Global Privacy Control', () => {
    it('returns false when navigator.globalPrivacyControl is true', () => {
      setNavigatorGlobalPrivacyControl(true)
      expect(isTrackingAllowedByPrivacySignals()).toBe(false)
    })

    it('returns true when navigator.globalPrivacyControl is false', () => {
      setNavigatorGlobalPrivacyControl(false)
      expect(isTrackingAllowedByPrivacySignals()).toBe(true)
    })

    it('returns true when navigator.globalPrivacyControl is undefined', () => {
      setNavigatorGlobalPrivacyControl(undefined)
      expect(isTrackingAllowedByPrivacySignals()).toBe(true)
    })
  })

  describe('precedence', () => {
    it('is blocked by GPC even when DNT explicitly allows tracking', () => {
      setNavigatorDoNotTrack('0')
      setNavigatorGlobalPrivacyControl(true)
      expect(isTrackingAllowedByPrivacySignals()).toBe(false)
    })

    it('is blocked by DNT when GPC is not set', () => {
      setNavigatorDoNotTrack('1')
      setNavigatorGlobalPrivacyControl(undefined)
      expect(isTrackingAllowedByPrivacySignals()).toBe(false)
    })

    it('allows tracking when neither signal is set', () => {
      setNavigatorDoNotTrack(undefined)
      setNavigatorGlobalPrivacyControl(undefined)
      expect(isTrackingAllowedByPrivacySignals()).toBe(true)
    })
  })
})
