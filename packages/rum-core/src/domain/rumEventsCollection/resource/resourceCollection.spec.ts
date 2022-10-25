import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { isIE, RequestType, ResourceType } from '@datadog/browser-core'
import { createResourceEntry } from '../../../../test/fixtures'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup, stubPerformanceObserver, createCompletedRequest } from '../../../../test/specHelper'
import type { RawRumResourceEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { TraceIdentifier } from '../../tracing/tracer'
import { validateAndBuildRumConfiguration } from '../../configuration'
import { createRumSessionManagerMock } from '../../../../test/mockRumSessionManager'
import { startResourceCollection } from './resourceCollection'

describe('resourceCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager }) => {
      startResourceCollection(
        lifeCycle,
        validateAndBuildRumConfiguration({ clientToken: 'xxx', applicationId: 'xxx' })!,
        sessionManager
      )
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
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      performanceEntry,
    })
  })

  it('should create resource from completed XHR request', (done) => {
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

    setTimeout(() => {
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
          resolveDuration: undefined,
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
      done()
    })
  })

  it('should create resource from completed fetch request', (done) => {
    if (isIE()) {
      pending('No IE support')
    }

    const entry = createResourceEntry({
      startTime: 200 as RelativeTime,
      duration: 100 as Duration,
      responseStart: 220 as RelativeTime,
    })
    const { clear } = stubPerformanceObserver([entry])

    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const response = new Response()
    lifeCycle.notify(
      LifeCycleEventType.REQUEST_COMPLETED,
      createCompletedRequest({
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 200 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.FETCH,
        url: 'https://resource.com/valid',
        response,
        input: 'https://resource.com/valid',
        init: { headers: { foo: 'bar' } },
      })
    )

    setTimeout(() => {
      expect(rawRumEvents[0].startTime).toBe(200 as RelativeTime)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        resource: {
          id: jasmine.any(String),
          duration: (100 * 1e6) as ServerDuration,
          method: 'GET',
          status_code: 200,
          type: ResourceType.FETCH,
          url: 'https://resource.com/valid',
          size: jasmine.any(Number),
          download: jasmine.any(Object),
          first_byte: jasmine.any(Object),
        },
        type: RumEventType.RESOURCE,
        _dd: {
          discarded: false,
          resolveDuration: undefined,
        },
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        performanceEntry: jasmine.any(Object),
        xhr: undefined,
        response,
        requestInput: 'https://resource.com/valid',
        requestInit: { headers: { foo: 'bar' } },
        error: undefined,
      })
      clear()
      done()
    })
  })

  it('should include the error in failed fetch requests', (done) => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const error = new Error()
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest({ error }))

    setTimeout(() => {
      expect(rawRumEvents[0].domainContext).toEqual(
        jasmine.objectContaining({
          error,
        })
      )
      done()
    })
  })

  describe('tracing info', () => {
    it('should be processed from traced initial document', (done) => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createResourceEntry({
          traceId: '1234',
        }),
      ])
      setTimeout(() => {
        const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
        expect(privateFields).toBeDefined()
        expect(privateFields.trace_id).toBe('1234')
        done()
      })
    })

    it('should be processed from sampled completed request', (done) => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: true,
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      setTimeout(() => {
        const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
        expect(privateFields.trace_id).toBeDefined()
        expect(privateFields.span_id).toBeDefined()
        done()
      })
    })

    it('should not be processed from not sampled completed request', (done) => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          traceSampled: false,
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )
      setTimeout(() => {
        const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
        expect(privateFields.trace_id).not.toBeDefined()
        expect(privateFields.span_id).not.toBeDefined()
        done()
      })
    })

    it('should pull tracingSampleRate from config if present', (done) => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
            tracingSampleRate: 60,
          })!,
          sessionManager
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
      setTimeout(() => {
        const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
        expect(privateFields.rule_psr).toEqual(0.6)
        done()
      })
    })

    it('should not define rule_psr if tracingSampleRate is undefined', (done) => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
          })!,
          sessionManager
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
      setTimeout(() => {
        const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
        expect(privateFields.rule_psr).toBeUndefined()
        done()
      })
    })

    it('should define rule_psr to 0 if tracingSampleRate is set to 0', (done) => {
      setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager }) => {
        startResourceCollection(
          lifeCycle,
          validateAndBuildRumConfiguration({
            clientToken: 'xxx',
            applicationId: 'xxx',
            tracingSampleRate: 0,
          })!,
          sessionManager
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
      setTimeout(() => {
        const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
        expect(privateFields.rule_psr).toEqual(0)
        done()
      })
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
