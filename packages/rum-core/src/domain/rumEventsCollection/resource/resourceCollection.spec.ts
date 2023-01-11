import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import {
  relativeToClocks,
  resetExperimentalFeatures,
  updateExperimentalFeatures,
  isIE,
  RequestType,
  ResourceType,
} from '@datadog/browser-core'
import { createResourceEntry } from '../../../../test/fixtures'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup } from '../../../../test/specHelper'
import type { RawRumResourceEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RequestCompleteEvent } from '../../requestCollection'
import { TraceIdentifier } from '../../tracing/tracer'
import { validateAndBuildRumConfiguration } from '../../configuration'
import { createRumSessionManagerMock } from '../../../../test/mockRumSessionManager'
import { PageState } from '../../contexts/pageStateHistory'
import { startResourceCollection } from './resourceCollection'

describe('resourceCollection', () => {
  let setupBuilder: TestSetupBuilder

  let pageStateHistorySpy: jasmine.Spy<jasmine.Func>
  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager, pageStateHistory }) => {
      pageStateHistorySpy = spyOn(pageStateHistory, 'findAll')
      startResourceCollection(
        lifeCycle,
        validateAndBuildRumConfiguration({ clientToken: 'xxx', applicationId: 'xxx' })!,
        sessionManager,
        pageStateHistory
      )
    })
  })

  afterEach(() => {
    resetExperimentalFeatures()
    setupBuilder.cleanup()
  })

  it('should create resource from performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const performanceEntry = createResourceEntry({
      duration: 100 as Duration,
      name: 'https://resource.com/valid',
      startTime: 1234 as RelativeTime,
    })
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [performanceEntry])

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number) as unknown as TimeStamp,
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        size: undefined,
        type: ResourceType.OTHER,
        url: 'https://resource.com/valid',
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: false,
        page_states: undefined,
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
        page_states: undefined,
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

  it('should collect page states on resources when ff resource_page_states enabled', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const mockPageStates = [{ state: PageState.ACTIVE, startTime: 0 as RelativeTime }]
    const mockXHR = createCompletedRequest()
    const mockPerformanceEntry = createResourceEntry()

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

  it('should collect computed duration and performance entry duration when resource_durations ff is enabled', () => {
    updateExperimentalFeatures(['resource_durations'])

    const match = createResourceEntry({ startTime: 200 as RelativeTime, duration: 300 as Duration })
    spyOn(performance, 'getEntriesByName').and.returnValues([match] as unknown as PerformanceResourceTiming[])

    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(
      LifeCycleEventType.REQUEST_COMPLETED,
      createCompletedRequest({
        duration: 500 as Duration,
        method: 'GET',
        startClocks: relativeToClocks(100 as RelativeTime),
        status: 200,
        type: RequestType.FETCH,
        url: 'https://resource.com/valid',
        input: 'https://resource.com/valid',
      })
    )
    const rawRumResourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
    expect(rawRumResourceEvent._dd).toEqual(
      jasmine.objectContaining({
        computed_duration: 500000000,
        performance_entry_duration: 300000000,
      })
    )
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
        page_states: undefined,
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
        createResourceEntry({
          traceId: '1234',
        }),
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

  describe('indexing info', () => {
    it('should be discarded=true if session is not tracked', () => {
      setupBuilder.withSessionManager(createRumSessionManagerMock().setNotTracked())
      const { lifeCycle, rawRumEvents } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [createResourceEntry()])

      expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
    })

    it('should be discarded=true if session does not allow resources', () => {
      setupBuilder.withSessionManager(createRumSessionManagerMock().setResourceAllowed(false))
      const { lifeCycle, rawRumEvents } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [createResourceEntry()])

      expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
    })

    it('should be discarded=false if session allows resources', () => {
      setupBuilder.withSessionManager(createRumSessionManagerMock().setResourceAllowed(true))
      const { lifeCycle, rawRumEvents } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [createResourceEntry()])

      expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeFalse()
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
