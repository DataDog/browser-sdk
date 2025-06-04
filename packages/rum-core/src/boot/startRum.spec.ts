import type { RawError, Duration, RelativeTime } from '@datadog/browser-core'
import {
  Observable,
  stopSessionManager,
  toServerDuration,
  ONE_SECOND,
  findLast,
  noop,
  relativeNow,
  createIdentityEncoder,
  createTrackingConsentState,
  TrackingConsent,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  createNewEvent,
  interceptRequests,
  mockClock,
  mockEventBridge,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import type { RumSessionManagerMock } from '../../test'
import {
  createPerformanceEntry,
  createRumSessionManagerMock,
  mockDocumentReadyState,
  mockPageStateHistory,
  mockPerformanceObserver,
  mockRumConfiguration,
  noopProfilerApi,
  noopRecorderApi,
  setupLocationObserver,
} from '../../test'
import { RumPerformanceEntryType } from '../browser/performanceObservable'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD } from '../domain/view/trackViews'
import { startViewCollection } from '../domain/view/viewCollection'
import type { RumEvent, RumViewEvent } from '../rumEvent.types'
import type { LocationChange } from '../browser/locationChangeObservable'
import { startLongAnimationFrameCollection } from '../domain/longAnimationFrame/longAnimationFrameCollection'
import type { RumConfiguration } from '../domain/configuration'
import { RumEventType } from '../rawRumEvent.types'
import type { PageStateHistory } from '../domain/contexts/pageStateHistory'
import { createCustomVitalsState } from '../domain/vital/vitalCollection'
import { startUrlContexts } from '../domain/contexts/urlContexts'
import { startSessionContext } from '../domain/contexts/sessionContext'
import { createHooks } from '../domain/hooks'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { RumMutationRecord } from '../browser/domMutationObservable'
import { startViewHistory } from '../domain/contexts/viewHistory'
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
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  pageStateHistory: PageStateHistory,
  reportError: (error: RawError) => void
) {
  const hooks = createHooks()
  const viewHistory = startViewHistory(lifeCycle)
  const urlContexts = startUrlContexts(lifeCycle, hooks, locationChangeObservable, location)
  startSessionContext(hooks, sessionManager, noopRecorderApi, viewHistory)

  const { stop: rumEventCollectionStop } = startRumEventCollection(
    lifeCycle,
    hooks,
    configuration,
    pageStateHistory,
    domMutationObservable,
    windowOpenObservable,
    reportError
  )
  const { stop: viewCollectionStop } = startViewCollection(
    lifeCycle,
    hooks,
    configuration,
    location,
    domMutationObservable,
    windowOpenObservable,
    locationChangeObservable,
    noopRecorderApi,
    viewHistory
  )

  startLongAnimationFrameCollection(lifeCycle, configuration)
  return {
    stop: () => {
      viewHistory.stop()
      urlContexts.stop()
      rumEventCollectionStop()
      viewCollectionStop()
    },
  }
}

describe('rum session', () => {
  let serverRumEvents: RumEvent[]
  let clock: Clock
  let lifeCycle: LifeCycle
  let sessionManager: RumSessionManagerMock

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    clock = mockClock()
    sessionManager = createRumSessionManagerMock().setId('42')
    const domMutationObservable = new Observable<RumMutationRecord[]>()
    const windowOpenObservable = new Observable<void>()
    const { locationChangeObservable } = setupLocationObserver()

    serverRumEvents = collectServerEvents(lifeCycle)
    const { stop } = startRumStub(
      lifeCycle,
      mockRumConfiguration(),
      sessionManager,
      location,
      domMutationObservable,
      windowOpenObservable,
      locationChangeObservable,
      mockPageStateHistory(),
      noop
    )

    registerCleanupTask(stop)
  })

  it('when the session is renewed, a new view event should be sent', () => {
    clock.tick(0)
    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].type).toEqual('view')
    expect(serverRumEvents[0].session.id).toEqual('42')

    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
    expect(serverRumEvents.length).toEqual(2)

    sessionManager.setId('43')
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    clock.tick(0)

    expect(serverRumEvents.length).toEqual(3)

    // New view event
    expect(serverRumEvents[2].type).toEqual('view')
    expect(serverRumEvents[2].session.id).toEqual('43')
    expect(serverRumEvents[2].view.id).not.toEqual(serverRumEvents[0].view.id)
  })
})

