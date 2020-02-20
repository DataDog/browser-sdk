import {
  Configuration,
  DEFAULT_CONFIGURATION,
  ErrorMessage,
  InternalMonitoring,
  isIE,
  Omit,
  PerformanceObserverStubBuilder,
  RequestDetails,
} from '@datadog/browser-core'
import sinon from 'sinon'

import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { startPerformanceCollection } from '../src/performanceCollection'
import { handleResourceEntry, RumEvent, RumResourceEvent, startRum, UserAction } from '../src/rum'
import { RumGlobal } from '../src/rum.entry'

interface BrowserWindow extends Window {
  PerformanceObserver?: PerformanceObserver
}

function getEntry(addRumEvent: (event: RumEvent) => void, index: number) {
  return (addRumEvent as jasmine.Spy).calls.argsFor(index)[0] as RumEvent
}

function getServerRequestBodies<T>(server: sinon.SinonFakeServer) {
  return server.requests.map((r) => JSON.parse(r.requestBody) as T)
}

const configuration = {
  ...DEFAULT_CONFIGURATION,
  internalMonitoringEndpoint: 'monitoring',
  logsEndpoint: 'logs',
  maxBatchSize: 1,
  rumEndpoint: 'rum',
  traceEndpoint: 'trace',
}

const internalMonitoring: InternalMonitoring = {
  setExternalContextProvider: () => undefined,
}

