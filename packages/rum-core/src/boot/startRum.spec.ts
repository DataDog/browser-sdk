import { RelativeTime, Configuration, Observable, noop, relativeNow } from '@datadog/browser-core'
import { RumSession } from '@datadog/browser-rum-core'
import { createRumSessionMock, RumSessionMock } from '../../test/mockRumSession'
import { isIE } from '../../../core/test/specHelper'
import { noopRecorderApi, setup, TestSetupBuilder } from '../../test/specHelper'
import { RumPerformanceNavigationTiming, RumPerformanceEntry } from '../browser/performanceCollection'

import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD } from '../domain/rumEventsCollection/view/trackViews'
import { startViewCollection } from '../domain/rumEventsCollection/view/viewCollection'
import { RumEvent } from '../rumEvent.types'
import { LocationChange } from '../browser/locationChangeObservable'
import { startLongTaskCollection } from '../domain/rumEventsCollection/longTask/longTaskCollection'
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
  domMutationObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>
) {
  const { stop: rumEventCollectionStop, foregroundContexts } = startRumEventCollection(
    applicationId,
    lifeCycle,
    configuration,
    location,
    session,
    locationChangeObservable,
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
    locationChangeObservable,
    foregroundContexts,
    noopRecorderApi
  )

  startLongTaskCollection(lifeCycle)
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
      ({
        applicationId,
        location,
        lifeCycle,
        configuration,
        session,
        domMutationObservable,
        locationChangeObservable,
      }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRum(
          applicationId,
          lifeCycle,
          configuration,
          session,
          location,
          domMutationObservable,
          locationChangeObservable
        )
      }
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('when the session is renewed, a new view event should be sent', () => {
    const session = createRumSessionMock().setId('42')
    const { lifeCycle } = setupBuilder.withSession(session).build()

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].type).toEqual('view')
    expect(serverRumEvents[0].session.id).toEqual('42')

    session.setId('43')
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(serverRumEvents.length).toEqual(2)

    // New view event
    expect(serverRumEvents[1].type).toEqual('view')
    expect(serverRumEvents[1].session.id).toEqual('43')
    expect(serverRumEvents[1].view.id).not.toEqual(serverRumEvents[0].view.id)
  })
})

describe('rum session keep alive', () => {
  let session: RumSessionMock
  let setupBuilder: TestSetupBuilder
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    session = createRumSessionMock().setId('1234')
    setupBuilder = setup()
      .withFakeClock()
      .withSession(session)
      .beforeBuild(
        ({
          applicationId,
          location,
          lifeCycle,
          configuration,
          session,
          domMutationObservable,
          locationChangeObservable,
        }) => {
          serverRumEvents = collectServerEvents(lifeCycle)
          return startRum(
            applicationId,
            lifeCycle,
            configuration,
            session,
            location,
            domMutationObservable,
            locationChangeObservable
          )
        }
      )
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
    session.setNotTracked()

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    expect(serverRumEvents.length).toEqual(0)
  })
})

describe('rum events url', () => {
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
      ({
        applicationId,
        location,
        lifeCycle,
        configuration,
        session,
        domMutationObservable,
        locationChangeObservable,
      }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRum(
          applicationId,
          lifeCycle,
          configuration,
          session,
          location,
          domMutationObservable,
          locationChangeObservable
        )
      }
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should attach the url corresponding to the start of the event', () => {
    const { lifeCycle, clock, changeLocation } = setupBuilder
      .withFakeClock()
      .withFakeLocation('http://foo.com/')
      .build()
    clock.tick(10)
    changeLocation('http://foo.com/?bar=bar')
    clock.tick(10)
    changeLocation('http://foo.com/?bar=qux')

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
      entryType: 'longtask',
      startTime: relativeNow() - 5,
      toJSON: noop,
      duration: 5,
    } as RumPerformanceEntry)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(serverRumEvents.length).toBe(3)
    const [firstViewUpdate, longTaskEvent, lastViewUpdate] = serverRumEvents

    expect(firstViewUpdate.view.url).toBe('http://foo.com/')
    expect(lastViewUpdate.view.url).toBe('http://foo.com/')

    expect(longTaskEvent.view.url).toBe('http://foo.com/?bar=bar')
  })

  it('should keep the same URL when updating a view ended by a URL change', () => {
    const { changeLocation } = setupBuilder.withFakeLocation('http://foo.com/').build()

    serverRumEvents.length = 0

    changeLocation('/bar')

    expect(serverRumEvents.length).toEqual(2)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
    expect(serverRumEvents[1].view.url).toEqual('http://foo.com/bar')
  })

  it('should keep the same URL when updating an ended view', () => {
    const { lifeCycle, clock, changeLocation } = setupBuilder
      .withFakeClock()
      .withFakeLocation('http://foo.com/')
      .build()

    clock.tick(VIEW_DURATION)

    changeLocation('/bar')

    serverRumEvents.length = 0

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
  })
})
