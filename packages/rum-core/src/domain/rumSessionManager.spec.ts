import {
  COOKIE_ACCESS_DELAY,
  getCookie,
  isIE,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManager,
  ONE_SECOND,
  RelativeTime,
} from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'
import { RumConfiguration, validateAndBuildRumConfiguration } from './configuration'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RUM_SESSION_KEY, RumTrackingType, startRumSessionManager } from './rumSessionManager'

function setupDraws({ tracked, trackedWithReplay }: { tracked?: boolean; trackedWithReplay?: boolean }) {
  spyOn(Math, 'random').and.returnValues(tracked ? 0 : 1, trackedWithReplay ? 0 : 1)
}

describe('rum session manager', () => {
  const DURATION = 123456
  const configuration: RumConfiguration = {
    ...validateAndBuildRumConfiguration({ clientToken: 'xxx', applicationId: 'xxx' })!,
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
    stopSessionManager()
    // flush pending callbacks to avoid random failures
    clock.tick(new Date().getTime())
    clock.cleanup()
  })

  describe('cookie storage', () => {
    it('when tracked with replay plan should store session type and id', () => {
      setupDraws({ tracked: true, trackedWithReplay: true })

      startRumSessionManager(configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_REPLAY}`)
      expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
    })

    it('when tracked with lite plan should store session type and id', () => {
      setupDraws({ tracked: true, trackedWithReplay: false })

      startRumSessionManager(configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_LITE}`)
      expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
    })

    it('when not tracked should store session type', () => {
      setupDraws({ tracked: false })

      startRumSessionManager(configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.NOT_TRACKED}`)
      expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
    })

    it('when tracked should keep existing session type and id', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)

      startRumSessionManager(configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_REPLAY}`)
      expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
    })

    it('when not tracked should keep existing session type', () => {
      setCookie(SESSION_COOKIE_NAME, 'rum=0', DURATION)

      startRumSessionManager(configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.NOT_TRACKED}`)
    })

    it('should renew on activity after expiration', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      startRumSessionManager(configuration, lifeCycle)

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

  describe('findSession', () => {
    it('should return the current session', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      expect(rumSessionManager.findTrackedSession()!.id).toBe('abcdef')
    })

    it('should return undefined if the session is not tracked', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=0', DURATION)
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      expect(rumSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return undefined if the session has expired', () => {
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return session corresponding to start time', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(rumSessionManager.findTrackedSession()).toBeUndefined()
      expect(rumSessionManager.findTrackedSession(0 as RelativeTime)!.id).toBe('abcdef')
    })

    it('should return session with replay plan', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      expect(rumSessionManager.findTrackedSession()!.hasReplayPlan).toBeTrue()
      expect(rumSessionManager.findTrackedSession()!.hasLitePlan).toBeFalse()
    })

    it('should return session with lite plan', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=2', DURATION)
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      expect(rumSessionManager.findTrackedSession()!.hasReplayPlan).toBeFalse()
      expect(rumSessionManager.findTrackedSession()!.hasLitePlan).toBeTrue()
    })
  })
})