describe('rum handle performance entry', () => {
  let addRumEvent: (event: RumEvent) => void

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    addRumEvent = jasmine.createSpy()
  })
  ;[
    {
      description: 'type resource + logs endpoint',
      entry: { entryType: 'resource', name: configuration.logsEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + internal monitoring endpoint',
      entry: { entryType: 'resource', name: configuration.internalMonitoringEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + rum endpoint',
      entry: { entryType: 'resource', name: configuration.rumEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + trace endpoint',
      entry: { entryType: 'resource', name: configuration.traceEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + valid request',
      entry: { entryType: 'resource', name: 'valid' },
      expectEntryToBeAdded: true,
    },
  ].forEach(
    ({
      description,
      entry,
      expectEntryToBeAdded,
    }: {
      description: string
      entry: Partial<PerformanceResourceTiming>
      expectEntryToBeAdded: boolean
    }) => {
      it(description, () => {
        handleResourceEntry(
          configuration as Configuration,
          entry as PerformanceResourceTiming,
          addRumEvent,
          new LifeCycle()
        )
        const entryAdded = (addRumEvent as jasmine.Spy).calls.all().length !== 0
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
        const entry: Partial<PerformanceResourceTiming> = { initiatorType, name: url, entryType: 'resource' }

        handleResourceEntry(
          configuration as Configuration,
          entry as PerformanceResourceTiming,
          addRumEvent,
          new LifeCycle()
        )
        const resourceEvent = getEntry(addRumEvent, 0) as RumResourceEvent
        expect(resourceEvent.resource.kind).toEqual(expected)
      })
    }
  )

  it('should compute timing durations', () => {
    const entry: Partial<PerformanceResourceTiming> = {
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
      entry as PerformanceResourceTiming,
      addRumEvent,
      new LifeCycle()
    )
    const resourceEvent = getEntry(addRumEvent, 0) as RumResourceEvent
    expect(resourceEvent.http.performance!.connect!.duration).toEqual(7 * 1e6)
    expect(resourceEvent.http.performance!.download!.duration).toEqual(75 * 1e6)
  })

  describe('ignore invalid performance entry', () => {
    it('when it has a negative timing start', () => {
      const entry: Partial<PerformanceResourceTiming> = {
        connectEnd: 10,
        connectStart: -3,
        entryType: 'resource',
        name: 'http://localhost/test',
        responseEnd: 100,
        responseStart: 25,
      }

      handleResourceEntry(
        configuration as Configuration,
        entry as PerformanceResourceTiming,
        addRumEvent,
        new LifeCycle()
      )
      const resourceEvent = getEntry(addRumEvent, 0) as RumResourceEvent
      expect(resourceEvent.http.performance).toBe(undefined)
    })

    it('when it has timing start after its end', () => {
      const entry: Partial<PerformanceResourceTiming> = {
        entryType: 'resource',
        name: 'http://localhost/test',
        responseEnd: 25,
        responseStart: 100,
      }

      handleResourceEntry(
        configuration as Configuration,
        entry as PerformanceResourceTiming,
        addRumEvent,
        new LifeCycle()
      )
      const resourceEvent = getEntry(addRumEvent, 0) as RumResourceEvent
      expect(resourceEvent.http.performance).toBe(undefined)
    })
  })
})

describe('rum session', () => {
  const FAKE_ERROR: Partial<ErrorMessage> = { message: 'test' }
  const FAKE_RESOURCE: Partial<PerformanceEntry> = { name: 'http://foo.com', entryType: 'resource' }
  const FAKE_REQUEST: Partial<RequestDetails> = { url: 'http://foo.com' }
  const FAKE_USER_ACTION: UserAction = { name: 'action', context: { foo: 'bar' } }
  const browserWindow = window as BrowserWindow
  let server: sinon.SinonFakeServer
  let original: PerformanceObserver | undefined
  let stubBuilder: PerformanceObserverStubBuilder

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    server = sinon.fakeServer.create()
    original = browserWindow.PerformanceObserver
    stubBuilder = new PerformanceObserverStubBuilder()
    browserWindow.PerformanceObserver = stubBuilder.getStub()
  })

  afterEach(() => {
    server.restore()
    browserWindow.PerformanceObserver = original
  })

  it('when tracked with resources should enable full tracking', () => {
    const trackedWithResourcesSession = {
      getId: () => undefined,
      isTracked: () => true,
      isTrackedWithResource: () => true,
    }
    const lifeCycle = new LifeCycle()
    startRum('appId', lifeCycle, configuration as Configuration, trackedWithResourcesSession, internalMonitoring)
    startPerformanceCollection(lifeCycle, trackedWithResourcesSession)
    server.requests = []

    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    lifeCycle.notify(LifeCycleEventType.REQUEST_COLLECTED, FAKE_REQUEST as RequestDetails)
    lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, FAKE_USER_ACTION)

    expect(server.requests.length).toEqual(4)
  })

  it('when tracked without resources should not track resources', () => {
    const trackedWithResourcesSession = {
      getId: () => undefined,
      isTracked: () => true,
      isTrackedWithResource: () => false,
    }
    const lifeCycle = new LifeCycle()
    startRum('appId', lifeCycle, configuration as Configuration, trackedWithResourcesSession, internalMonitoring)
    startPerformanceCollection(lifeCycle, trackedWithResourcesSession)
    server.requests = []

    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    lifeCycle.notify(LifeCycleEventType.REQUEST_COLLECTED, FAKE_REQUEST as RequestDetails)
    expect(server.requests.length).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    expect(server.requests.length).toEqual(1)
  })

  it('when not tracked should disable tracking', () => {
    const notTrackedSession = {
      getId: () => undefined,
      isTracked: () => false,
      isTrackedWithResource: () => false,
    }
    const lifeCycle = new LifeCycle()
    startRum('appId', lifeCycle, configuration as Configuration, notTrackedSession, internalMonitoring)
    startPerformanceCollection(lifeCycle, notTrackedSession)
    server.requests = []

    stubBuilder.fakeEntry(FAKE_RESOURCE as PerformanceEntry, 'resource')
    lifeCycle.notify(LifeCycleEventType.REQUEST_COLLECTED, FAKE_REQUEST as RequestDetails)
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, FAKE_USER_ACTION)

    expect(server.requests.length).toEqual(0)
  })

  it('when type change should enable/disable existing resource tracking', () => {
    let isTracked = true
    const session = {
      getId: () => undefined,
      isTracked: () => isTracked,
      isTrackedWithResource: () => isTracked,
    }
    const lifeCycle = new LifeCycle()
    startRum('appId', lifeCycle, configuration as Configuration, session, internalMonitoring)
    startPerformanceCollection(lifeCycle, session)
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
    const session = {
      getId: () => undefined,
      isTracked: () => true,
      isTrackedWithResource: () => isTrackedWithResource,
    }
    const lifeCycle = new LifeCycle()
    startRum('appId', lifeCycle, configuration as Configuration, session, internalMonitoring)
    startPerformanceCollection(lifeCycle, session)
    server.requests = []

    lifeCycle.notify(LifeCycleEventType.REQUEST_COLLECTED, FAKE_REQUEST as RequestDetails)
    expect(server.requests.length).toEqual(1)

    isTrackedWithResource = false
    lifeCycle.notify(LifeCycleEventType.REQUEST_COLLECTED, FAKE_REQUEST as RequestDetails)
    expect(server.requests.length).toEqual(1)

    isTrackedWithResource = true
    lifeCycle.notify(LifeCycleEventType.REQUEST_COLLECTED, FAKE_REQUEST as RequestDetails)
    expect(server.requests.length).toEqual(2)
  })

  it('when the session is renewed, a final view event then a new view event should be sent', () => {
    let sessionId = '42'
    const session = {
      getId: () => sessionId,
      isTracked: () => true,
      isTrackedWithResource: () => true,
    }
    const lifeCycle = new LifeCycle()
    server.requests = []
    startRum('appId', lifeCycle, configuration as Configuration, session, internalMonitoring)

    interface ExpectedRequestBody {
      evt: {
        category: string
      }
      session_id: string
      view: {
        id: string
      }
    }

    const initialRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(initialRequests.length).toEqual(1)
    expect(initialRequests[0].evt.category).toEqual('view')
    expect(initialRequests[0].session_id).toEqual('42')

    server.requests = []
    sessionId = '43'
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    const subsequentRequests = getServerRequestBodies<ExpectedRequestBody>(server)
    expect(subsequentRequests.length).toEqual(2)

    // Final view event
    expect(subsequentRequests[0].evt.category).toEqual('view')
    expect(subsequentRequests[0].session_id).toEqual('42')
    expect(subsequentRequests[0].view.id).toEqual(initialRequests[0].view.id)

    // New view event
    expect(subsequentRequests[1].evt.category).toEqual('view')
    expect(subsequentRequests[1].session_id).toEqual('43')
    expect(subsequentRequests[1].view.id).not.toEqual(initialRequests[0].view.id)
  })
})

