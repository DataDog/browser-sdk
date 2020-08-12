import { Configuration, DEFAULT_CONFIGURATION, ErrorMessage, isIE, SPEC_ENDPOINTS } from '@datadog/browser-core'
import sinon from 'sinon'

import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { RumPerformanceNavigationTiming, RumPerformanceResourceTiming } from '../src/performanceCollection'
import { RequestCompleteEvent } from '../src/requestCollection'
import { handleResourceEntry, RawRumEvent, RumEvent, RumResourceEvent, RumViewEvent, trackView } from '../src/rum'
import { RumSession } from '../src/rumSession'
import { AutoUserAction, CustomUserAction, UserActionType } from '../src/userActionCollection'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD, View } from '../src/viewCollection'
import { setup, TestSetupBuilder } from './specHelper'

function getEntry(handler: (startTime: number, event: RumEvent) => void, index: number) {
  return (handler as jasmine.Spy).calls.argsFor(index)[1] as RumEvent
}

function getServerRequestBodies<T>(server: sinon.SinonFakeServer) {
  return server.requests.map((r) => JSON.parse(r.requestBody) as T)
}

const configuration = {
  ...DEFAULT_CONFIGURATION,
  ...SPEC_ENDPOINTS,
  maxBatchSize: 1,
}

function getRumMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as RumEvent
}

