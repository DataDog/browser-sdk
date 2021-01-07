import {
  Configuration,
  COOKIE_ACCESS_DELAY,
  DEFAULT_CONFIGURATION,
  getCookie,
  isIE,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManagement,
} from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RUM_SESSION_KEY, RumTrackingType, startRumSession } from './rumSession'

function setupDraws({ tracked, trackedWithResources }: { tracked?: boolean; trackedWithResources?: boolean }) {
  spyOn(Math, 'random').and.returnValues(tracked ? 0 : 1, trackedWithResources ? 0 : 1)
}

describe('rum session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    isEnabled: () => true,
    resourceSampleRate: 0.5,
    sampleRate: 0.5,
  }
  let lifeCycle: LifeCycle
  let renewSessionSpy: jasmine.Spy

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
    renewSessionSpy = jasmine.createSpy('renewSessionSpy')
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, renewSessionSpy)
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManagement()
    // flush pending callbacks to avoid random failures
    jasmine.clock().tick(new Date().getTime())
    jasmine.clock().uninstall()
  })

  it('when tracked with resources should store session type and id', () => {
    setupDraws({ tracked: true, trackedWithResources: true })

    startRumSession(configuration as Configuration, lifeCycle)

    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITH_RESOURCES}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
  })

  it('when tracked without resources should store session type and id', () => {
    setupDraws({ tracked: true, trackedWithResources: false })

    startRumSession(configuration as Configuration, lifeCycle)

    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITHOUT_RESOURCES}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
  })

  it('when not tracked should store session type', () => {
    setupDraws({ tracked: false })

    startRumSession(configuration as Configuration, lifeCycle)

    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.NOT_TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcdef&rum=1', DURATION)

    startRumSession(configuration as Configuration, lifeCycle)

    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITH_RESOURCES}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(SESSION_COOKIE_NAME, 'rum=0', DURATION)

    startRumSession(configuration as Configuration, lifeCycle)

    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startRumSession(configuration as Configuration, lifeCycle)

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    expect(renewSessionSpy).not.toHaveBeenCalled()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    setupDraws({ tracked: true, trackedWithResources: true })
    document.dispatchEvent(new CustomEvent('click'))

    expect(renewSessionSpy).toHaveBeenCalled()
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${RUM_SESSION_KEY}=${RumTrackingType.TRACKED_WITH_RESOURCES}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]/)
  })
})
