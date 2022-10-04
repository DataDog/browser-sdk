import type { RelativeTime } from '@datadog/browser-core'
import {
  COOKIE_ACCESS_DELAY,
  getCookie,
  isIE,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManager,
  ONE_SECOND,
} from '@datadog/browser-core'
import type { Clock } from '../../../core/test/specHelper'
import { mockClock } from '../../../core/test/specHelper'
import type { RumConfiguration } from './configuration'
import { validateAndBuildRumConfiguration } from './configuration'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RUM_SESSION_KEY, RumTrackingType, startRumSessionManager, RumSessionPlan } from './rumSessionManager'

describe('rum session manager', () => {
  const DURATION = 123456
  let configuration: RumConfiguration
  let lifeCycle: LifeCycle
  let expireSessionSpy: jasmine.Spy
  let renewSessionSpy: jasmine.Spy
  let clock: Clock

  function setupDraws({
    tracked,
    trackedWithSessionReplay,
  }: {
    tracked?: boolean
    trackedWithSessionReplay?: boolean
  }) {
    configuration.sampleRate = tracked ? 100 : 0
    configuration.sessionReplaySampleRate = trackedWithSessionReplay ? 100 : 0
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    configuration = {
      ...validateAndBuildRumConfiguration({ clientToken: 'xxx', applicationId: 'xxx' })!,
      sampleRate: 50,
      sessionReplaySampleRate: 50,
      trackResources: true,
      trackLongTasks: true,
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
    it('when tracked with session replay should store session type and id', () => {
      setupDraws({ tracked: true, trackedWithSessionReplay: true })

      startRumSessionManager(configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(
        `${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITH_SESSION_REPLAY}`
      )
      expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
    })

    it('when tracked without session replay should store session type and id', () => {
      setupDraws({ tracked: true, trackedWithSessionReplay: false })

      startRumSessionManager(configuration, lifeCycle)

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(
        `${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY}`
      )
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
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(
        `${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITH_SESSION_REPLAY}`
      )
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

      setupDraws({ tracked: true, trackedWithSessionReplay: true })
      document.dispatchEvent(new CustomEvent('click'))

      expect(expireSessionSpy).toHaveBeenCalled()
      expect(renewSessionSpy).toHaveBeenCalled()
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(
        `${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITH_SESSION_REPLAY}`
      )
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

    it('should return session with plan WITH_SESSION_REPLAY', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      expect(rumSessionManager.findTrackedSession()!.plan).toBe(RumSessionPlan.WITH_SESSION_REPLAY)
    })

    it('should return session with plan WITHOUT_SESSION_REPLAY', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=2', DURATION)
      const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
      expect(rumSessionManager.findTrackedSession()!.plan).toBe(RumSessionPlan.WITHOUT_SESSION_REPLAY)
    })
  })

  describe('session behaviors', () => {
    ;[
      {
        description:
          'WITH_SESSION_REPLAY plan without trackResources/LongTasks should have replay, no resources and no long tasks',
        trackedWithSessionReplay: true,
        oldPlansBehavior: false,
        trackResources: undefined,
        trackLongTasks: undefined,
        expectSessionReplay: true,
        expectResources: false,
        expectLongTasks: false,
      },
      {
        description:
          'WITHOUT_SESSION_REPLAY plan without trackResources/LongTasks should have no replay, no resources and no long tasks',
        trackedWithSessionReplay: false,
        oldPlansBehavior: false,
        trackResources: undefined,
        trackLongTasks: undefined,
        expectSessionReplay: false,
        expectResources: false,
        expectLongTasks: false,
      },
      {
        description:
          'WITH_SESSION_REPLAY plan with trackResources/LongTasks=false should have replay, no resources and no long tasks',
        trackedWithSessionReplay: true,
        oldPlansBehavior: false,
        trackResources: false,
        trackLongTasks: false,
        expectSessionReplay: true,
        expectResources: false,
        expectLongTasks: false,
      },
      {
        description:
          'WITHOUT_SESSION_REPLAY plan with trackResources/LongTasks=false should have no replay, no resources and no long tasks',
        trackedWithSessionReplay: false,
        oldPlansBehavior: false,
        trackResources: false,
        trackLongTasks: false,
        expectSessionReplay: false,
        expectResources: false,
        expectLongTasks: false,
      },
      {
        description:
          'WITH_SESSION_REPLAY plan with trackResources/LongTasks=true should have replay, resources and long tasks',
        trackedWithSessionReplay: true,
        oldPlansBehavior: true,
        trackResources: true,
        trackLongTasks: true,
        expectSessionReplay: true,
        expectResources: true,
        expectLongTasks: true,
      },
      {
        description:
          'WITHOUT_SESSION_REPLAY plan with trackResources/LongTasks=true should have no replay, resources and long tasks',
        trackedWithSessionReplay: false,
        oldPlansBehavior: false,
        trackResources: true,
        trackLongTasks: true,
        expectSessionReplay: false,
        expectResources: true,
        expectLongTasks: true,
      },
      {
        description:
          'old WITH_SESSION_REPLAY plan without trackResources/LongTasks should have replay, resources and long tasks',
        trackedWithSessionReplay: true,
        oldPlansBehavior: true,
        trackResources: undefined,
        trackLongTasks: undefined,
        expectSessionReplay: true,
        expectResources: true,
        expectLongTasks: true,
      },
      {
        description:
          'old WITHOUT_SESSION_REPLAY plan without trackResources/LongTasks should have no replay, no resources and no long tasks',
        trackedWithSessionReplay: false,
        oldPlansBehavior: true,
        trackResources: undefined,
        trackLongTasks: undefined,
        expectSessionReplay: false,
        expectResources: false,
        expectLongTasks: false,
      },
      {
        description:
          'old WITH_SESSION_REPLAY plan with trackResources/LongTasks=false should have replay, no resources and no long tasks',
        trackedWithSessionReplay: true,
        oldPlansBehavior: true,
        trackResources: false,
        trackLongTasks: false,
        expectSessionReplay: true,
        expectResources: false,
        expectLongTasks: false,
      },
      {
        description:
          'old WITHOUT_SESSION_REPLAY plan with trackResources/LongTasks=false should have no replay, no resources and no long tasks',
        trackedWithSessionReplay: false,
        oldPlansBehavior: true,
        trackResources: false,
        trackLongTasks: false,
        expectSessionReplay: false,
        expectResources: false,
        expectLongTasks: false,
      },
      {
        description:
          'old WITH_SESSION_REPLAY plan with trackResources/LongTasks=true should have replay, resources and long tasks',
        trackedWithSessionReplay: true,
        oldPlansBehavior: true,
        trackResources: true,
        trackLongTasks: true,
        expectSessionReplay: true,
        expectResources: true,
        expectLongTasks: true,
      },
      {
        description:
          'old WITHOUT_SESSION_REPLAY plan with trackResources/LongTasks=true should have no replay, resources and long tasks',
        trackedWithSessionReplay: false,
        oldPlansBehavior: true,
        trackResources: true,
        trackLongTasks: true,
        expectSessionReplay: false,
        expectResources: true,
        expectLongTasks: true,
      },
    ].forEach(
      ({
        description,
        trackedWithSessionReplay,
        oldPlansBehavior,
        trackResources,
        trackLongTasks,
        expectSessionReplay,
        expectResources,
        expectLongTasks,
      }: {
        description: string
        trackedWithSessionReplay: boolean
        oldPlansBehavior: boolean
        trackResources: boolean | undefined
        trackLongTasks: boolean | undefined
        expectSessionReplay: boolean
        expectResources: boolean
        expectLongTasks: boolean
      }) => {
        it(description, () => {
          configuration = {
            ...configuration,
            trackResources,
            trackLongTasks,
            oldPlansBehavior,
          }

          setupDraws({ tracked: true, trackedWithSessionReplay })

          const rumSessionManager = startRumSessionManager(configuration, lifeCycle)
          expect(rumSessionManager.findTrackedSession()!.sessionReplayAllowed).toBe(expectSessionReplay)
          expect(rumSessionManager.findTrackedSession()!.resourceAllowed).toBe(expectResources)
          expect(rumSessionManager.findTrackedSession()!.longTaskAllowed).toBe(expectLongTasks)
        })
      }
    )
  })
})