function createMockSession(): RumSession {
  return {
    getId: () => 'foo',
    isTracked: () => true,
    isTrackedWithResource: () => true,
  }
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

describe('rum handle performance entry', () => {
  let handler: (startTime: number, event: RawRumEvent) => void

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    handler = jasmine.createSpy()
  })
  ;[
    {
      description: 'type resource + logs endpoint',
      entry: { entryType: 'resource' as const, name: configuration.logsEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + internal monitoring endpoint',
      entry: { entryType: 'resource' as const, name: configuration.internalMonitoringEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + rum endpoint',
      entry: { entryType: 'resource' as const, name: configuration.rumEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + trace endpoint',
      entry: { entryType: 'resource' as const, name: configuration.traceEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + valid request',
      entry: { entryType: 'resource' as const, name: 'https://resource.com/valid' },
      expectEntryToBeAdded: true,
    },
  ].forEach(
    ({
      description,
      entry,
      expectEntryToBeAdded,
    }: {
      description: string
      entry: Partial<RumPerformanceResourceTiming>
      expectEntryToBeAdded: boolean
    }) => {
      it(description, () => {
        handleResourceEntry(
          configuration as Configuration,
          new LifeCycle(),
          createMockSession(),
          handler,
          entry as RumPerformanceResourceTiming
        )
        const entryAdded = (handler as jasmine.Spy).calls.all().length !== 0
        expect(entryAdded).toEqual(expectEntryToBeAdded)
      })
    }
  )
  ;[
    {
      description: 'file extension with query params',
      expected: 'js',
      url: 'http://localhost/test.js?from=foo.css',
    },
    {
      description: 'css extension',
      expected: 'css',
      url: 'http://localhost/test.css',
    },
    {
      description: 'image initiator',
      expected: 'image',
      initiatorType: 'img',
      url: 'http://localhost/test',
    },
    {
      description: 'image extension',
      expected: 'image',
      url: 'http://localhost/test.jpg',
    },
  ].forEach(
    ({
      description,
      url,
      initiatorType,
      expected,
    }: {
      description: string
      url: string
      initiatorType?: string
      expected: string
    }) => {
      it(`should compute resource kind: ${description}`, () => {
        const entry: Partial<RumPerformanceResourceTiming> = { initiatorType, name: url, entryType: 'resource' }

        handleResourceEntry(
          configuration as Configuration,
          new LifeCycle(),
          createMockSession(),
          handler,
          entry as RumPerformanceResourceTiming
        )
        const resourceEvent = getEntry(handler, 0) as RumResourceEvent
        expect(resourceEvent.resource.kind).toEqual(expected)
      })
    }
  )

  it('should compute timing durations', () => {
    const entry: Partial<RumPerformanceResourceTiming> = {
      connectEnd: 10,
      connectStart: 3,
      domainLookupEnd: 3,
      domainLookupStart: 3,
      entryType: 'resource',
      name: 'http://localhost/test',
      redirectEnd: 0,
      redirectStart: 0,
      requestStart: 20,
      responseEnd: 100,
      responseStart: 25,
      secureConnectionStart: 0,
    }

    handleResourceEntry(
      configuration as Configuration,
      new LifeCycle(),
      createMockSession(),
      handler,
      entry as RumPerformanceResourceTiming
    )
    const resourceEvent = getEntry(handler, 0) as RumResourceEvent
    expect(resourceEvent.http.performance!.connect!.duration).toEqual(7 * 1e6)
    expect(resourceEvent.http.performance!.download!.duration).toEqual(75 * 1e6)
  })

  describe('ignore invalid performance entry', () => {
    it('when it has a negative timing start', () => {
      const entry: Partial<RumPerformanceResourceTiming> = {
        connectEnd: 10,
        connectStart: -3,
        domainLookupEnd: 10,
        domainLookupStart: 10,
        entryType: 'resource',
        fetchStart: 10,
        name: 'http://localhost/test',
        redirectEnd: 0,
        redirectStart: 0,
        requestStart: 10,
        responseEnd: 100,
        responseStart: 25,
        secureConnectionStart: 0,
      }

      handleResourceEntry(
        configuration as Configuration,
        new LifeCycle(),
        createMockSession(),
        handler,
        entry as RumPerformanceResourceTiming
      )
      const resourceEvent = getEntry(handler, 0) as RumResourceEvent
      expect(resourceEvent.http.performance).toBe(undefined)
    })

    it('when it has timing start after its end', () => {
      const entry: Partial<RumPerformanceResourceTiming> = {
        entryType: 'resource',
        name: 'http://localhost/test',
        responseEnd: 25,
        responseStart: 100,
      }

      handleResourceEntry(
        configuration as Configuration,
        new LifeCycle(),
        createMockSession(),
        handler,
        entry as RumPerformanceResourceTiming
      )
      const resourceEvent = getEntry(handler, 0) as RumResourceEvent
      expect(resourceEvent.http.performance).toBe(undefined)
    })
  })
})

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
  const FAKE_CUSTOM_USER_ACTION: CustomUserAction = {
    context: { foo: 'bar' },
    name: 'action',
    type: UserActionType.CUSTOM,
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

  it('when tracked with resources should enable full tracking', () => {
    const { server, stubBuilder, lifeCycle } = setupBuilder
      .withPerformanceObserverStubBuilder()
      .withPerformanceCollection()
      .build()

    server.requests = []

    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, FAKE_REQUEST as RequestCompleteEvent)
    lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, FAKE_CUSTOM_USER_ACTION)

    expect(server.requests.length).toEqual(4)
  })

  it('when tracked without resources should not track resources', () => {
    const { server, stubBuilder, lifeCycle } = setupBuilder
      .withSession({
        getId: () => '1234',
        isTracked: () => true,
        isTrackedWithResource: () => false,
      })
      .withPerformanceObserverStubBuilder()
      .withPerformanceCollection()
      .build()

    server.requests = []

    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, FAKE_REQUEST as RequestCompleteEvent)
    expect(server.requests.length).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    expect(server.requests.length).toEqual(1)
  })

  it('when not tracked should disable tracking', () => {
    const { server, stubBuilder, lifeCycle } = setupBuilder
      .withSession({
        getId: () => undefined,
        isTracked: () => false,
        isTrackedWithResource: () => false,
      })
      .withPerformanceObserverStubBuilder()
      .withPerformanceCollection()
      .build()

    server.requests = []

    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, FAKE_REQUEST as RequestCompleteEvent)
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, FAKE_CUSTOM_USER_ACTION)

    expect(server.requests.length).toEqual(0)
  })

  it('when type change should enable/disable existing resource tracking', () => {
    let isTracked = true
    const { server, stubBuilder } = setupBuilder
      .withSession({
        getId: () => '1234',
        isTracked: () => isTracked,
        isTrackedWithResource: () => isTracked,
      })
      .withPerformanceObserverStubBuilder()
      .withPerformanceCollection()
      .build()

    server.requests = []

    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    expect(server.requests.length).toEqual(1)

    isTracked = false
    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    expect(server.requests.length).toEqual(1)

    isTracked = true
    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    expect(server.requests.length).toEqual(2)
  })

  it('when type change should enable/disable existing request tracking', () => {
    let isTrackedWithResource = true
    const { server, lifeCycle } = setupBuilder
      .withSession({
        getId: () => '1234',
        isTracked: () => true,
        isTrackedWithResource: () => isTrackedWithResource,
      })
      .withPerformanceCollection()
      .build()

    server.requests = []

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, FAKE_REQUEST as RequestCompleteEvent)
    expect(server.requests.length).toEqual(1)

    isTrackedWithResource = false
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, FAKE_REQUEST as RequestCompleteEvent)
    expect(server.requests.length).toEqual(1)

    isTrackedWithResource = true
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, FAKE_REQUEST as RequestCompleteEvent)
    expect(server.requests.length).toEqual(2)
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

