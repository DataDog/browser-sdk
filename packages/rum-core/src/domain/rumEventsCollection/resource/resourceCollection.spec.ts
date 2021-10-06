import {
  Duration,
  isIE,
  RelativeTime,
  RequestType,
  ResourceType,
  ServerDuration,
  TimeStamp,
} from '@datadog/browser-core'
import { createResourceEntry } from '../../../../test/fixtures'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RawRumResourceEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { RequestCompleteEvent } from '../../requestCollection'
import { TraceIdentifier } from '../../tracing/tracer'
import { startResourceCollection } from './resourceCollection'

describe('resourceCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      startResourceCollection(lifeCycle)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create resource from performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const performanceEntry = createResourceEntry({
      duration: 100 as Duration,
      name: 'https://resource.com/valid',
      startTime: 1234 as RelativeTime,
    })
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceEntry)

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: (jasmine.any(Number) as unknown) as TimeStamp,
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        size: undefined,
        type: ResourceType.OTHER,
        url: 'https://resource.com/valid',
      },
      type: RumEventType.RESOURCE,
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
      lifeCycle.notify(
        LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
        createResourceEntry({
          traceId: '1234',
        })
      )
      const traceInfo = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd!
      expect(traceInfo).toBeDefined()
      expect(traceInfo.trace_id).toBe('1234')
    })

    it('should be processed from completed request', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      const traceInfo = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd!
      expect(traceInfo).toBeDefined()
      expect(traceInfo.trace_id).toBeDefined()
      expect(traceInfo.span_id).toBeDefined()
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
