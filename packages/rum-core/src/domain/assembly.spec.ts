import type { ClocksState, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { ErrorSource, HookNames, ONE_MINUTE, display, startGlobalContext } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { registerCleanupTask, mockClock } from '@datadog/browser-core/test'
import {
  createRumSessionManagerMock,
  createRawRumEvent,
  mockRumConfiguration,
  mockViewHistory,
  noopRecorderApi,
} from '../../test'
import type { RumEventDomainContext } from '../domainContext.types'
import type { RawRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumErrorEvent, RumEvent, RumResourceEvent } from '../rumEvent.types'
import { startRumAssembly } from './assembly'
import type { RawRumEventCollectedData } from './lifeCycle'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RumConfiguration } from './configuration'
import type { ViewHistory } from './contexts/viewHistory'
import type { RumSessionManager } from './rumSessionManager'
import { startSessionContext } from './contexts/sessionContext'
import { createHooks } from './hooks'

describe('rum assembly', () => {
  describe('beforeSend', () => {
    describe('fields modification', () => {
      describe('modifiable fields', () => {
        it('should allow modification', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.view.url = 'modified'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { view: { url: '/path?foo=bar' } }),
          })

          expect(serverRumEvents[0].view.url).toBe('modified')
        })

        it('should allow addition', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.view.name = 'added'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { view: { url: '/path?foo=bar' } }),
          })

          expect(serverRumEvents[0].view.name).toBe('added')
        })

        it('should allow modification of view.performance.lcp.resource_url', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.view.performance.lcp.resource_url = 'modified_url'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.VIEW, {
              view: { performance: { lcp: { resource_url: 'original_url' } } },
            }),
          })

          expect((serverRumEvents[0].view as any).performance.lcp.resource_url).toBe('modified_url')
        })
      })

      describe('context field', () => {
        it('should allow modification on context field for events other than views', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })

          expect(serverRumEvents[0].context!.foo).toBe('bar')
        })

        it('should allow replacing the context field for events other than views', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })

          expect(serverRumEvents[0].context!.foo).toBe('bar')
        })

        it('should empty the context field if set to null', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context = null
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { context: { foo: 'bar' } }),
          })

          expect(serverRumEvents[0].context).toBeUndefined()
        })

        it('should empty the context field if set to undefined', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context = undefined
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { context: { foo: 'bar' } }),
          })

          expect(serverRumEvents[0].context).toBeUndefined()
        })

        it('should empty the context field if deleted', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                delete event.context
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { context: { foo: 'bar' } }),
          })

          expect(serverRumEvents[0].context).toBeUndefined()
        })

        it('should define the context field even if the global context is empty', () => {
          const { lifeCycle } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                expect(event.context).toEqual({})
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })
        })

        it('should accept modification on context field for view events', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.VIEW),
          })

          expect(serverRumEvents[0].context).toEqual({ foo: 'bar' })
        })

        it('should reject replacing the context field to non-object', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context = 1
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { context: { foo: 'bar' } }),
          })

          expect(serverRumEvents[0].context!.foo).toBe('bar')
        })
      })

      describe('allowed customer provided field', () => {
        it('should allow modification of the error fingerprint', () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.error.fingerprint = 'my_fingerprint'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.ERROR),
          })

          expect((serverRumEvents[0] as RumErrorEvent).error.fingerprint).toBe('my_fingerprint')
        })
      })

      it('should reject modification of field not sensitive, context or customer provided', () => {
        const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            beforeSend: (event: RumEvent) => ((event.view as any).id = 'modified'),
          },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        expect(serverRumEvents[0].view.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      })

      it('should not allow to add a sensitive field on the wrong event type', () => {
        const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            beforeSend: (event) => {
              event.error = { message: 'added' }
            },
          },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        })

        expect((serverRumEvents[0] as any).error?.message).toBeUndefined()
      })
    })

    describe('events dismission', () => {
      it('should allow dismissing events other than views', () => {
        const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            beforeSend: () => false,
          },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.ERROR, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        expect(serverRumEvents.length).toBe(0)
      })

      it('should not allow dismissing view events', () => {
        const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            beforeSend: () => false,
          },
        })

        const displaySpy = spyOn(display, 'warn')
        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.VIEW, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        expect(serverRumEvents[0].view.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
        expect(displaySpy).toHaveBeenCalledWith("Can't dismiss view events using beforeSend!")
      })
    })

    it('should not dismiss when true is returned', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: {
          beforeSend: () => true,
        },
      })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        }),
      })

      expect(serverRumEvents.length).toBe(1)
    })

    it('should not dismiss when undefined is returned', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: {
          beforeSend: () => undefined,
        },
      })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        }),
      })

      expect(serverRumEvents.length).toBe(1)
    })
  })

  describe('service and version', () => {
    const extraConfigurationOptions = { service: 'default-service', version: 'default-version' }

    Object.values(RumEventType).forEach((eventType) => {
      it(`should be modifiable for ${eventType}`, () => {
        const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            ...extraConfigurationOptions,
            beforeSend: (event) => {
              event.service = 'bar'
              event.version = '0.2.0'

              return true
            },
          },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType),
        })
        expect((serverRumEvents[0] as RumResourceEvent).service).toBe('bar')
        expect((serverRumEvents[0] as RumResourceEvent).version).toBe('0.2.0')
      })
    })

    it('should be added to the event as ddtags', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: extraConfigurationOptions,
      })
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].ddtags).toEqual('sdk_version:test,service:default-service,version:default-version')
    })
  })

  describe('assemble hook', () => {
    it('should add and override common properties', () => {
      const { lifeCycle, hooks, serverRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: { service: 'default-service', version: 'default-version' },
      })

      hooks.register(HookNames.Assemble, ({ eventType }) => ({
        type: eventType,
        service: 'new service',
        version: 'new version',
        view: { id: 'new view id', url: '' },
      }))

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].service).toEqual('new service')
      expect(serverRumEvents[0].version).toEqual('new version')
      expect(serverRumEvents[0].view.id).toEqual('new view id')
    })

    it('should not override customer context', () => {
      const { lifeCycle, hooks, serverRumEvents } = setupAssemblyTestWithDefaults()

      hooks.register(HookNames.Assemble, ({ eventType }) => ({
        type: eventType,
        context: { foo: 'bar' },
      }))

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, { context: { foo: 'customer context' } }),
      })
      expect(serverRumEvents[0].context).toEqual({ foo: 'customer context' })
    })
  })

  describe('event generation condition', () => {
    it('when tracked, it should generate event', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(1)
    })

    it('when not tracked, it should not generate event', () => {
      const sessionManager = createRumSessionManagerMock().setNotTracked()
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({ sessionManager })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(0)
    })

    it('should get session state from event start', () => {
      const sessionManager = createRumSessionManagerMock()
      spyOn(sessionManager, 'findTrackedSession').and.callThrough()
      const { lifeCycle } = setupAssemblyTestWithDefaults({ sessionManager })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        startTime: 123 as RelativeTime,
      })

      expect(sessionManager.findTrackedSession).toHaveBeenCalledWith(123 as RelativeTime)
    })
  })
  ;[
    {
      eventType: RumEventType.ERROR,
      message: 'Reached max number of errors by minute: 1',
    },
    {
      eventType: RumEventType.ACTION,
      message: 'Reached max number of actions by minute: 1',
    },
    {
      eventType: RumEventType.VITAL,
      message: 'Reached max number of vitals by minute: 1',
    },
  ].forEach(({ eventType, message }) => {
    describe(`${eventType} events limitation`, () => {
      it(`stops sending ${eventType} events when reaching the limit`, () => {
        const { lifeCycle, serverRumEvents, reportErrorSpy } = setupAssemblyTestWithDefaults({
          partialConfiguration: { eventRateLimiterThreshold: 1 },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 100 as TimeStamp }),
        })
        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 200 as TimeStamp }),
        })

        expect(serverRumEvents.length).toBe(1)
        expect(serverRumEvents[0].date).toBe(100)
        expect(reportErrorSpy).toHaveBeenCalledTimes(1)
        expect(reportErrorSpy.calls.argsFor(0)[0]).toEqual(
          jasmine.objectContaining({
            message,
            source: ErrorSource.AGENT,
          })
        )
      })

      it(`does not take discarded ${eventType} events into account`, () => {
        const { lifeCycle, serverRumEvents, reportErrorSpy } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            eventRateLimiterThreshold: 1,
            beforeSend: (event) => {
              if (event.type === eventType && event.date === 100) {
                return false
              }
            },
          },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 100 as TimeStamp }),
        })
        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 100 as TimeStamp }),
        })
        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 100 as TimeStamp }),
        })
        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 200 as TimeStamp }),
        })
        expect(serverRumEvents.length).toBe(1)
        expect(serverRumEvents[0].date).toBe(200)
        expect(reportErrorSpy).not.toHaveBeenCalled()
      })

      describe('when clock ticks with one minute', () => {
        let clock: Clock
        beforeEach(() => {
          clock = mockClock()
        })

        it(`allows to send new ${eventType} events after a minute`, () => {
          const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: { eventRateLimiterThreshold: 1 },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(eventType, { date: 100 as TimeStamp }),
          })
          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(eventType, { date: 200 as TimeStamp }),
          })
          clock.tick(ONE_MINUTE)
          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(eventType, { date: 300 as TimeStamp }),
          })

          expect(serverRumEvents.length).toBe(2)
          expect(serverRumEvents[0].date).toBe(100)
          expect(serverRumEvents[1].date).toBe(300)
        })
      })
    })
  })

  describe('STREAM event processing', () => {
    it('should convert STREAM events to VIEW events', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({})

      const streamData = {
        id: 'stream-id-123',
        document_version: 42,
        time_spent: 5000000000, // 5 seconds in nanoseconds
      }

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.STREAM, {
          stream: streamData,
          view: { id: 'original-view-id', url: '/test' },
        }),
      })

      expect(serverRumEvents.length).toBe(1)
      const resultEvent = serverRumEvents[0]

      expect(resultEvent.type).toBe('view')
    })

    it('should map stream properties correctly in converted VIEW event', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({})

      const streamData = {
        id: 'stream-id-456',
        document_version: 25,
        time_spent: 3000000000, // 3 seconds in nanoseconds
      }

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.STREAM, {
          stream: streamData,
          view: { id: 'original-view-id', url: '/test-page' },
        }),
      })

      expect(serverRumEvents.length).toBe(1)
      const resultEvent = serverRumEvents[0] as any

      expect(resultEvent.stream).toBeDefined()

      // Check _dd.document_version is set from stream.document_version
      expect(resultEvent._dd.document_version).toBe(25)

      // Check view.id is set from stream.id
      expect(resultEvent.view.id).toBe('stream-id-456')

      // Check view.time_spent is set from stream.time_spent
      expect(resultEvent.view.time_spent).toBe(3000000000)

      // Check stream.time_spent is undefined in the stream object
      expect(resultEvent.stream.time_spent).toBeUndefined()

      // Check action/error/resource counts are set to 0
      expect(resultEvent.view.action.count).toBe(0)
      expect(resultEvent.view.error.count).toBe(0)
      expect(resultEvent.view.resource.count).toBe(0)
    })
  })
})

