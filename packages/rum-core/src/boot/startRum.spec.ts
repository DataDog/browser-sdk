import type { Observable, RawError, Duration, RelativeTime } from '@datadog/browser-core'
import {
  stopSessionManager,
  toServerDuration,
  ONE_SECOND,
  findLast,
  noop,
  isIE,
  relativeNow,
  createIdentityEncoder,
  createCustomerDataTracker,
  createTrackingConsentState,
  TrackingConsent,
} from '@datadog/browser-core'
import {
  createNewEvent,
  interceptRequests,
  initEventBridgeStub,
  deleteEventBridgeStub,
} from '@datadog/browser-core/test'
import type { RumSessionManagerMock, TestSetupBuilder } from '../../test'
import { createPerformanceEntry, createRumSessionManagerMock, noopRecorderApi, setup } from '../../test'
import { RumPerformanceEntryType } from '../browser/performanceCollection'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD } from '../domain/view/trackViews'
import { startViewCollection } from '../domain/view/viewCollection'
import type { RumEvent, RumViewEvent } from '../rumEvent.types'
import type { LocationChange } from '../browser/locationChangeObservable'
import { startLongTaskCollection } from '../domain/longTask/longTaskCollection'
import type { RumSessionManager } from '..'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import { RumEventType } from '../rawRumEvent.types'
import { startFeatureFlagContexts } from '../domain/contexts/featureFlagContext'
import type { PageStateHistory } from '../domain/contexts/pageStateHistory'
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
  pageStateHistory: PageStateHistory,
  reportError: (error: RawError) => void
) {
  const { stop: rumEventCollectionStop } = startRumEventCollection(
    lifeCycle,
    configuration,
    location,
    sessionManager,
    locationChangeObservable,
    domMutationObservable,
    () => ({
      context: {},
      user: {},
      hasReplay: undefined,
    }),
    reportError
  )
  const { stop: viewCollectionStop } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    locationChangeObservable,
    startFeatureFlagContexts(lifeCycle, createCustomerDataTracker(noop)),
    pageStateHistory,
    noopRecorderApi
  )

  startLongTaskCollection(lifeCycle, configuration, sessionManager)
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
        location,
        lifeCycle,
        configuration,
        sessionManager,
        domMutationObservable,
        locationChangeObservable,
        pageStateHistory,
      }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRumStub(
          lifeCycle,
          configuration,
          sessionManager,
          location,
          domMutationObservable,
          locationChangeObservable,
          pageStateHistory,
          noop
        )
      }
    )
  })

  it('when the session is renewed, a new view event should be sent', () => {
    const session = createRumSessionManagerMock().setId('42')
    const { lifeCycle } = setupBuilder.withSessionManager(session).build()

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].type).toEqual('view')
    expect(serverRumEvents[0].session.id).toEqual('42')

    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
    expect(serverRumEvents.length).toEqual(2)

    session.setId('43')
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(serverRumEvents.length).toEqual(3)

    // New view event
    expect(serverRumEvents[2].type).toEqual('view')
    expect(serverRumEvents[2].session.id).toEqual('43')
    expect(serverRumEvents[2].view.id).not.toEqual(serverRumEvents[0].view.id)
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
        ({
          location,
          lifeCycle,
          configuration,
          sessionManager,
          domMutationObservable,
          locationChangeObservable,
          pageStateHistory,
        }) => {
          serverRumEvents = collectServerEvents(lifeCycle)
          return startRumStub(
            lifeCycle,
            configuration,
            sessionManager,
            location,
            domMutationObservable,
            locationChangeObservable,
            pageStateHistory,
            noop
          )
        }
      )
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
  const VIEW_DURATION = 1000

  let setupBuilder: TestSetupBuilder
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(
      ({
        location,
        lifeCycle,
        configuration,
        sessionManager,
        domMutationObservable,
        locationChangeObservable,
        pageStateHistory,
      }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRumStub(
          lifeCycle,
          configuration,
          sessionManager,
          location,
          domMutationObservable,
          locationChangeObservable,
          pageStateHistory,
          noop
        )
      }
    )
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
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK, {
        startTime: (relativeNow() - 5) as RelativeTime,
      }),
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

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
    ])
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
  })
})

describe('view events', () => {
  let setupBuilder: TestSetupBuilder
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ configuration, customerDataTrackerManager }) =>
      startRum(
        {} as RumInitConfiguration,
        configuration,
        noopRecorderApi,
        customerDataTrackerManager,
        () => ({ user: {}, context: {}, hasReplay: undefined }),
        undefined,
        createIdentityEncoder,
        createTrackingConsentState(TrackingConsent.GRANTED)
      )
    )
    interceptor = interceptRequests()
  })

  afterEach(() => {
    deleteEventBridgeStub()
    stopSessionManager()
    interceptor.restore()
  })

  it('sends a view update on page unload when bridge is absent', () => {
    // Note: this test is intentionally very high level to make sure the view update is correctly
    // made right before flushing the Batch.

    // Arbitrary duration to simulate a non-zero view duration
    const VIEW_DURATION = ONE_SECOND as Duration

    const { clock } = setupBuilder.withFakeClock().build()

    clock.tick(VIEW_DURATION)
    window.dispatchEvent(createNewEvent('beforeunload'))

    const lastRumEvents = interceptor.requests[interceptor.requests.length - 1].body
      .split('\n')
      .map((line) => JSON.parse(line) as RumEvent)
    const lastRumViewEvent = findLast(
      lastRumEvents,
      (serverRumEvent): serverRumEvent is RumViewEvent => serverRumEvent.type === RumEventType.VIEW
    )!

    expect(lastRumViewEvent.view.time_spent).toBe(toServerDuration(VIEW_DURATION))
  })

  it('sends a view update on page unload when bridge is present', () => {
    const eventBridgeStub = initEventBridgeStub()
    const sendSpy = spyOn(eventBridgeStub, 'send')

    const VIEW_DURATION = ONE_SECOND as Duration

    const { clock } = setupBuilder.withFakeClock().build()

    clock.tick(VIEW_DURATION)
    window.dispatchEvent(createNewEvent('beforeunload'))

    const lastBridgeMessage = JSON.parse(sendSpy.calls.mostRecent().args[0]) as { eventType: 'rum'; event: RumEvent }
    expect(lastBridgeMessage.event.type).toBe('view')
    expect(lastBridgeMessage.event.view.time_spent).toBe(toServerDuration(VIEW_DURATION))
  })
})
