import { isIE } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { RumPerformanceNavigationTiming } from '../browser/performanceCollection'

import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD } from '../domain/rumEventsCollection/view/trackViews'
import { startRumEventCollection } from './rum'

interface ServerRumEvent {
  application_id: string
  date: number
  type: string
  evt: {
    category: string
  }
  session_id: string
  session: {
    id: string
  }
  view: {
    id: string
    referrer: string
    url: string
  }
}

function collectServerEvents(lifeCycle: LifeCycle) {
  const serverRumEvents: ServerRumEvent[] = []
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, ({ serverRumEvent }) => {
    serverRumEvents.push(serverRumEvent as any)
  })
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_V2_COLLECTED, ({ serverRumEvent }) => {
    serverRumEvents.push(serverRumEvent as any)
  })
  return serverRumEvents
}

describe('rum session', () => {
  let setupBuilder: TestSetupBuilder
  let serverRumEvents: ServerRumEvent[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }

    setupBuilder = setup().beforeBuild(({ applicationId, location, lifeCycle, configuration, session }) => {
      serverRumEvents = collectServerEvents(lifeCycle)
      return startRumEventCollection(applicationId, location, lifeCycle, configuration, session, () => ({}))
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('when the session is renewed, a new view event should be sent (v1)', () => {
    let sessionId = '42'
    const { lifeCycle } = setupBuilder
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .withConfiguration({
        isEnabled: () => false,
      })
      .build()

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].evt.category).toEqual('view')
    expect(serverRumEvents[0].session_id).toEqual('42')

    sessionId = '43'
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(serverRumEvents.length).toEqual(2)

    // New view event
    expect(serverRumEvents[1].evt.category).toEqual('view')
    expect(serverRumEvents[1].session_id).toEqual('43')
    expect(serverRumEvents[1].view.id).not.toEqual(serverRumEvents[0].view.id)
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
  let serverRumEvents: ServerRumEvent[]

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
      .beforeBuild(({ applicationId, location, lifeCycle, configuration, session }) => {
        serverRumEvents = collectServerEvents(lifeCycle)
        return startRumEventCollection(applicationId, location, lifeCycle, configuration, session, () => ({}))
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should send a view update regularly (v1)', () => {
    const { clock } = setupBuilder
      .withConfiguration({
        isEnabled: () => false,
      })
      .build()

    // clear initial events
    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.9)
    serverRumEvents.length = 0

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    // view update
    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].evt.category).toEqual('view')

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

    // view update
    expect(serverRumEvents.length).toEqual(2)
    expect(serverRumEvents[1].evt.category).toEqual('view')
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
    domComplete: 456,
    domContentLoadedEventEnd: 345,
    domInteractive: 234,
    entryType: 'navigation',
    loadEventEnd: 567,
  }
  const VIEW_DURATION = 1000

  let setupBuilder: TestSetupBuilder
  let serverRumEvents: ServerRumEvent[]

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ applicationId, location, lifeCycle, configuration, session }) => {
      serverRumEvents = collectServerEvents(lifeCycle)
      return startRumEventCollection(applicationId, location, lifeCycle, configuration, session, () => ({}))
    })
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
    const { lifeCycle, clock } = setupBuilder
      .withFakeClock()
      .withFakeLocation('http://foo.com/')
      .build()

    clock.tick(VIEW_DURATION)

    history.pushState({}, '', '/bar')

    serverRumEvents.length = 0

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(serverRumEvents.length).toEqual(1)
    expect(serverRumEvents[0].view.url).toEqual('http://foo.com/')
  })
})
