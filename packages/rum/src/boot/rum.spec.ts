import { isIE } from '@datadog/browser-core'
import sinon from 'sinon'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { RumPerformanceNavigationTiming } from '../browser/performanceCollection'

import { LifeCycleEventType } from '../domain/lifeCycle'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD } from '../domain/rumEventsCollection/view/trackViews'
import { RumEvent } from '../index'

function getServerRequestBodies<T>(server: sinon.SinonFakeServer) {
  return server.requests.map((r) => JSON.parse(r.requestBody) as T)
}

function getRumMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as RumEvent
}

interface ExpectedRequestBody {
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
  }
}

describe('rum session', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }

    setupBuilder = setup()
      .withFakeServer()
      .withRum()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('when the session is renewed, a new view event should be sent (v1)', () => {
    let sessionId = '42'
    const { server, lifeCycle } = setupBuilder
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .beforeBuild((_, configuration) => {
        configuration.isEnabled = () => false
      })
      .build()

    const initialRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(initialRequests.length).toEqual(1)
    expect(initialRequests[0].evt.category).toEqual('view')
    expect(initialRequests[0].session_id).toEqual('42')

    server.requests = []
    sessionId = '43'
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    const subsequentRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(subsequentRequests.length).toEqual(1)

    // New view event
    expect(subsequentRequests[0].evt.category).toEqual('view')
    expect(subsequentRequests[0].session_id).toEqual('43')
    expect(subsequentRequests[0].view.id).not.toEqual(initialRequests[0].view.id)
  })

  it('when the session is renewed, a new view event should be sent', () => {
    let sessionId = '42'
    const { server, lifeCycle } = setupBuilder
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .build()

    const initialRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(initialRequests.length).toEqual(1)
    expect(initialRequests[0].type).toEqual('view')
    expect(initialRequests[0].session.id).toEqual('42')

    server.requests = []
    sessionId = '43'
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    const subsequentRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(subsequentRequests.length).toEqual(1)

    // New view event
    expect(subsequentRequests[0].type).toEqual('view')
    expect(subsequentRequests[0].session.id).toEqual('43')
    expect(subsequentRequests[0].view.id).not.toEqual(initialRequests[0].view.id)
  })
})

describe('rum session keep alive', () => {
  let isSessionTracked: boolean
  let requests: ExpectedRequestBody[]
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    isSessionTracked = true
    setupBuilder = setup()
      .withFakeServer()
      .withFakeClock()
      .withSession({
        getId: () => '1234',
        isTracked: () => isSessionTracked,
        isTrackedWithResource: () => true,
      })
      .withRum()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should send a view update regularly (v1)', () => {
    const { server, clock } = setupBuilder
      .beforeBuild((_, configuration) => {
        configuration.isEnabled = () => false
      })
      .build()

    // clear initial events
    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.9)
    server.requests = []

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    // view update
    requests = getServerRequestBodies<ExpectedRequestBody>(server)
    server.requests = []
    expect(requests.length).toEqual(1)
    expect(requests[0].evt.category).toEqual('view')

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

    // view update
    requests = getServerRequestBodies<ExpectedRequestBody>(server)
    server.requests = []
    expect(requests.length).toEqual(1)
    expect(requests[0].evt.category).toEqual('view')
  })

  it('should send a view update regularly', () => {
    const { server, clock } = setupBuilder.build()

    // clear initial events
    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.9)
    server.requests = []

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    // view update
    requests = getServerRequestBodies<ExpectedRequestBody>(server)
    server.requests = []
    expect(requests.length).toEqual(1)
    expect(requests[0].type).toEqual('view')

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

    // view update
    requests = getServerRequestBodies<ExpectedRequestBody>(server)
    server.requests = []
    expect(requests.length).toEqual(1)
    expect(requests[0].type).toEqual('view')
  })

  it('should not send view update when session is expired', () => {
    const { server, clock } = setupBuilder.build()

    // clear initial events
    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.9)
    server.requests = []

    // expire session
    isSessionTracked = false

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL * 0.1)

    requests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(requests.length).toEqual(0)
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

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeServer()
      .withRum()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should keep the same URL when updating a view ended by a URL change', () => {
    const { server } = setupBuilder.withFakeLocation('http://foo.com/').build()

    server.requests = []

    history.pushState({}, '', '/bar')

    expect(server.requests.length).toEqual(2)
    expect(getRumMessage(server, 0).view.url).toEqual('http://foo.com/')
    expect(getRumMessage(server, 1).view.url).toEqual('http://foo.com/bar')
  })

  it('should keep the same URL when updating an ended view', () => {
    const { server, lifeCycle, clock } = setupBuilder
      .withFakeClock()
      .withFakeLocation('http://foo.com/')
      .build()

    clock.tick(VIEW_DURATION)

    history.pushState({}, '', '/bar')

    server.requests = []

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(server.requests.length).toEqual(1)
    expect(getRumMessage(server, 0).view.url).toEqual('http://foo.com/')
  })
})
