import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { noop, RequestType, ResourceType } from '@datadog/browser-core'
import type { RumFetchResourceEventDomainContext, RumXhrResourceEventDomainContext } from '../../domainContext.types'
import { setup, createPerformanceEntry, mockPerformanceObserver } from '../../../test'
import type { TestSetupBuilder } from '../../../test'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import { createTraceIdentifier } from '../tracing/tracer'
import { validateAndBuildRumConfiguration } from '../configuration'
import type { RumPerformanceEntry } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { startResourceCollection } from './resourceCollection'

const HANDLING_STACK_REGEX = /^Error: \n\s+at <anonymous> @/

describe('resourceCollection', () => {
  let setupBuilder: TestSetupBuilder
  let trackResources: boolean
  let wasInPageStateDuringPeriodSpy: jasmine.Spy<jasmine.Func>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  function build() {
    const result = setupBuilder.build()
    // Reset the initial load events collected during the setup
    result.rawRumEvents.length = 0
    return result
  }

  beforeEach(() => {
    trackResources = true
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    setupBuilder = setup().beforeBuild(({ lifeCycle, pageStateHistory, configuration }) => {
      wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
      startResourceCollection(lifeCycle, { ...configuration, trackResources }, pageStateHistory, noop)
    })
  })

  it('should create resource from performance entry', () => {
    const { rawRumEvents } = build()

    const performanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      encodedBodySize: 42,
      decodedBodySize: 51,
      transferSize: 63,
      renderBlockingStatus: 'blocking',
      responseStart: 250 as RelativeTime,
    })
    notifyPerformanceEntries([performanceEntry])

    expect(rawRumEvents[0].startTime).toBe(200 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number) as unknown as TimeStamp,
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        size: 51,
        encoded_body_size: 42,
        decoded_body_size: 51,
        transfer_size: 63,
        type: ResourceType.OTHER,
        url: 'https://resource.com/valid',
        download: jasmine.any(Object),
        first_byte: jasmine.any(Object),
        status_code: 200,
        render_blocking_status: 'blocking',
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
    const { lifeCycle, rawRumEvents } = build()
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
        isAborted: false,
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
      isAborted: false,
      handlingStack: jasmine.stringMatching(HANDLING_STACK_REGEX),
    })
  })

  describe('when trackResource is false', () => {
    beforeEach(() => {
      trackResources = false
    })

    describe('and resource is not traced', () => {
      it('should not collect a resource from a performance entry', () => {
        const { rawRumEvents } = build()

        notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])

        expect(rawRumEvents.length).toBe(0)
      })

      it('should not collect a resource from a completed XHR request', () => {
        const { lifeCycle, rawRumEvents } = build()
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
        const { rawRumEvents } = build()

        notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { traceId: '1234' })])

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
      })

      it('should collect a resource from a completed XHR request', () => {
        const { lifeCycle, rawRumEvents } = build()
        lifeCycle.notify(
          LifeCycleEventType.REQUEST_COMPLETED,
          createCompletedRequest({
            type: RequestType.XHR,
            traceId: createTraceIdentifier(),
            spanId: createTraceIdentifier(),
            traceSampled: true,
          })
        )

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
      })
    })
  })

  it('should not have a duration if a frozen state happens during the request and no performance entry matches', () => {
    const { lifeCycle, rawRumEvents } = build()
    const mockXHR = createCompletedRequest()

    wasInPageStateDuringPeriodSpy.and.returnValue(true)

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, mockXHR)

    const rawRumResourceEventFetch = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
    expect(rawRumResourceEventFetch.resource.duration).toBeUndefined()
  })

  it('should create resource from completed fetch request', () => {
    const { lifeCycle, rawRumEvents } = build()
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
        isAborted: false,
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
      isAborted: false,
      handlingStack: jasmine.stringMatching(HANDLING_STACK_REGEX),
    })
  })
  ;[null, undefined, 42, {}].forEach((input: any) => {
    it(`should support ${
      typeof input === 'object' ? JSON.stringify(input) : String(input)
    } as fetch input parameter`, () => {
      const { lifeCycle, rawRumEvents } = build()
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
    const { lifeCycle, rawRumEvents } = build()
    const error = new Error()
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest({ error }))

    expect(rawRumEvents[0].domainContext).toEqual(
      jasmine.objectContaining({
        error,
      })
    )
  })

  it('should discard 0 status code', () => {
    const { rawRumEvents } = build()
    const performanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { responseStatus: 0 })
    notifyPerformanceEntries([performanceEntry])
    expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent).resource.status_code).toBeUndefined()
  })

  describe('tracing info', () => {
    it('should be processed from traced initial document', () => {
      const { rawRumEvents } = build()
      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { traceId: '1234' })])
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields).toBeDefined()
      expect(privateFields.trace_id).toBe('1234')
      expect(privateFields.span_id).toEqual(jasmine.any(String))
    })

    it('should be processed from sampled completed request', () => {
      const { lifeCycle, rawRumEvents } = build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: createTraceIdentifier(),
          traceId: createTraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.trace_id).toBeDefined()
      expect(privateFields.span_id).toBeDefined()
    })

    it('should not be processed from not sampled completed request', () => {
      const { lifeCycle, rawRumEvents } = build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: false,
          spanId: createTraceIdentifier(),
          traceId: createTraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.trace_id).not.toBeDefined()
      expect(privateFields.span_id).not.toBeDefined()
    })

    it('should pull traceSampleRate from config if present', () => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, pageStateHistory }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
            traceSampleRate: 60,
          })!,
          pageStateHistory,
          noop
        )
      })

      const { lifeCycle, rawRumEvents } = build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: createTraceIdentifier(),
          traceId: createTraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toEqual(0.6)
    })

    it('should not define rule_psr if traceSampleRate is undefined', () => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, pageStateHistory }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
          })!,
          pageStateHistory,
          noop
        )
      })

      const { lifeCycle, rawRumEvents } = build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: createTraceIdentifier(),
          traceId: createTraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toBeUndefined()
    })

    it('should define rule_psr to 0 if traceSampleRate is set to 0', () => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, pageStateHistory }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
            traceSampleRate: 0,
          })!,
          pageStateHistory,
          noop
        )
      })

      const { lifeCycle, rawRumEvents } = build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: createTraceIdentifier(),
          traceId: createTraceIdentifier(),
        })
      )
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toEqual(0)
    })
  })

  it('should collect handlingStack from completed fetch request', () => {
    const { lifeCycle, rawRumEvents } = build()
    const response = new Response()
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest({ response }))
    const domainContext = rawRumEvents[0].domainContext as RumFetchResourceEventDomainContext

    expect(domainContext.handlingStack).toMatch(HANDLING_STACK_REGEX)
  })

  it('should collect handlingStack from completed XHR request', () => {
    const { lifeCycle, rawRumEvents } = build()
    const xhr = new XMLHttpRequest()
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest({ xhr }))

    const domainContext = rawRumEvents[0].domainContext as RumXhrResourceEventDomainContext

    expect(domainContext.handlingStack).toMatch(HANDLING_STACK_REGEX)
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
    handlingStack:
      'Error: \n  at <anonymous> @ http://localhost/foo.js:1:2\n    at <anonymous> @ http://localhost/vendor.js:1:2',
    ...details,
  }
  return request as RequestCompleteEvent
}