describe('rum session keep alive', () => {
  let lifeCycle: LifeCycle
  let clock: Clock
  let sessionManager: RumSessionManagerMock
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    clock = mockClock()
    sessionManager = createRumSessionManagerMock().setId('1234')
    const domMutationObservable = new Observable<RumMutationRecord[]>()
    const windowOpenObservable = new Observable<void>()
    const { locationChangeObservable } = setupLocationObserver()

    serverRumEvents = collectServerEvents(lifeCycle)
    const { stop } = startRumStub(
      lifeCycle,
      mockRumConfiguration(),
      sessionManager,
      location,
      domMutationObservable,
      windowOpenObservable,
      locationChangeObservable,
      mockPageStateHistory(),
      noop
    )

    registerCleanupTask(() => {
      stop()
    })
  })

  it('should send a view update regularly', () => {
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

  let changeLocation: (to: string) => void
  let lifeCycle: LifeCycle
  let serverRumEvents: RumEvent[]
  let stop: () => void

  function setupViewUrlTest() {
    const sessionManager = createRumSessionManagerMock().setId('1234')
    const domMutationObservable = new Observable<RumMutationRecord[]>()
    const windowOpenObservable = new Observable<void>()
    const locationSetupResult = setupLocationObserver('http://foo.com/')
    changeLocation = locationSetupResult.changeLocation

    const startResult = startRumStub(
      lifeCycle,
      mockRumConfiguration(),
      sessionManager,
      locationSetupResult.fakeLocation,
      domMutationObservable,
      windowOpenObservable,
      locationSetupResult.locationChangeObservable,
      mockPageStateHistory(),
      noop
    )

    stop = startResult.stop
  }

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    serverRumEvents = collectServerEvents(lifeCycle)

    registerCleanupTask(() => {
      stop()
    })
  })

  it('should keep the same URL when updating a view ended by a URL change', () => {
    const clock = mockClock()
    setupViewUrlTest()
    serverRumEvents.length = 0

    changeLocation('/bar')
    clock.tick(0)

    expect(serverRumEvents.length).toEqual(2)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
    expect(serverRumEvents[1].view.url).toEqual('http://foo.com/bar')
  })

  it('should attach the url corresponding to the start of the event', () => {
    const clock = mockClock()
    const { notifyPerformanceEntries } = mockPerformanceObserver()

    setupViewUrlTest()
    clock.tick(10)
    changeLocation('http://foo.com/?bar=bar')
    clock.tick(10)
    changeLocation('http://foo.com/?bar=qux')

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME, {
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

  it('should keep the same URL when updating an ended view', () => {
    const clock = mockClock()
    const { triggerOnLoad } = mockDocumentReadyState()
    setupViewUrlTest()

    clock.tick(VIEW_DURATION)

    changeLocation('/bar')
    clock.tick(0)

    serverRumEvents.length = 0

    triggerOnLoad()
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
  })
})

describe('view events', () => {
  let clock: Clock
  let interceptor: ReturnType<typeof interceptRequests>
  let stop: () => void

  function setupViewCollectionTest() {
    const startResult = startRum(
      mockRumConfiguration(),
      noopRecorderApi,
      noopProfilerApi,
      undefined,
      createIdentityEncoder,
      createTrackingConsentState(TrackingConsent.GRANTED),
      createCustomVitalsState()
    )

    stop = startResult.stop
    interceptor = interceptRequests()
  }

  beforeEach(() => {
    clock = mockClock()

    registerCleanupTask(() => {
      stop()
      stopSessionManager()
    })
  })

  it('sends a view update on page unload when bridge is absent', () => {
    // Note: this test is intentionally very high level to make sure the view update is correctly
    // made right before flushing the Batch.

    // Arbitrary duration to simulate a non-zero view duration
    const VIEW_DURATION = ONE_SECOND as Duration

    setupViewCollectionTest()

    clock.tick(VIEW_DURATION - relativeNow())
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
    const eventBridge = mockEventBridge()
    const sendSpy = spyOn(eventBridge, 'send')

    const VIEW_DURATION = ONE_SECOND as Duration

    setupViewCollectionTest()

    clock.tick(VIEW_DURATION - relativeNow())
    window.dispatchEvent(createNewEvent('beforeunload'))

    const lastBridgeMessage = JSON.parse(sendSpy.calls.mostRecent().args[0]) as {
      eventType: 'rum'
      event: RumEvent
    }
    expect(lastBridgeMessage.event.type).toBe('view')
    expect(lastBridgeMessage.event.view.time_spent).toBe(toServerDuration(VIEW_DURATION))
  })
})
