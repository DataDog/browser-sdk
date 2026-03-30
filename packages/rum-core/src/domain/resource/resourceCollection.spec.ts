import type { Duration, RelativeTime, ServerDuration, TaskQueue, TimeStamp } from '@datadog/browser-core'
import {
  createTaskQueue,
  noop,
  RequestType,
  ResourceType,
  addExperimentalFeatures,
  ExperimentalFeature,
  display,
} from '@datadog/browser-core'
import { replaceMockable, registerCleanupTask } from '@datadog/browser-core/test'
import { resetExperimentalFeatures } from '@datadog/browser-core/src/tools/experimentalFeatures'
import type { RumResourceEventDomainContext } from '../../domainContext.types'
import {
  collectAndValidateRawRumEvents,
  createPerformanceEntry,
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
import type { RumPerformanceEntry, RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { createSpanIdentifier, createTraceIdentifier } from '../tracing/identifier'
import { startResourceCollection } from './resourceCollection'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'

const HANDLING_STACK_REGEX = /^Error: \n\s+at <anonymous> @/
const baseConfiguration = mockRumConfiguration()

describe('resourceCollection', () => {
  let lifeCycle: LifeCycle
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let taskQueuePushSpy: jasmine.Spy<TaskQueue['push']>

  function setupResourceCollection(partialConfig: Partial<RumConfiguration> = { trackResources: true }) {
    replaceMockable(retrieveInitialDocumentResourceTiming, noop)
    lifeCycle = new LifeCycle()
    const taskQueue = createTaskQueue()
    replaceMockable(createTaskQueue, () => taskQueue)
    taskQueuePushSpy = spyOn(taskQueue, 'push')
    const startResult = startResourceCollection(lifeCycle, { ...baseConfiguration, ...partialConfig })

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

    registerCleanupTask(() => {
      startResult.stop()
    })
  }

  beforeEach(() => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
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

    expect(rawRumEvents[0].startClocks.relative).toBe(200 as RelativeTime)
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
      isManual: false,
      isAborted: false,
      handlingStack: undefined,
      requestInit: undefined,
      requestInput: undefined,
      response: undefined,
      error: undefined,
      xhr: undefined,
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

    expect(rawRumEvents[0].startClocks.relative).toBe(200 as RelativeTime)
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
      isManual: false,
      requestInit: undefined,
      requestInput: undefined,
      response: undefined,
      error: undefined,
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

  describe('HTTP response metadata enrichment', () => {
    it('should extract content-type from performance entry when available', () => {
      setupResourceCollection()

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          contentType: 'image/png',
        }),
      ])
      runTasks()

      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          resource: jasmine.objectContaining({
            response: {
              headers: {
                'content-type': 'image/png',
              },
            },
          }),
        })
      )
    })

    it('should not include response when no content-type is available', () => {
      setupResourceCollection()

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {})])
      runTasks()

      const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(resourceEvent.resource.response).toBeUndefined()
    })
  })

  it('creates a resource from a performance entry without a matching request', () => {
    setupResourceCollection({ trackResources: true })

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        initiatorType: RequestType.FETCH,
      }),
    ])
    runTasks()

    expect(rawRumEvents.length).toBe(1)
    expect(rawRumEvents[0].startClocks.relative).toBe(200 as RelativeTime)
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
      isManual: false,
      isAborted: false,
      handlingStack: undefined,
      requestInit: undefined,
      requestInput: undefined,
      response: undefined,
      error: undefined,
      xhr: undefined,
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

    expect(rawRumEvents[0].startClocks.relative).toBe(200 as RelativeTime)
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
      isManual: false,
      xhr: undefined,
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
      expect((rawRumEvents[0].domainContext as RumResourceEventDomainContext).requestInput).toBe(input)
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

  describe('network headers', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.TRACK_RESOURCE_HEADERS])
    })

    describe('Fetch', () => {
      it('should extract matching response headers from Fetch', () => {
        setupResourceCollection({ trackResourceHeaders: ['content-type', 'cache-control'] })

        notifyRequest({
          request: {
            type: RequestType.FETCH,
            response: new Response('', {
              headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache', 'X-Other': 'ignored' },
            }),
          },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        expect(event.resource.response).toEqual({
          headers: {
            'content-type': 'text/html',
            'cache-control': 'no-cache',
          },
        })
      })

      it('should extract matching request headers from Fetch', () => {
        setupResourceCollection({ trackResourceHeaders: ['x-custom'] })

        notifyRequest({
          request: {
            type: RequestType.FETCH,
            init: { headers: { 'X-Custom': 'my-value', 'X-Other': 'ignored' } },
            response: new Response(''),
          },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        expect(event.resource.request).toEqual({
          headers: { 'x-custom': 'my-value' },
        })
      })

      it('should extract request headers from Fetch Request input', () => {
        setupResourceCollection({ trackResourceHeaders: ['x-custom'] })

        notifyRequest({
          request: {
            type: RequestType.FETCH,
            input: new Request('https://example.com', { headers: { 'X-Custom': 'from-request' } }),
            response: new Response(''),
          },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        expect(event.resource.request).toEqual({
          headers: { 'x-custom': 'from-request' },
        })
      })
    })

    describe('XHR', () => {
      it('should extract matching response headers from XHR', () => {
        setupResourceCollection({ trackResourceHeaders: ['content-type', 'cache-control'] })

        const xhr = new XMLHttpRequest()
        spyOn(xhr, 'getAllResponseHeaders').and.returnValue(
          'Content-Type: application/json\r\nCache-Control: max-age=300\r\nX-Other: ignored\r\n'
        )

        notifyRequest({
          request: { type: RequestType.XHR, xhr },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        expect(event.resource.response).toEqual({
          headers: {
            'content-type': 'application/json',
            'cache-control': 'max-age=300',
          },
        })
      })

      // TODO: Remove this test when we support request headers for XHR
      it('should not extract request headers from XHR', () => {
        setupResourceCollection({ trackResourceHeaders: ['content-type'] })

        const xhr = new XMLHttpRequest()
        spyOn(xhr, 'getAllResponseHeaders').and.returnValue('Content-Type: text/html\r\n')

        notifyRequest({
          request: { type: RequestType.XHR, xhr },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        expect(event.resource.request).toBeUndefined()
      })
    })

    it('should not collect headers when trackResourceHeaders is empty', () => {
      setupResourceCollection({ trackResourceHeaders: [] })

      notifyRequest({
        request: {
          type: RequestType.FETCH,
          response: new Response('', { headers: { 'content-type': 'text/html', 'cache-control': 'no-cache' } }),
          input: new Request('https://example.com/resource', { headers: { 'x-some-header': 'some-value' } }),
        },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(event.resource.request).toBeUndefined()
      expect(event.resource.response).toBeUndefined()
    })

    it('should override perf entry content-type with network content-type', () => {
      setupResourceCollection({ trackResourceHeaders: ['content-type'] })

      notifyRequest({
        request: {
          type: RequestType.FETCH,
          response: new Response('', { headers: { 'Content-Type': 'application/json' } }),
        },
        performanceEntryOverrides: { contentType: 'text/html' },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(event.resource.response!.headers!['content-type']).toBe('application/json')
    })

    it('should preserve perf entry content-type when no request object', () => {
      setupResourceCollection({ trackResourceHeaders: ['content-type'] })

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { contentType: 'image/png' })])
      runTasks()

      const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(event.resource.response!.headers!['content-type']).toBe('image/png')
    })

    it('should lowercase header names', () => {
      setupResourceCollection({ trackResourceHeaders: ['x-custom-header'] })

      notifyRequest({
        request: {
          type: RequestType.FETCH,
          response: new Response('', { headers: { 'X-Custom-Header': 'value' } }),
        },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(event.resource.response!.headers!['x-custom-header']).toBe('value')
    })

    it('should support RegExp matchers', () => {
      setupResourceCollection({ trackResourceHeaders: [/^x-custom/] })

      notifyRequest({
        request: {
          type: RequestType.FETCH,
          response: new Response('', { headers: { 'X-Custom-One': 'a', 'X-Custom-Two': 'b', 'Cache-Control': 'no' } }),
        },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(event.resource.response!.headers!['x-custom-one']).toBe('a')
      expect(event.resource.response!.headers!['x-custom-two']).toBe('b')
      expect(event.resource.response!.headers!['cache-control']).toBeUndefined()
    })

    it('should support function matchers', () => {
      setupResourceCollection({ trackResourceHeaders: [(name: string) => name.startsWith('x-')] })

      notifyRequest({
        request: {
          type: RequestType.FETCH,
          response: new Response('', { headers: { 'X-Foo': 'bar', 'Content-Type': 'text/html' } }),
        },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(event.resource.response!.headers!['x-foo']).toBe('bar')
      expect(event.resource.response!.headers!['content-type']).toBeUndefined()
    })

    it('should not collect headers when experimental feature is disabled', () => {
      resetExperimentalFeatures()
      setupResourceCollection({ trackResourceHeaders: ['content-type'] })

      notifyRequest({
        request: {
          type: RequestType.FETCH,
          response: new Response('', { headers: { 'Content-Type': 'text/html' } }),
        },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(event.resource.response).toBeUndefined()
    })

    describe('forbidden headers', () => {
      const forbiddenHeaders = [
        'authorization',
        'x-api-key',
        'x-access-token',
        'x-auth-token',
        'x-session-token',
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip',
        'true-client-ip',
        'x-csrf-token',
        'x-xsrf-token',
        'x-security-token',
      ]

      forbiddenHeaders.forEach((header) => {
        it(`should not capture forbidden response header: ${header}`, () => {
          setupResourceCollection({ trackResourceHeaders: forbiddenHeaders })

          notifyRequest({
            request: {
              type: RequestType.FETCH,
              response: new Response('', { headers: { [header]: 'secret-value' } }),
            },
          })

          const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
          expect(event.resource.response?.headers?.[header]).toBeUndefined()
        })

        it(`should not capture forbidden request header: ${header}`, () => {
          setupResourceCollection({ trackResourceHeaders: forbiddenHeaders })

          notifyRequest({
            request: {
              type: RequestType.FETCH,
              init: { headers: { [header]: 'secret-value' } },
              response: new Response(''),
            },
          })

          const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
          expect(event.resource.request?.headers?.[header]).toBeUndefined()
        })
      })
    })

    describe('limit headers size', () => {
      it('should truncate header values exceeding the max length', () => {
        const displaySpy = spyOn(display, 'warn')
        setupResourceCollection({ trackResourceHeaders: ['x-long'] })
        const longValue = 'a'.repeat(200)

        notifyRequest({
          request: {
            type: RequestType.FETCH,
            response: new Response('', { headers: { 'X-Long': longValue } }),
          },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        expect(event.resource.response!.headers!['x-long']).toBe('a'.repeat(128))
        expect(displaySpy).toHaveBeenCalledOnceWith('Header "x-long" value was truncated from 200 to 128 characters.')
      })

      it('should limit the number of collected headers', () => {
        spyOn(display, 'warn')
        const headerNames = Array.from({ length: 101 }, (_, i) => `x-header-${i}`)
        setupResourceCollection({ trackResourceHeaders: headerNames })

        const headerEntries: Record<string, string> = {}
        for (const name of headerNames) {
          headerEntries[name] = 'value'
        }

        notifyRequest({
          request: {
            type: RequestType.FETCH,
            response: new Response('', { headers: headerEntries }),
          },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        expect(Object.keys(event.resource.response!.headers!).length).toBe(100)
      })

      it('should only count headers that pass filtering toward the limit', () => {
        spyOn(display, 'warn')
        const allowedHeaders = Array.from({ length: 100 }, (_, i) => `x-header-${i}`)
        // Include a forbidden header name in the matchers - it won't be counted
        const allMatchers = [...allowedHeaders, 'authorization', 'x-extra']
        setupResourceCollection({ trackResourceHeaders: allMatchers })

        const headerEntries: Record<string, string> = {}
        // The forbidden header comes first but should not count toward the limit
        headerEntries['Authorization'] = 'secret'
        for (const name of allowedHeaders) {
          headerEntries[name] = 'value'
        }
        headerEntries['X-Extra'] = 'extra-value'

        notifyRequest({
          request: {
            type: RequestType.FETCH,
            response: new Response('', { headers: headerEntries }),
          },
        })

        const event = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
        const collectedHeaders = event.resource.response!.headers!
        expect(Object.keys(collectedHeaders).length).toBe(100)
        expect(collectedHeaders['authorization']).toBeUndefined()
      })

      it('should warn when the max number of headers is reached', () => {
        const displaySpy = spyOn(display, 'warn')
        const headerNames = Array.from({ length: 110 }, (_, i) => `x-header-${i}`)
        setupResourceCollection({ trackResourceHeaders: headerNames })

        const headerEntries: Record<string, string> = {}
        for (const name of headerNames) {
          headerEntries[name] = 'value'
        }

        notifyRequest({
          request: {
            type: RequestType.FETCH,
            response: new Response('', { headers: headerEntries }),
          },
        })

        expect(displaySpy).toHaveBeenCalledOnceWith(
          'Maximum number of headers (100) has been reached. Further headers are dropped.'
        )
      })
    })
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
    const domainContext = rawRumEvents[0].domainContext as RumResourceEventDomainContext

    expect(domainContext.handlingStack).toMatch(HANDLING_STACK_REGEX)
  })

  it('should collect handlingStack from completed XHR request', () => {
    setupResourceCollection()
    const xhr = new XMLHttpRequest()
    notifyRequest({ request: { type: RequestType.XHR, xhr } })

    const domainContext = rawRumEvents[0].domainContext as RumResourceEventDomainContext

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
    performanceEntryOverrides,
  }: {
    request?: Partial<RequestCompleteEvent>
    notifyPerformanceEntry?: boolean
    performanceEntryOverrides?: Partial<RumPerformanceResourceTiming>
  } = {}) {
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
          name: requestCompleteEvent.url,
          ...performanceEntryOverrides,
        }),
      ])
    }

    runTasks()
  }
})
