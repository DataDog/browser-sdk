import type { RawError, Duration, BufferedData } from '@datadog/browser-core'
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
  BufferedObservable,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  createNewEvent,
  interceptRequests,
  mockClock,
  mockEventBridge,
  registerCleanupTask,
  createFakeTelemetryObject,
} from '@datadog/browser-core/test'
import type { RumSessionManagerMock } from '../../test'
import { createRumSessionManagerMock, mockRumConfiguration, noopProfilerApi, noopRecorderApi } from '../../test'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL } from '../domain/view/trackViews'
import type { RumEvent, RumViewEvent } from '../rumEvent.types'
import type { RumConfiguration } from '../domain/configuration'
import { RumEventType } from '../rawRumEvent.types'
import { createCustomVitalsState } from '../domain/vital/vitalCollection'
import { createHooks } from '../domain/hooks'
import type { RumSessionManager } from '../domain/rumSessionManager'
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
  reportError: (error: RawError) => void
) {
  const hooks = createHooks()

  const { stop: rumEventCollectionStop } = startRumEventCollection(
    lifeCycle,
    hooks,
    configuration,
    sessionManager,
    noopRecorderApi,
    undefined,
    createCustomVitalsState(),
    new Observable(),
    undefined,
    reportError
  )

  return {
    stop: () => {
      rumEventCollectionStop()
    },
  }
}

describe('rum session', () => {
  let serverRumEvents: RumEvent[]
  let lifeCycle: LifeCycle
  let sessionManager: RumSessionManagerMock

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    sessionManager = createRumSessionManagerMock().setId('42')

    serverRumEvents = collectServerEvents(lifeCycle)
    const { stop } = startRumStub(lifeCycle, mockRumConfiguration(), sessionManager, noop)

    registerCleanupTask(stop)
  })

  it('when the session is renewed, a new view event should be sent', () => {
    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].type).toEqual('view')
    expect(serverRumEvents[0].session.id).toEqual('42')

    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
    expect(serverRumEvents.length).toEqual(2)

    sessionManager.setId('43')
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

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

    serverRumEvents = collectServerEvents(lifeCycle)
    const { stop } = startRumStub(lifeCycle, mockRumConfiguration(), sessionManager, noop)

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
      createCustomVitalsState(),
      new BufferedObservable<BufferedData>(100),
      createFakeTelemetryObject(),
      createHooks(),
      'rum'
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

  it('sends a view update with the correct sdk name', () => {
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
    expect(lastRumViewEvent._dd.sdk_name).toBe('rum')
  })
})
