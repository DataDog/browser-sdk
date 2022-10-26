import type { RelativeTime, Observable, RawError, Duration } from '@datadog/browser-core'
import {
  stopSessionManager,
  toServerDuration,
  ONE_SECOND,
  findLast,
  noop,
  relativeNow,
  isIE,
} from '@datadog/browser-core'
import { interceptRequests } from '../../../core/test/specHelper'
import type { RumSessionManagerMock } from '../../test/mockRumSessionManager'
import { createRumSessionManagerMock } from '../../test/mockRumSessionManager'
import type { TestSetupBuilder } from '../../test/specHelper'
import { noopRecorderApi, setup } from '../../test/specHelper'
import type { RumPerformanceNavigationTiming, RumPerformanceEntry } from '../browser/performanceCollection'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD } from '../domain/rumEventsCollection/view/trackViews'
import { startViewCollection } from '../domain/rumEventsCollection/view/viewCollection'
import type { RumEvent, RumViewEvent } from '../rumEvent.types'
import type { LocationChange } from '../browser/locationChangeObservable'
import { startLongTaskCollection } from '../domain/rumEventsCollection/longTask/longTaskCollection'
import type { RumSessionManager } from '..'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import { RumEventType } from '../rawRumEvent.types'
import { startRum, startRumEventCollection } from './startRum'

function collectServerEvents(lifeCycle: LifeCycle) {
  const serverRumEvents: RumEvent[] = []
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent) => {
    serverRumEvents.push(serverRumEvent)
  })
  return serverRumEvents
}

function startRumStub(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  location: Location,
  domMutationObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  reportError: (error: RawError) => void
) {
  const { stop: rumEventCollectionStop, foregroundContexts } = startRumEventCollection(
    lifeCycle,
    configuration,
    location,
    sessionManager,
    locationChangeObservable,
    domMutationObservable,
    () => ({
      context: {},
      user: {},
    }),
    reportError
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

  startLongTaskCollection(lifeCycle, sessionManager)
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
      ({ location, lifeCycle, configuration, sessionManager, domMutationObservable, locationChangeObservable }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRumStub(
          lifeCycle,
          configuration,
          sessionManager,
          location,
          domMutationObservable,
          locationChangeObservable,
          noop
        )
      }
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('when the session is renewed, a new view event should be sent', () => {
    const session = createRumSessionManagerMock().setId('42')
    const { lifeCycle } = setupBuilder.withSessionManager(session).build()

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
  let sessionManager: RumSessionManagerMock
  let setupBuilder: TestSetupBuilder
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    sessionManager = createRumSessionManagerMock().setId('1234')
    setupBuilder = setup()
      .withFakeClock()
      .withSessionManager(sessionManager)
      .beforeBuild(
        ({ location, lifeCycle, configuration, sessionManager, domMutationObservable, locationChangeObservable }) => {
          serverRumEvents = collectServerEvents(lifeCycle)
          return startRumStub(
            lifeCycle,
            configuration,
            sessionManager,
            location,
            domMutationObservable,
            locationChangeObservable,
            noop
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

  it('should not send view update when sessionManager is expired', () => {
    const { clock } = setupBuilder.build()

    // clear initial events
    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.9)
    serverRumEvents.length = 0

    // expire session
    sessionManager.setNotTracked()

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    expect(serverRumEvents.length).toEqual(0)
  })
})

describe('rum events url', () => {
  const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
    responseStart: 123 as RelativeTime,
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
      ({ location, lifeCycle, configuration, sessionManager, domMutationObservable, locationChangeObservable }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRumStub(
          lifeCycle,
          configuration,
          sessionManager,
          location,
          domMutationObservable,
          locationChangeObservable,
          noop
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

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        entryType: 'longtask',
        startTime: relativeNow() - 5,
        toJSON: noop,
        duration: 5,
      } as RumPerformanceEntry,
    ])

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

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_NAVIGATION_ENTRY])
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
  })
})

describe('view events', () => {
  let setupBuilder: TestSetupBuilder
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ configuration }) => {
      startRum({} as RumInitConfiguration, configuration, () => ({ context: {}, user: {} }), noopRecorderApi)
    })
    interceptor = interceptRequests()
  })

  afterEach(() => {
    stopSessionManager()
    setupBuilder.cleanup()
    interceptor.restore()
  })

  it('sends a view update on page unload', () => {
    // Note: this test is intentionally very high level to make sure the view update is correctly
    // made right before flushing the Batch.

    // Arbitrary duration to simulate a non-zero view duration
    const VIEW_DURATION = ONE_SECOND as Duration

    const { clock } = setupBuilder.withFakeClock().build()

    clock.tick(VIEW_DURATION)
    window.dispatchEvent(new Event('beforeunload'))

    const lastRumEvents = interceptor.requests[interceptor.requests.length - 1].body
      .split('\n')
      .map((line) => JSON.parse(line) as RumEvent)
    const lastRumViewEvent = findLast(
      lastRumEvents,
      (serverRumEvent): serverRumEvent is RumViewEvent => serverRumEvent.type === RumEventType.VIEW
    )!

    expect(lastRumViewEvent.view.time_spent).toBe(toServerDuration(VIEW_DURATION))
  })
})
