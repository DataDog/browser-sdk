import type { Duration, RelativeTime, ServerDuration, TaskQueue, TimeStamp } from '@datadog/browser-core'
import { createTaskQueue, noop, RequestType, ResourceType } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumFetchResourceEventDomainContext, RumXhrResourceEventDomainContext } from '../../domainContext.types'
import {
  collectAndValidateRawRumEvents,
  createPerformanceEntry,
  mockPageStateHistory,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../test'
import type { RawRumEvent, RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import type { RumConfiguration } from '../configuration'
import { validateAndBuildRumConfiguration } from '../configuration'
import type { RumPerformanceEntry } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { createSpanIdentifier, createTraceIdentifier } from '../tracing/identifier'
import { startResourceCollection } from './resourceCollection'

const HANDLING_STACK_REGEX = /^Error: \n\s+at <anonymous> @/
const baseConfiguration = mockRumConfiguration()
const pageStateHistory = mockPageStateHistory()

describe('resourceCollection', () => {
  let lifeCycle: LifeCycle
  let wasInPageStateDuringPeriodSpy: jasmine.Spy<jasmine.Func>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let taskQueuePushSpy: jasmine.Spy<TaskQueue['push']>

  function setupResourceCollection(partialConfig: Partial<RumConfiguration> = { trackResources: true }) {
    lifeCycle = new LifeCycle()
    const taskQueue = createTaskQueue()
    taskQueuePushSpy = spyOn(taskQueue, 'push')
    const startResult = startResourceCollection(
      lifeCycle,
      { ...baseConfiguration, ...partialConfig },
      pageStateHistory,
      taskQueue,
      noop
    )

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

    registerCleanupTask(() => {
      startResult.stop()
    })
  }

  beforeEach(() => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    wasInPageStateDuringPeriodSpy = spyOn(pageStateHistory, 'wasInPageStateDuringPeriod')
  })

  it('should create resource from performance entry', () => {
    setupResourceCollection()

    const performanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      encodedBodySize: 42,
      decodedBodySize: 51,
      transferSize: 63,
      renderBlockingStatus: 'blocking',
      deliveryType: 'cache',
      responseStart: 250 as RelativeTime,
    })
    notifyPerformanceEntries([performanceEntry])
    runTasks()

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
        type: ResourceType.IMAGE,
        url: 'https://resource.com/valid',
        download: jasmine.any(Object),
        first_byte: jasmine.any(Object),
        status_code: 200,
        protocol: 'HTTP/1.0',
        delivery_type: 'cache',
        render_blocking_status: 'blocking',
        method: undefined,
        graphql: undefined,
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
    setupResourceCollection()
    const xhr = new XMLHttpRequest()
    notifyRequest({
      request: {
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 200 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.XHR,
        url: 'https://resource.com/valid',
        xhr,
        isAborted: false,
      },
    })

    expect(rawRumEvents[0].startTime).toBe(200 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        method: 'GET',
        status_code: 200,
        delivery_type: 'cache',
        protocol: 'HTTP/1.0',
        type: ResourceType.XHR,
        url: 'https://resource.com/valid',
        render_blocking_status: 'non-blocking',
        size: undefined,
        encoded_body_size: undefined,
        decoded_body_size: undefined,
        transfer_size: undefined,
        download: { duration: 100000000 as ServerDuration, start: 0 as ServerDuration },
        first_byte: { duration: 0 as ServerDuration, start: 0 as ServerDuration },
        graphql: undefined,
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      xhr,
      performanceEntry: jasmine.any(Object),
      isAborted: false,
      handlingStack: jasmine.stringMatching(HANDLING_STACK_REGEX),
    })
  })

  describe('GraphQL metadata enrichment', () => {
    interface TestCase {
      requestType: RequestType
      name: string
    }

    const testCases: TestCase[] = [
      { requestType: RequestType.FETCH, name: 'FETCH' },
      { requestType: RequestType.XHR, name: 'XHR' },
    ]

    testCases.forEach(({ requestType, name }) => {
      describe(`for ${name} requests`, () => {
        function createRequest(requestType: RequestType, url: string, requestBody: string) {
          const baseRequest = {
            type: requestType,
            url,
            method: 'POST' as const,
          }

          if (requestType === RequestType.FETCH) {
            return {
              ...baseRequest,
              init: {
                method: 'POST' as const,
                body: requestBody,
              },
              input: url,
              requestBody,
            }
          }
          {
            // XHR
            return {
              ...baseRequest,
              requestBody,
              status: 200,
              duration: 100 as Duration,
              startClocks: { relative: 200 as RelativeTime, timeStamp: 123456789 as TimeStamp },
              isAborted: false,
            }
          }
        }

        it('should enrich resource with GraphQL metadata when the URL matches allowedGraphQlUrls', () => {
          setupResourceCollection({
            trackResources: true,
            allowedGraphQlUrls: [{ match: 'https://api.example.com/graphql', trackPayload: true }],
          })

          const requestBody = JSON.stringify({
            query: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
            operationName: 'GetUser',
            variables: { id: '123' },
          })

          notifyRequest({
            request: createRequest(requestType, 'https://api.example.com/graphql', requestBody),
          })

          expect(rawRumEvents[0].rawRumEvent).toEqual(
            jasmine.objectContaining({
              resource: jasmine.objectContaining({
                graphql: {
                  operationType: 'query',
                  operationName: 'GetUser',
                  variables: '{"id":"123"}',
                  payload: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
                },
              }),
            })
          )
        })

        it('should not enrich resource with GraphQL metadata when URL does not match', () => {
          setupResourceCollection({
            trackResources: true,
            allowedGraphQlUrls: [{ match: '/graphql', trackPayload: false }],
          })

          const requestBody = JSON.stringify({
            query: 'query GetUser { user { name } }',
          })

          notifyRequest({
            request: createRequest(requestType, 'https://api.example.com/api/rest', requestBody),
          })

          const resourceEvent = rawRumEvents[0].rawRumEvent as any
          expect(resourceEvent.resource.graphql).toBeUndefined()
        })

        it('should not include payload when trackPayload is false', () => {
          setupResourceCollection({
            trackResources: true,
            allowedGraphQlUrls: [{ match: 'https://api.example.com/graphql', trackPayload: false }],
          })

          const requestBody = JSON.stringify({
            query: 'mutation CreateUser { createUser { id } }',
            operationName: 'CreateUser',
            variables: { name: 'John' },
          })

          notifyRequest({
            request: createRequest(requestType, 'https://api.example.com/graphql', requestBody),
          })

          expect(rawRumEvents[0].rawRumEvent).toEqual(
            jasmine.objectContaining({
              resource: jasmine.objectContaining({
                graphql: {
                  operationType: 'mutation',
                  operationName: 'CreateUser',
                  variables: '{"name":"John"}',
                  payload: undefined,
                },
              }),
            })
          )
        })
      })
    })
  })

  describe('with trackEarlyRequests enabled', () => {
    it('creates a resource from a performance entry without a matching request', () => {
      setupResourceCollection({ trackResources: true, trackEarlyRequests: true })

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          initiatorType: RequestType.FETCH,
        }),
      ])
      runTasks()

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0].startTime).toBe(200 as RelativeTime)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        resource: {
          id: jasmine.any(String),
          duration: (100 * 1e6) as ServerDuration,
          method: undefined,
          status_code: 200,
          delivery_type: 'cache',
          protocol: 'HTTP/1.0',
          type: ResourceType.FETCH,
          url: 'https://resource.com/valid',
          render_blocking_status: 'non-blocking',
          size: undefined,
          encoded_body_size: undefined,
          decoded_body_size: undefined,
          transfer_size: undefined,
          download: { duration: 100000000 as ServerDuration, start: 0 as ServerDuration },
          first_byte: { duration: 0 as ServerDuration, start: 0 as ServerDuration },
          graphql: undefined,
        },
        type: RumEventType.RESOURCE,
        _dd: {
          discarded: false,
        },
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        performanceEntry: jasmine.any(Object),
      })
    })
  })

  describe('when trackResource is false', () => {
    describe('and resource is not traced', () => {
      it('should not collect a resource from a performance entry', () => {
        setupResourceCollection({ trackResources: false })

        notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])
        runTasks()

        expect(rawRumEvents.length).toBe(0)
      })

      it('should not collect a resource from a completed XHR request', () => {
        setupResourceCollection({ trackResources: false })
        notifyRequest({
          request: {
            type: RequestType.XHR,
          },
        })

        expect(rawRumEvents.length).toBe(0)
      })
    })

    describe('and resource is traced', () => {
      it('should collect a resource from a performance entry', () => {
        setupResourceCollection({ trackResources: false })

        notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { traceId: '1234' })])
        runTasks()

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
      })

      it('should collect a resource from a completed XHR request', () => {
        setupResourceCollection({ trackResources: false })
        notifyRequest({
          request: {
            type: RequestType.XHR,
            traceId: createTraceIdentifier(),
            spanId: createSpanIdentifier(),
            traceSampled: true,
          },
        })

        expect(rawRumEvents.length).toBe(1)
        expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd.discarded).toBeTrue()
      })
    })
  })

  it('should not have a duration if a frozen state happens during the request and no performance entry matches', () => {
    setupResourceCollection()
    wasInPageStateDuringPeriodSpy.and.returnValue(true)

    notifyRequest({
      // For now, this behavior only happens when there is no performance entry matching the request
      notifyPerformanceEntry: false,
    })

    const rawRumResourceEventFetch = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
    expect(rawRumResourceEventFetch.resource.duration).toBeUndefined()
  })

  it('should create resource from completed fetch request', () => {
    setupResourceCollection()
    const response = new Response()
    notifyRequest({
      request: {
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 200 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.FETCH,
        url: 'https://resource.com/valid',
        response,
        input: 'https://resource.com/valid',
        init: { headers: { foo: 'bar' } },
        isAborted: false,
      },
    })

    expect(rawRumEvents[0].startTime).toBe(200 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      resource: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
        method: 'GET',
        status_code: 200,
        delivery_type: 'cache',
        protocol: 'HTTP/1.0',
        type: ResourceType.FETCH,

        render_blocking_status: 'non-blocking',
        size: undefined,
        encoded_body_size: undefined,
        decoded_body_size: undefined,
        transfer_size: undefined,
        download: { duration: 100000000 as ServerDuration, start: 0 as ServerDuration },
        first_byte: { duration: 0 as ServerDuration, start: 0 as ServerDuration },
        url: 'https://resource.com/valid',
        graphql: undefined,
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      performanceEntry: jasmine.any(Object),
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
      setupResourceCollection()
      notifyRequest({
        request: { type: RequestType.FETCH, input },
      })

      expect(rawRumEvents.length).toBe(1)
      expect((rawRumEvents[0].domainContext as RumFetchResourceEventDomainContext).requestInput).toBe(input)
    })
  })

  it('should include the error in failed fetch requests', () => {
    setupResourceCollection()
    const error = new Error()
    notifyRequest({
      request: { type: RequestType.FETCH, error },
    })

    expect(rawRumEvents[0].domainContext).toEqual(
      jasmine.objectContaining({
        error,
      })
    )
  })

  it('should discard 0 status code', () => {
    setupResourceCollection()
    const performanceEntry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { responseStatus: 0 })
    notifyPerformanceEntries([performanceEntry])
    runTasks()
    expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent).resource.status_code).toBeUndefined()
  })

  describe('tracing info', () => {
    it('should be processed from traced initial document', () => {
      setupResourceCollection()
      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { traceId: '1234' })])
      runTasks()
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields).toBeDefined()
      expect(privateFields.trace_id).toBe('1234')
      expect(privateFields.span_id).toEqual(jasmine.any(String))
    })

    it('should be processed from sampled completed request', () => {
      setupResourceCollection()
      notifyRequest({
        request: {
          traceSampled: true,
          spanId: createSpanIdentifier(),
          traceId: createTraceIdentifier(),
        },
      })
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.trace_id).toBeDefined()
      expect(privateFields.span_id).toBeDefined()
    })

    it('should not be processed from not sampled completed request', () => {
      setupResourceCollection()
      notifyRequest({
        request: {
          traceSampled: false,
          spanId: createSpanIdentifier(),
          traceId: createTraceIdentifier(),
        },
      })
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.trace_id).not.toBeDefined()
      expect(privateFields.span_id).not.toBeDefined()
    })

    it('should pull traceSampleRate from config if present', () => {
      const config = validateAndBuildRumConfiguration({
        clientToken: 'xxx',
        applicationId: 'xxx',
        traceSampleRate: 60,
      })!
      setupResourceCollection(config)

      notifyRequest({
        request: {
          traceSampled: true,
          spanId: createSpanIdentifier(),
          traceId: createTraceIdentifier(),
        },
      })
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toEqual(0.6)
    })

    it('should not define rule_psr if traceSampleRate is undefined', () => {
      const config = validateAndBuildRumConfiguration({
        clientToken: 'xxx',
        applicationId: 'xxx',
      })!
      setupResourceCollection(config)

      notifyRequest({
        request: {
          traceSampled: true,
          spanId: createSpanIdentifier(),
          traceId: createTraceIdentifier(),
        },
      })
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toBeUndefined()
    })

    it('should define rule_psr to 0 if traceSampleRate is set to 0', () => {
      const config = validateAndBuildRumConfiguration({
        clientToken: 'xxx',
        applicationId: 'xxx',
        traceSampleRate: 0,
      })!
      setupResourceCollection(config)

      notifyRequest({
        request: {
          traceSampled: true,
          spanId: createSpanIdentifier(),
          traceId: createTraceIdentifier(),
        },
      })
      const privateFields = (rawRumEvents[0].rawRumEvent as RawRumResourceEvent)._dd
      expect(privateFields.rule_psr).toEqual(0)
    })
  })

  it('should collect handlingStack from completed fetch request', () => {
    setupResourceCollection()
    const response = new Response()
    notifyRequest({ request: { type: RequestType.FETCH, response } })
    const domainContext = rawRumEvents[0].domainContext as RumFetchResourceEventDomainContext

    expect(domainContext.handlingStack).toMatch(HANDLING_STACK_REGEX)
  })

  it('should collect handlingStack from completed XHR request', () => {
    setupResourceCollection()
    const xhr = new XMLHttpRequest()
    notifyRequest({ request: { type: RequestType.XHR, xhr } })

    const domainContext = rawRumEvents[0].domainContext as RumXhrResourceEventDomainContext

    expect(domainContext.handlingStack).toMatch(HANDLING_STACK_REGEX)
  })

  it('collects handle resources in different tasks', () => {
    setupResourceCollection()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE),
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE),
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE),
    ])

    expect(taskQueuePushSpy).toHaveBeenCalledTimes(3)

    expect(rawRumEvents.length).toBe(0)

    taskQueuePushSpy.calls.allArgs().forEach(([task], index) => {
      task()
      expect(rawRumEvents.length).toBe(index + 1)
    })
  })

  function runTasks() {
    taskQueuePushSpy.calls.allArgs().forEach(([task]) => {
      task()
    })
    taskQueuePushSpy.calls.reset()
  }

  function notifyRequest({
    request,
    notifyPerformanceEntry = true,
  }: { request?: Partial<RequestCompleteEvent>; notifyPerformanceEntry?: boolean } = {}) {
    const requestCompleteEvent = {
      duration: 100 as Duration,
      method: 'GET',
      startClocks: { relative: 200 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      status: 200,
      type: RequestType.XHR,
      url: 'https://resource.com/valid',
      handlingStack:
        'Error: \n  at <anonymous> @ http://localhost/foo.js:1:2\n    at <anonymous> @ http://localhost/vendor.js:1:2',
      ...request,
    } satisfies Partial<RequestCompleteEvent> as RequestCompleteEvent

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, requestCompleteEvent)

    if (notifyPerformanceEntry) {
      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          initiatorType: requestCompleteEvent.type === RequestType.FETCH ? 'fetch' : 'xmlhttprequest',
        }),
      ])
    }

    runTasks()
  }
})