function notifyRawRumEvent<E extends RawRumEvent>(
  lifeCycle: LifeCycle,
  partialData: Omit<RawRumEventCollectedData<E>, 'startTime' | 'domainContext'> &
    Partial<Pick<RawRumEventCollectedData<E>, 'startTime' | 'domainContext'>>
) {
  const fullData = {
    startTime: 0 as RelativeTime,
    domainContext: {} as RumEventDomainContext,
    ...partialData,
  }
  lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, fullData)
}

interface AssemblyTestParams {
  partialConfiguration?: Partial<RumConfiguration>
  sessionManager?: RumSessionManager
  ciVisibilityContext?: Record<string, string>
  findView?: ViewHistory['findView']
}

function setupAssemblyTestWithDefaults({
  partialConfiguration,
  sessionManager,
  findView = () => ({ id: '7890', name: 'view name', startClocks: {} as ClocksState, sessionIsActive: false }),
}: AssemblyTestParams = {}) {
  const lifeCycle = new LifeCycle()
  const hooks = createHooks()
  const reportErrorSpy = jasmine.createSpy('reportError')
  const rumSessionManager = sessionManager ?? createRumSessionManagerMock().setId('1234')
  const serverRumEvents: RumEvent[] = []
  const subscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent) => {
    serverRumEvents.push(serverRumEvent)
  })
  const recorderApi = noopRecorderApi
  const viewHistory = { ...mockViewHistory(), findView: () => findView() }
  startGlobalContext(hooks, mockRumConfiguration(), 'rum', true)
  startSessionContext(hooks, rumSessionManager, recorderApi, viewHistory)
  startRumAssembly(mockRumConfiguration(partialConfiguration), lifeCycle, hooks, reportErrorSpy)

  registerCleanupTask(() => {
    subscription.unsubscribe()
  })

  return { lifeCycle, hooks, reportErrorSpy, serverRumEvents, recorderApi }
}
