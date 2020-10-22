import { ErrorMessage, isIE } from '@datadog/browser-core'
import sinon from 'sinon'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { RumPerformanceNavigationTiming, RumPerformanceResourceTiming } from '../browser/performanceCollection'

import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { RequestCompleteEvent } from '../domain/requestCollection'
import { ActionType, AutoUserAction } from '../domain/rumEventsCollection/userActionCollection'
import {
  SESSION_KEEP_ALIVE_INTERVAL,
  THROTTLE_VIEW_UPDATE_PERIOD,
  View,
} from '../domain/rumEventsCollection/viewCollection'
import { RumEvent, RumViewEvent } from '../index'
import { doGetInternalContext, trackView } from './rum'

function getServerRequestBodies<T>(server: sinon.SinonFakeServer) {
  return server.requests.map((r) => JSON.parse(r.requestBody) as T)
}

function getRumMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as RumEvent
}

interface ExpectedRequestBody {
  application_id: string
  date: number
  evt: {
    category: string
  }
  session_id: string
  view: {
    id: string
    referrer: string
  }
}

describe('rum view', () => {
  it('should convert timings to nanosecond', () => {
    const FAKE_VIEW = {
      id: 'foo',
      loadingTime: 17,
      measures: {
        loadEventEnd: 15,
      },
    }

    const spy = jasmine.createSpy<(startTime: number, event: RumViewEvent) => void>()
    const lifeCycle = new LifeCycle()

    trackView(lifeCycle, spy)
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, FAKE_VIEW as View)

    const formattedView = spy.calls.mostRecent().args[1]
    expect(formattedView.view.measures.loadEventEnd).toEqual(15 * 1e6)
    expect(formattedView.view.loadingTime).toEqual(17 * 1e6)
  })
})

describe('rum session', () => {
  const FAKE_ERROR: Partial<ErrorMessage> = { message: 'test' }
  const FAKE_RESOURCE: Partial<RumPerformanceResourceTiming> = { name: 'http://foo.com', entryType: 'resource' }
  const FAKE_REQUEST: Partial<RequestCompleteEvent> = { url: 'http://foo.com' }
  const FAKE_CUSTOM_USER_ACTION_EVENT = {
    action: {
      context: { foo: 'bar' },
      name: 'action',
      startTime: 123,
      type: ActionType.CUSTOM as const,
    },
    context: {},
  }
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

  it('when switching from not tracked to tracked, it should not send events without sessionId', () => {
    let sessionId = undefined as string | undefined
    let isTracked = false
    const { server, lifeCycle } = setupBuilder
      .withSession({
        getId: () => sessionId,
        isTracked: () => isTracked,
        isTrackedWithResource: () => false,
      })
      .build()

    server.requests = []
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    expect(getServerRequestBodies<ExpectedRequestBody>(server).length).toEqual(0)

    // it can happen without a renew session if the session is renewed on another tab
    isTracked = true
    sessionId = '1234'

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    expect(getServerRequestBodies<ExpectedRequestBody>(server).length).toEqual(0)
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
    expect(requests[0].evt.category).toEqual('view')

    clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

    // view update
    requests = getServerRequestBodies<ExpectedRequestBody>(server)
    server.requests = []
    expect(requests.length).toEqual(1)
    expect(requests[0].evt.category).toEqual('view')
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

describe('rum internal context', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup().withRum()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should return current internal context', () => {
    const { lifeCycle, parentContexts, session } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'fake' })

    expect(doGetInternalContext(parentContexts, 'appId', session)).toEqual({
      application_id: 'appId',
      session_id: '1234',
      user_action: {
        id: 'fake',
      },
      view: {
        id: jasmine.any(String),
        referrer: document.referrer,
        url: window.location.href,
      },
    })
  })

  it("should return undefined if the session isn't tracked", () => {
    const { lifeCycle, parentContexts, session } = setupBuilder
      .withSession({
        getId: () => '1234',
        isTracked: () => false,
        isTrackedWithResource: () => false,
      })
      .build()

    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'fake' })

    expect(doGetInternalContext(parentContexts, 'appId', session)).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    const { lifeCycle, parentContexts, session } = setupBuilder.build()

    const stubUserAction: Partial<AutoUserAction> = { duration: 10 }
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'fake' })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubUserAction as AutoUserAction)

    expect(doGetInternalContext(parentContexts, 'appId', session, 15)).toEqual({
      application_id: 'appId',
      session_id: '1234',
      user_action: {
        id: 'fake',
      },
      view: {
        id: jasmine.any(String),
        referrer: document.referrer,
        url: window.location.href,
      },
    })
  })
})

describe('rum view url', () => {
  const FAKE_ERROR: Partial<ErrorMessage> = { message: 'test' }
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

  it('should sets the view URL on events', () => {
    const { server, lifeCycle } = setupBuilder.withFakeLocation('http://foo.com/').build()

    server.requests = []

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)

    expect(server.requests.length).toEqual(1)
    expect(getRumMessage(server, 0).view.url).toEqual('http://foo.com/')
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