describe('rum init', () => {
  let server: sinon.SinonFakeServer

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    server = sinon.fakeServer.create()
  })

  afterEach(() => {
    server.restore()
  })

  it('should send buffered performance entries', () => {
    const session = {
      getId: () => undefined,
      isTracked: () => true,
      isTrackedWithResource: () => true,
    }

    startRum('appId', new LifeCycle(), configuration as Configuration, session, internalMonitoring)

    expect(server.requests.length).toBeGreaterThan(0)
  })
})

type RumApi = Omit<RumGlobal, 'init'>
function getRumMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as RumEvent
}

describe('rum global context', () => {
  const FAKE_ERROR: Partial<ErrorMessage> = { message: 'test' }
  let lifeCycle: LifeCycle
  let RUM: RumApi
  let server: sinon.SinonFakeServer

  beforeEach(() => {
    const session = {
      getId: () => undefined,
      isTracked: () => true,
      isTrackedWithResource: () => true,
    }
    server = sinon.fakeServer.create()
    lifeCycle = new LifeCycle()
    RUM = startRum('appId', lifeCycle, configuration as Configuration, session, internalMonitoring) as RumApi
    server.requests = []
  })

  afterEach(() => {
    server.restore()
  })

  it('should be added to the request', () => {
    RUM.setRumGlobalContext({ bar: 'foo' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)

    expect((getRumMessage(server, 0) as any).bar).toEqual('foo')
  })

  it('should be updatable', () => {
    RUM.setRumGlobalContext({ bar: 'foo' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)
    RUM.setRumGlobalContext({ foo: 'bar' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)

    expect((getRumMessage(server, 0) as any).bar).toEqual('foo')
    expect((getRumMessage(server, 1) as any).foo).toEqual('bar')
    expect((getRumMessage(server, 1) as any).bar).toBeUndefined()
  })

  it('should not be automatically snake cased', () => {
    RUM.setRumGlobalContext({ fooBar: 'foo' })
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, FAKE_ERROR as ErrorMessage)

    expect((getRumMessage(server, 0) as any).fooBar).toEqual('foo')
  })
})

describe('rum user action', () => {
  let lifeCycle: LifeCycle
  let RUM: RumApi
  let server: sinon.SinonFakeServer

  beforeEach(() => {
    const session = {
      getId: () => undefined,
      isTracked: () => true,
      isTrackedWithResource: () => true,
    }
    server = sinon.fakeServer.create()
    lifeCycle = new LifeCycle()
    RUM = startRum('appId', lifeCycle, configuration as Configuration, session, internalMonitoring) as RumApi
    server.requests = []
  })

  it('should not be automatically snake cased', () => {
    lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, { name: 'hello', context: { fooBar: 'foo' } })

    expect((getRumMessage(server, 0) as any).fooBar).toEqual('foo')
  })
})
