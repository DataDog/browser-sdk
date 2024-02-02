import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import {
  resetExperimentalFeatures,
  addExperimentalFeatures,
  isIE,
  RequestType,
  ResourceType,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { RumFetchResourceEventDomainContext } from '../../domainContext.types'
import { setup, createRumSessionManagerMock, createPerformanceEntry } from '../../../test'
import type { TestSetupBuilder } from '../../../test'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import { TraceIdentifier } from '../tracing/tracer'
import { validateAndBuildRumConfiguration } from '../configuration'
import { PageState } from '../contexts/pageStateHistory'
import { RumPerformanceEntryType } from '../../browser/performanceCollection'
import { startResourceCollection } from './resourceCollection'

describe('resourceCollection', () => {
  let setupBuilder: TestSetupBuilder
  let trackResources: boolean

  let pageStateHistorySpy: jasmine.Spy<jasmine.Func>
  beforeEach(() => {
    trackResources = true
    setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager, pageStateHistory, configuration }) => {
      pageStateHistorySpy = spyOn(pageStateHistory, 'findAll')
      startResourceCollection(lifeCycle, { ...configuration, trackResources }, sessionManager, pageStateHistory)
    })
  })

  afterEach(() => {
    resetExperimentalFeatures()
    setupBuilder.cleanup()
  })

  it('should create resource from performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()

    const performanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [performanceEntry])

    expect(rawRumEvents[0].startTime).toBe(200 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number) as unknown as TimeStamp,
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        size: undefined,
        type: ResourceType.OTHER,
        url: 'https://resource.com/valid',
        download: jasmine.any(Object),
        first_byte: jasmine.any(Object),
        status_code: 200,
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      performanceEntry,
    })
  })

  it('should create resource from completed XHR request', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const xhr = new XMLHttpRequest()
    lifeCycle.notify(
      LifeCycleEventType.REQUEST_COMPLETED,
      createCompletedRequest({
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.XHR,
        url: 'https://resource.com/valid',
        xhr,
      })
    )

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        method: 'GET',
        status_code: 200,
        type: ResourceType.XHR,
        url: 'https://resource.com/valid',
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      xhr,
      performanceEntry: undefined,
      response: undefined,
      requestInput: undefined,
      requestInit: undefined,
      error: undefined,
    })
  })

  //
  ;[
    {
      title: 'when trackResource is false',
      trackResources: false,
      session: createRumSessionManagerMock(),
    },
    {
      title: 'when the session is not tracked',
      trackResources: true,
      session: createRumSessionManagerMock().setNotTracked(),
    },
  ].forEach((options) => {
    describe(options.title, () => {
      beforeEach(() => {
        trackResources = options.trackResources
        setupBuilder.withSessionManager(options.session)
      })

      describe('and resource is not traced', () => {
        it('should not collect a resource from a performance entry', () => {
          const { lifeCycle, rawRumEvents } = setupBuilder.build()

          lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
            createPerformanceEntry(RumPerformanceEntryType.RESOURCE),
          ])

          expect(rawRumEvents.length).toBe(0)
        })

        it('should not collect a resource from a completed XHR request', () => {
          const { lifeCycle, rawRumEvents } = setupBuilder.build()
          lifeCycle.notify(
            LifeCycleEventType.REQUEST_COMPLETED,
            createCompletedRequest({
              type: RequestType.XHR,
            })
          )

          expect(rawRumEvents.length).toBe(0)
        })
      })

      describe('and resource is traced', () => {
        it('should collect a resource from a performance entry', () => {
          const { lifeCycle, rawRumEvents } = setupBuilder.build()

          lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
            createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { traceId: '1234' }),
          ])

          expect(rawRumEvents.length).toBe(1)
          expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
        })

        it('should collect a resource from a completed XHR request', () => {
          const { lifeCycle, rawRumEvents } = setupBuilder.build()
          lifeCycle.notify(
            LifeCycleEventType.REQUEST_COMPLETED,
            createCompletedRequest({
              type: RequestType.XHR,
              traceId: new TraceIdentifier(),
              spanId: new TraceIdentifier(),
              traceSampled: true,
            })
          )

          expect(rawRumEvents.length).toBe(1)
          expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
        })
      })
    })
  })

  it('should collect page states on resources when ff resource_page_states enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.RESOURCE_PAGE_STATES])
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const mockPageStates = [{ state: PageState.ACTIVE, startTime: 0 as RelativeTime }]
    const mockXHR = createCompletedRequest()
    const mockPerformanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE)

    pageStateHistorySpy.and.returnValue(mockPageStates)

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, mockXHR)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [mockPerformanceEntry])

    const rawRumResourceEventFetch = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
    const rawRumResourceEventEntry = rawRumEvents[1].rawRumEvent as RawRumResourceEvent

    expect(pageStateHistorySpy.calls.first().args).toEqual([mockXHR.startClocks.relative, mockXHR.duration])
    expect(pageStateHistorySpy.calls.mostRecent().args).toEqual([
      mockPerformanceEntry.startTime,
      mockPerformanceEntry.duration,
    ])
    expect(rawRumResourceEventFetch._dd.page_states).toEqual(jasmine.objectContaining(mockPageStates))
    expect(rawRumResourceEventEntry._dd.page_states).toEqual(jasmine.objectContaining(mockPageStates))
  })

  it('should not have a duration if a frozen state happens during the request and no performance entry matches', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const mockPageStates = [{ state: PageState.FROZEN, startTime: 0 as RelativeTime }]
    const mockXHR = createCompletedRequest()

    pageStateHistorySpy.and.returnValue(mockPageStates)

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, mockXHR)

    const rawRumResourceEventFetch = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
    expect(rawRumResourceEventFetch.resource.duration).toBeUndefined()
  })

  it('should not collect page states on resources when ff resource_page_states disabled', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const mockPageStates = [{ state: PageState.ACTIVE, startTime: 0 as RelativeTime }]
    const mockXHR = createCompletedRequest()
    const mockPerformanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE)

    pageStateHistorySpy.and.returnValue(mockPageStates)

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, mockXHR)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [mockPerformanceEntry])

    const rawRumResourceEventFetch = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
    const rawRumResourceEventEntry = rawRumEvents[1].rawRumEvent as RawRumResourceEvent

    expect(rawRumResourceEventFetch._dd.page_states).not.toBeDefined()
    expect(rawRumResourceEventEntry._dd.page_states).not.toBeDefined()
  })

  it('should create resource from completed fetch request', () => {
    if (isIE()) {
      pending('No IE support')
    }
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const response = new Response()
    lifeCycle.notify(
      LifeCycleEventType.REQUEST_COMPLETED,
      createCompletedRequest({
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.FETCH,
        url: 'https://resource.com/valid',
        response,
        input: 'https://resource.com/valid',
        init: { headers: { foo: 'bar' } },
      })
    )

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        method: 'GET',
        status_code: 200,
        type: ResourceType.FETCH,
        url: 'https://resource.com/valid',
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      performanceEntry: undefined,
      xhr: undefined,
      response,
      requestInput: 'https://resource.com/valid',
      requestInit: { headers: { foo: 'bar' } },
      error: undefined,
    })
  })
  ;[null, undefined, 42, {}].forEach((input: any) => {
    it(`should support ${
      typeof input === 'object' ? JSON.stringify(input) : String(input)
    } as fetch input parameter`, () => {
      if (isIE()) {
        pending('No IE support')
      }
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          type: RequestType.FETCH,
          input,
        })
      )

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].domainContext as RumFetchResourceEventDomainContext).requestInput).toBe(input)
    })
  })

  it('should include the error in failed fetch requests', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const error = new Error()
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest({ error }))

    expect(rawRumEvents[0].domainContext).toEqual(
      jasmine.objectContaining({
        error,
      })
    )
  })

  describe('tracing info', () => {
    it('should be processed from traced initial document', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { traceId: '1234' }),
      ])
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields).toBeDefined()
      expect(privateFields.trace_id).toBe('1234')
    })

    it('should be processed from sampled completed request', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.trace_id).toBeDefined()
      expect(privateFields.span_id).toBeDefined()
    })

    it('should not be processed from not sampled completed request', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: false,
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.trace_id).not.toBeDefined()
      expect(privateFields.span_id).not.toBeDefined()
    })

    it('should pull traceSampleRate from config if present', () => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager, pageStateHistory }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
            traceSampleRate: 60,
          })!,
          sessionManager,
          pageStateHistory
        )
      })

      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toEqual(0.6)
    })

    it('should not define rule_psr if traceSampleRate is undefined', () => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager, pageStateHistory }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
          })!,
          sessionManager,
          pageStateHistory
        )
      })

      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toBeUndefined()
    })

    it('should define rule_psr to 0 if traceSampleRate is set to 0', () => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager, pageStateHistory }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
            traceSampleRate: 0,
          })!,
          sessionManager,
          pageStateHistory
        )
      })

      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toEqual(0)
    })
  })
})

function createCompletedRequest(details?: Partial<RequestCompleteEvent>): RequestCompleteEvent {
  const request: Partial<RequestCompleteEvent> = {
    duration: 100 as Duration,
    method: 'GET',
    startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
    status: 200,
    type: RequestType.XHR,
    url: 'https://resource.com/valid',
    ...details,
  }
  return request as RequestCompleteEvent
}
