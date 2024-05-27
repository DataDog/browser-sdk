import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { isIE, RequestType, ResourceType } from '@datadog/browser-core'
import type { RumFetchResourceEventDomainContext } from '../../domainContext.types'
import { setup, createRumSessionManagerMock, createPerformanceEntry } from '../../../test'
import type { TestSetupBuilder } from '../../../test'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import { TraceIdentifier } from '../tracing/tracer'
import { validateAndBuildRumConfiguration } from '../configuration'
import { RumPerformanceEntryType } from '../../browser/performanceCollection'
import { startResourceCollection } from './resourceCollection'

describe('resourceCollection', () => {
  let setupBuilder: TestSetupBuilder
  let trackResources: boolean
  let wasInPageStateDuringPeriodSpy: jasmine.Spy<jasmine.Func>

  beforeEach(() => {
    trackResources = true
    setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager, pageStateHistory, configuration }) => {
      wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
      startResourceCollection(lifeCycle, { ...configuration, trackResources }, sessionManager, pageStateHistory)
    })
  })

  it('should create resource from performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()

    const performanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      responseStart: 250 as RelativeTime,
      decodedBodySize: 51,
      encodedBodySize: 42,
      transferSize: 63,
      renderBlockingStatus: 'blocking',
    })
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [performanceEntry])

    expect(rawRumEvents[0].startTime).toBe(200 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number) as unknown as TimeStamp,
      type: RumEventType.RESOURCE,
      resource: {
        type: ResourceType.OTHER,
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        url: 'https://resource.com/valid',
        status_code: 200,
        size: 51,
        encoded_body_size: 42,
        decoded_body_size: 51,
        transfer_size: 63,
        render_blocking_status: 'blocking',
        first_byte: jasmine.any(Object),
        download: jasmine.any(Object),
      },
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
        type: RequestType.XHR,
        method: 'GET',
        url: 'https://resource.com/valid',
        status: 200,
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        duration: 100 as Duration,
        xhr,
        isAborted: false,
      })
    )

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      type: RumEventType.RESOURCE,
      resource: {
        type: ResourceType.XHR,
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        url: 'https://resource.com/valid',
        method: 'GET',
        status_code: 200,
      },
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      error: undefined,
      performanceEntry: undefined,
      requestInit: undefined,
      requestInput: undefined,
      response: undefined,
      isAborted: false,
      xhr,
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
              spanId: new TraceIdentifier(),
              traceId: new TraceIdentifier(),
              traceSampled: true,
            })
          )

          expect(rawRumEvents.length).toBe(1)
          expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
        })
      })
    })
  })

  it('should not have a duration if a frozen state happens during the request and no performance entry matches', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const mockXHR = createCompletedRequest()

    wasInPageStateDuringPeriodSpy.and.returnValue(true)

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, mockXHR)

    const rawRumResourceEventFetch = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
    expect(rawRumResourceEventFetch.resource.duration).toBeUndefined()
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
        type: RequestType.FETCH,
        method: 'GET',
        url: 'https://resource.com/valid',
        status: 200,
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        duration: 100 as Duration,
        response,
        input: 'https://resource.com/valid',
        init: { headers: { foo: 'bar' } },
        isAborted: false,
      })
    )

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      type: RumEventType.RESOURCE,
      resource: {
        type: ResourceType.FETCH,
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        url: 'https://resource.com/valid',
        method: 'GET',
        status_code: 200,
      },
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      error: undefined,
      performanceEntry: undefined,
      requestInit: { headers: { foo: 'bar' } },
      requestInput: 'https://resource.com/valid',
      response,
      isAborted: false,
      xhr: undefined,
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

  it('should discard 0 status code', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const performanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { responseStatus: 0 })
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [performanceEntry])
    expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent).resource.status_code).toBeUndefined()
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
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
          traceSampled: true,
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
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
          traceSampled: false,
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
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
          traceSampled: true,
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
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
          traceSampled: true,
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
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
          traceSampled: true,
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toEqual(0)
    })
  })
})

function createCompletedRequest(details?: Partial<RequestCompleteEvent>): RequestCompleteEvent {
  const request: Partial<RequestCompleteEvent> = {
    type: RequestType.XHR,
    method: 'GET',
    url: 'https://resource.com/valid',
    status: 200,
    startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
    duration: 100 as Duration,
    ...details,
  }
  return request as RequestCompleteEvent
}
