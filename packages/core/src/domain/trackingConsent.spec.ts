import { mockExperimentalFeatures } from '../../test'
import { ExperimentalFeature } from '../tools/experimentalFeatures'
import { TrackingConsent, createTrackingConsentState } from './trackingConsent'

describe('createTrackingConsentState', () => {
  describe('with tracking_consent enabled', () => {
    beforeEach(() => {
      mockExperimentalFeatures([ExperimentalFeature.TRACKING_CONSENT])
    })

    it('creates a tracking consent state', () => {
      const trackingConsentState = createTrackingConsentState()
      expect(trackingConsentState).toBeDefined()
    })

    it('defaults to not granted', () => {
      const trackingConsentState = createTrackingConsentState()
      expect(trackingConsentState.isGranted()).toBeFalse()
    })

    it('can be created with a default consent state', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      expect(trackingConsentState.isGranted()).toBeTrue()
    })

    it('can be set to granted', () => {
      const trackingConsentState = createTrackingConsentState()
      trackingConsentState.set(TrackingConsent.GRANTED)
      expect(trackingConsentState.isGranted()).toBeTrue()
    })

    it('notifies when the consent is set', () => {
      const spy = jasmine.createSpy()
      const trackingConsentState = createTrackingConsentState()
      trackingConsentState.observable.subscribe(spy)
      trackingConsentState.set(TrackingConsent.GRANTED)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('can set a consent state if not defined', () => {
      const trackingConsentState = createTrackingConsentState()
      trackingConsentState.setIfNotDefined(TrackingConsent.GRANTED)
      expect(trackingConsentState.isGranted()).toBeTrue()
    })

    it('does not set a consent state if already defined', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      trackingConsentState.setIfNotDefined(TrackingConsent.NOT_GRANTED)
      expect(trackingConsentState.isGranted()).toBeTrue()
    })
  })

  describe('with tracking_consent disabled', () => {
    it('creates a tracking consent state', () => {
      const trackingConsentState = createTrackingConsentState()
      expect(trackingConsentState).toBeDefined()
    })

    it('is always granted', () => {
      let trackingConsentState = createTrackingConsentState()
      expect(trackingConsentState.isGranted()).toBeTrue()

      trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
      expect(trackingConsentState.isGranted()).toBeTrue()

      trackingConsentState = createTrackingConsentState()
      trackingConsentState.set(TrackingConsent.NOT_GRANTED)
      expect(trackingConsentState.isGranted()).toBeTrue()
    })
  })
})
