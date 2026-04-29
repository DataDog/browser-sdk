import { trackLoadingTime } from './trackLoadingTime'

describe('trackLoadingTime', () => {
  describe('initial_load', () => {
    it('returns undefined before any value is set', () => {
      const tracker = trackLoadingTime('initial_load')
      expect(tracker.get()).toBeUndefined()
    })

    it('returns loadEventTime after setLoadEvent', () => {
      const tracker = trackLoadingTime('initial_load')
      tracker.setLoadEvent(450)
      expect(tracker.get()).toBe(450)
    })

    it('ignores activityEndTime for initial_load', () => {
      const tracker = trackLoadingTime('initial_load')
      tracker.setActivityEnd(300)
      expect(tracker.get()).toBeUndefined()
    })

    it('prefers loadEventTime over activityEndTime for initial_load', () => {
      const tracker = trackLoadingTime('initial_load')
      tracker.setLoadEvent(450)
      tracker.setActivityEnd(300)
      expect(tracker.get()).toBe(450)
    })
  })

  describe('route_change', () => {
    it('returns undefined before any value is set', () => {
      const tracker = trackLoadingTime('route_change')
      expect(tracker.get()).toBeUndefined()
    })

    it('returns activityEndTime after setActivityEnd', () => {
      const tracker = trackLoadingTime('route_change')
      tracker.setActivityEnd(300)
      expect(tracker.get()).toBe(300)
    })

    it('ignores loadEventTime for route_change', () => {
      const tracker = trackLoadingTime('route_change')
      tracker.setLoadEvent(450)
      expect(tracker.get()).toBeUndefined()
    })
  })

  describe('bf_cache', () => {
    it('returns undefined before any value is set', () => {
      const tracker = trackLoadingTime('bf_cache')
      expect(tracker.get()).toBeUndefined()
    })

    it('returns activityEndTime for bf_cache', () => {
      const tracker = trackLoadingTime('bf_cache')
      tracker.setActivityEnd(200)
      expect(tracker.get()).toBe(200)
    })
  })
})
