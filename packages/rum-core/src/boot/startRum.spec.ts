import { RelativeTime, Configuration } from '@datadog/browser-core'
import { RumSession } from '@datadog/browser-rum-core'
import { isIE } from '../../../core/test/specHelper'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { DOMMutationObservable } from '../browser/domMutationObservable'
import { RumPerformanceNavigationTiming } from '../browser/performanceCollection'

import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD } from '../domain/rumEventsCollection/view/trackViews'
import { startViewCollection } from '../domain/rumEventsCollection/view/viewCollection'
import { RumEvent } from '../rumEvent.types'
import { startRumEventCollection } from './startRum'

function collectServerEvents(lifeCycle: LifeCycle) {
  const serverRumEvents: RumEvent[] = []
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent) => {
    serverRumEvents.push(serverRumEvent)
  })
  return serverRumEvents
}

function startRum(
  applicationId: string,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession,
  location: Location,
  domMutationObservable: DOMMutationObservable
) {
  const { stop: rumEventCollectionStop, foregroundContexts } = startRumEventCollection(
    applicationId,
    lifeCycle,
    configuration,
    session,
    () => ({
      context: {},
      user: {},
    })
  )
  const { stop: viewCollectionStop } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    foregroundContexts
  )
  return {
    stop: () => {
      rumEventCollectionStop()
      viewCollectionStop()
    },
  }
}

describe('rum session', () => {
  let setupBuilder: TestSetupBuilder
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }

    setupBuilder = setup().beforeBuild(
      ({ applicationId, location, lifeCycle, configuration, session, domMutationObservable }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRum(applicationId, lifeCycle, configuration, session, location, domMutationObservable)
      }
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('when the session is renewed, a new view event should be sent', () => {
    let sessionId = '42'
    const { lifeCycle } = setupBuilder
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .build()

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].type).toEqual('view')
    expect(serverRumEvents[0].session.id).toEqual('42')

    sessionId = '43'
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(serverRumEvents.length).toEqual(2)

    // New view event
    expect(serverRumEvents[1].type).toEqual('view')
    expect(serverRumEvents[1].session.id).toEqual('43')
    expect(serverRumEvents[1].view.id).not.toEqual(serverRumEvents[0].view.id)
  })
})

describe('rum session keep alive', () => {
  let isSessionTracked: boolean
  let setupBuilder: TestSetupBuilder
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    isSessionTracked = true
    setupBuilder = setup()
      .withFakeClock()
      .withSession({
        getId: () => '1234',
        isTracked: () => isSessionTracked,
        isTrackedWithResource: () => true,
      })
      .beforeBuild(({ applicationId, location, lifeCycle, configuration, session, domMutationObservable }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRum(applicationId, lifeCycle, configuration, session, location, domMutationObservable)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should send a view update regularly', () => {
    const { clock } = setupBuilder.build()

    // clear initial events
    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.9)
    serverRumEvents.length = 0

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    // view update
    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].type).toEqual('view')

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

    // view update
    expect(serverRumEvents.length).toEqual(2)
    expect(serverRumEvents[1].type).toEqual('view')
  })

  it('should not send view update when session is expired', () => {
    const { clock } = setupBuilder.build()

    // clear initial events
    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.9)
    serverRumEvents.length = 0

    // expire session
    isSessionTracked = false

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    expect(serverRumEvents.length).toEqual(0)
  })
})

describe('rum view url', () => {
  const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
    domComplete: 456 as RelativeTime,
    domContentLoadedEventEnd: 345 as RelativeTime,
    domInteractive: 234 as RelativeTime,
    entryType: 'navigation',
    loadEventEnd: 567 as RelativeTime,
  }
  const VIEW_DURATION = 1000

  let setupBuilder: TestSetupBuilder
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(
      ({ applicationId, location, lifeCycle, configuration, session, domMutationObservable }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRum(applicationId, lifeCycle, configuration, session, location, domMutationObservable)
      }
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should keep the same URL when updating a view ended by a URL change', () => {
    setupBuilder.withFakeLocation('http://foo.com/').build()

    serverRumEvents.length = 0

    history.pushState({}, '', '/bar')

    expect(serverRumEvents.length).toEqual(2)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
    expect(serverRumEvents[1].view.url).toEqual('http://foo.com/bar')
  })

  it('should keep the same URL when updating an ended view', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().withFakeLocation('http://foo.com/').build()

    clock.tick(VIEW_DURATION)

    history.pushState({}, '', '/bar')

    serverRumEvents.length = 0

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
  })
})
