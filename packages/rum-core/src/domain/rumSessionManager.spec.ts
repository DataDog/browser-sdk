import {
  Configuration,
  COOKIE_ACCESS_DELAY,
  DEFAULT_CONFIGURATION,
  getCookie,
  isIE,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManagement,
  ONE_SECOND,
  RelativeTime,
} from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RUM_SESSION_KEY, RumTrackingType, startRumSessionManagement } from './rumSessionManager'

function setupDraws({ tracked, trackedWithReplay }: { tracked?: boolean; trackedWithReplay?: boolean }) {
  spyOn(Math, 'random').and.returnValues(tracked ? 0 : 1, trackedWithReplay ? 0 : 1)
}

describe('rum session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    sampleRate: 50,
    replaySampleRate: 50,
  }
  let lifeCycle: LifeCycle
  let expireSessionSpy: jasmine.Spy
  let renewSessionSpy: jasmine.Spy
  let clock: Clock

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    clock = mockClock()
    expireSessionSpy = jasmine.createSpy('expireSessionSpy')
    renewSessionSpy = jasmine.createSpy('renewSessionSpy')
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, expireSessionSpy)
    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, renewSessionSpy)
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManagement()
    // flush pending callbacks to avoid random failures
    clock.tick(new Date().getTime())
    clock.cleanup()
  })

  describe('cookie storage', () => {
    it('when tracked with replay plan should store session type and id', () => {
      setupDraws({ tracked: true, trackedWithReplay: true })

      startRumSessionManagement(configuration as Configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_REPLAY}`)
      expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
    })

    it('when tracked with lite plan should store session type and id', () => {
      setupDraws({ tracked: true, trackedWithReplay: false })

      startRumSessionManagement(configuration as Configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_LITE}`)
      expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
    })

    it('when not tracked should store session type', () => {
      setupDraws({ tracked: false })

      startRumSessionManagement(configuration as Configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.NOT_TRACKED}`)
      expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
    })

    it('when tracked should keep existing session type and id', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)

      startRumSessionManagement(configuration as Configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_REPLAY}`)
      expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
    })

    it('when not tracked should keep existing session type', () => {
      setCookie(SESSION_COOKIE_NAME, 'rum=0', DURATION)

      startRumSessionManagement(configuration as Configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.NOT_TRACKED}`)
    })

    it('should renew on activity after expiration', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      startRumSessionManagement(configuration as Configuration, lifeCycle)

      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      clock.tick(COOKIE_ACCESS_DELAY)

      setupDraws({ tracked: true, trackedWithReplay: true })
      document.dispatchEvent(new CustomEvent('click'))

      expect(expireSessionSpy).toHaveBeenCalled()
      expect(renewSessionSpy).toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_REPLAY}`)
      expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
    })
  })

  describe('getId', () => {
    it('should return the session id', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      expect(rumSession.getId()).toBe('abcdef')
    })

    it('should return undefined if the session has expired', () => {
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSession.getId()).toBe(undefined)
    })

    it('should return session id corresponding to start time', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSession.getId()).toBeUndefined()
      expect(rumSession.getId(0 as RelativeTime)).toBe('abcdef')
    })
  })

  describe('isTracked', () => {
    it('should return value corresponding to start time', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSession.isTracked()).toBeFalse()
      expect(rumSession.isTracked(ONE_SECOND as RelativeTime)).toBeTrue()
    })
  })

  describe('hasReplayPlan', () => {
    it('should return true if the session has the replay plan', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      expect(rumSession.hasReplayPlan()).toBeTrue()
    })

    it('should return false if the session has expired', () => {
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSession.hasReplayPlan()).toBeFalse()
    })

    it('should return false if the session is not tracked', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=0', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      expect(rumSession.hasReplayPlan()).toBeFalse()
    })

    it('should return plan corresponding to start time', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSession.hasReplayPlan()).toBeFalse()
      expect(rumSession.hasReplayPlan(ONE_SECOND as RelativeTime)).toBeTrue()
    })
  })

  describe('hasLitePlan', () => {
    it('should return true if the session has the lite plan', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=2', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      expect(rumSession.hasLitePlan()).toBeTrue()
    })

    it('should return false if the session has expired', () => {
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSession.hasLitePlan()).toBeFalse()
    })

    it('should return false if the session is not tracked', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=0', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      expect(rumSession.hasLitePlan()).toBeFalse()
    })

    it('should return plan corresponding to start time', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=2', DURATION)
      const rumSession = startRumSessionManagement(configuration as Configuration, lifeCycle)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSession.hasLitePlan()).toBeFalse()
      expect(rumSession.hasLitePlan(ONE_SECOND as RelativeTime)).toBeTrue()
    })
  })
})
