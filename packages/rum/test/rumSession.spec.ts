import { Configuration, DEFAULT_CONFIGURATION } from '@browser-agent/core/src/configuration'
import {
  cleanupActivityTracking,
  COOKIE_ACCESS_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
} from '@browser-agent/core/src/session'
import { isIE } from '@browser-agent/core/test/specHelper'
import { RUM_COOKIE_NAME, RumSessionType, startRumSession } from '../src/rumSession'

function setupDraws({ tracked, trackedWithResources }: { tracked?: boolean; trackedWithResources?: boolean }) {
  spyOn(Math, 'random').and.returnValues(tracked ? 0 : 1, trackedWithResources ? 0 : 1)
}

describe('rum session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    resourceSampleRate: 0.5,
    sampleRate: 0.5,
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
  })

  afterEach(() => {
    // flush pending callbacks to avoid random failures
    jasmine.clock().tick(new Date().getTime())
    jasmine.clock().uninstall()
    cleanupActivityTracking()
  })

  it('when tracked with resources should store session type and id', () => {
    setupDraws({ tracked: true, trackedWithResources: true })

    startRumSession(configuration as Configuration)

    expect(getCookie(RUM_COOKIE_NAME)).toEqual(RumSessionType.TRACKED_WITH_RESOURCES)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('when tracked without resources should store session type and id', () => {
    setupDraws({ tracked: true, trackedWithResources: false })

    startRumSession(configuration as Configuration)

    expect(getCookie(RUM_COOKIE_NAME)).toEqual(RumSessionType.TRACKED_WITHOUT_RESOURCES)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('when not tracked should store session type', () => {
    setupDraws({ tracked: false })

    startRumSession(configuration as Configuration)

    expect(getCookie(RUM_COOKIE_NAME)).toEqual(RumSessionType.NOT_TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(RUM_COOKIE_NAME, RumSessionType.TRACKED_WITH_RESOURCES, DURATION)
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    startRumSession(configuration as Configuration)

    expect(getCookie(RUM_COOKIE_NAME)).toEqual(RumSessionType.TRACKED_WITH_RESOURCES)
    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(RUM_COOKIE_NAME, RumSessionType.NOT_TRACKED, DURATION)

    startRumSession(configuration as Configuration)

    expect(getCookie(RUM_COOKIE_NAME)).toEqual(RumSessionType.NOT_TRACKED)
  })

  it('should renew on activity after expiration', () => {
    startRumSession(configuration as Configuration)

    setCookie(RUM_COOKIE_NAME, '', DURATION)
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(RUM_COOKIE_NAME)).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    setupDraws({ tracked: true, trackedWithResources: true })
    document.dispatchEvent(new CustomEvent('click'))

    expect(getCookie(RUM_COOKIE_NAME)).toEqual(RumSessionType.TRACKED_WITH_RESOURCES)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })
})
