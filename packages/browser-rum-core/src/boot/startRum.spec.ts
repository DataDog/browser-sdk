import { ONE_SECOND, toServerDuration, relativeNow, relativeToClocks } from '@datadog/js-core/time'
import type { Duration } from '@datadog/js-core/time'
import type { BufferedData, SessionManager } from '@datadog/browser-core'
import { Observable, findLast, noop, createIdentityEncoder, BufferedObservable } from '@datadog/browser-core'
import type { Clock, SessionManagerMock } from '@datadog/browser-core/test'
import {
  createNewEvent,
  interceptRequests,
  mockClock,
  mockEventBridge,
  registerCleanupTask,
  createFakeTelemetryObject,
  createSessionManagerMock,
} from '@datadog/browser-core/test'
import { mockRumConfiguration, noopProfilerApi, noopRecorderApi } from '../../test'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL } from '../domain/view/trackViews'
import type { RumEvent, RumViewEvent } from '../rumEvent.types'
import type { RumConfiguration } from '../domain/configuration'
import { RumEventType } from '../rawRumEvent.types'
import { createHooks } from '../domain/hooks'
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
  sessionManager: SessionManager,
  reportError: (message: string) => void
) {
  const hooks = createHooks()

  const { stop: rumEventCollectionStop } = startRumEventCollection(
    lifeCycle,
    hooks,
    configuration,
    sessionManager,
    noopRecorderApi,
    undefined,
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

describe('session expiration lifecycle', () => {
  it('notifies session expiration with clocks captured when the session expires', () => {
    const clock = mockClock()
    const sessionManager = createSessionManagerMock()
    const notifySpy = spyOn(LifeCycle.prototype, 'notify').and.callThrough()
    const { stop } = startRum(
      mockRumConfiguration(),
      sessionManager,
      noopRecorderApi,
      noopProfilerApi,
      undefined,
      createIdentityEncoder,
      new BufferedObservable<BufferedData>(100),
      createFakeTelemetryObject(),
      createHooks()
    )
    registerCleanupTask(stop)

    clock.tick(123)
    const endClocks = relativeToClocks(relativeNow())
    sessionManager.expire()

    expect(notifySpy).toHaveBeenCalledWith(LifeCycleEventType.SESSION_EXPIRED, { endClocks })
  })
})

describe('rum session', () => {
  let serverRumEvents: RumEvent[]
  let clock: Clock
  let lifeCycle: LifeCycle
  let sessionManager: SessionManagerMock

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    clock = mockClock()
    sessionManager = createSessionManagerMock().setId('42')

    serverRumEvents = collectServerEvents(lifeCycle)
    const { stop } = startRumStub(lifeCycle, mockRumConfiguration(), sessionManager, noop)

    registerCleanupTask(stop)
  })

  it('when the session is renewed, a new view event should be sent', () => {
    const getViewEvents = () =>
      serverRumEvents.filter((event): event is RumViewEvent => event.type === RumEventType.VIEW)

    clock.tick(0)
    expect(getViewEvents().length).toEqual(1)
    expect(getViewEvents()[0].session.id).toEqual('42')

    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, { endClocks: relativeToClocks(relativeNow()) })
    expect(getViewEvents().length).toEqual(2)

    sessionManager.setId('43')
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    clock.tick(0)

    const viewEvents = getViewEvents()
    expect(viewEvents.length).toEqual(3)
    expect(viewEvents[2].session.id).toEqual('43')
    expect(viewEvents[2].view.id).not.toEqual(viewEvents[0].view.id)
  })
})

describe('rum session keep alive', () => {
  let lifeCycle: LifeCycle
  let clock: Clock
  let sessionManager: SessionManagerMock
  let serverRumEvents: RumEvent[]

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    clock = mockClock()
    sessionManager = createSessionManagerMock().setId('1234')

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
      createSessionManagerMock(),
      noopRecorderApi,
      noopProfilerApi,
      undefined,
      createIdentityEncoder,
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