describe('rum global context', () => {
  const FAKE_ERROR: Partial<ErrorMessage> = { message: 'test' }
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeServer()
      .withRum()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should be added to the request', () => {
    const { server, lifeCycle, rumApi } = setupBuilder.build()
    server.requests = []

    rumApi.setRumGlobalContext({ bar: 'foo' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)

    expect((getRumMessage(server, 0) as any).bar).toEqual('foo')
  })

  it('should be updatable', () => {
    const { server, lifeCycle, rumApi } = setupBuilder.build()
    server.requests = []

    rumApi.setRumGlobalContext({ bar: 'foo' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    rumApi.setRumGlobalContext({ foo: 'bar' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)

    expect((getRumMessage(server, 0) as any).bar).toEqual('foo')
    expect((getRumMessage(server, 1) as any).foo).toEqual('bar')
    expect((getRumMessage(server, 1) as any).bar).toBeUndefined()
  })

  it('should not be automatically snake cased', () => {
    const { server, lifeCycle, rumApi } = setupBuilder.build()
    server.requests = []

    rumApi.setRumGlobalContext({ fooBar: 'foo' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)

    expect((getRumMessage(server, 0) as any).fooBar).toEqual('foo')
  })
})

describe('rum user action', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeServer()
      .withRum()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should not be automatically snake cased', () => {
    const { server, lifeCycle } = setupBuilder.build()
    server.requests = []

    lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, {
      context: { fooBar: 'foo' },
      name: 'hello',
      type: UserActionType.CUSTOM,
    })

    expect((getRumMessage(server, 0) as any).fooBar).toEqual('foo')
  })
})

describe('rum context', () => {
  const FAKE_ERROR: Partial<ErrorMessage> = { message: 'test' }
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeServer()
      .withRum()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should be snake cased and added to request', () => {
    const { server } = setupBuilder.build()
    const initialRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(initialRequests[0].application_id).toEqual('appId')
  })

  it('should be merge with event attributes', () => {
    const { server } = setupBuilder.build()
    const initialRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(initialRequests[0].view.referrer).toBeDefined()
    expect(initialRequests[0].view.id).toBeDefined()
  })

  it('should be overwritten by event attributes', () => {
    const { server, lifeCycle, clock } = setupBuilder.withFakeClock().build()

    const initialRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(initialRequests[0].evt.category).toEqual('view')
    const initialViewDate = initialRequests[0].date

    // generate view update
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    server.requests = []
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    const subsequentRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(subsequentRequests[0].evt.category).toEqual('view')
    expect(subsequentRequests[0].date).toEqual(initialViewDate)
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
    const { rumApi, lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'fake' })

    expect(rumApi.getInternalContext()).toEqual({
      application_id: 'appId',
      session_id: '1234',
      user_action: {
        id: 'fake',
      },
      view: {
        id: jasmine.any(String),
        url: window.location.href,
      },
    })
  })

  it('should return internal context corresponding to startTime', () => {
    const { rumApi, lifeCycle } = setupBuilder.build()

    const stubUserAction: Partial<AutoUserAction> = { duration: 10 }
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'fake' })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubUserAction as AutoUserAction)

    expect(rumApi.getInternalContext(15)).toEqual({
      application_id: 'appId',
      session_id: '1234',
      user_action: {
        id: 'fake',
      },
      view: {
        id: jasmine.any(String),
        url: window.location.href,
      },
    })
  })
})

describe('rum event assembly', () => {
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

  it('should sets the view URL on long task events', () => {
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
