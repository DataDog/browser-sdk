import type { ClocksState, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { ErrorSource, ExperimentalFeature, HookNames, ONE_MINUTE, display } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockExperimentalFeatures, registerCleanupTask, mockClock } from '@datadog/browser-core/test'
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
import type { RumErrorEvent, RumEvent, RumResourceEvent, RumViewEvent } from '../rumEvent.types'
import { startRumAssembly } from './assembly'
import type { RawRumEventCollectedData } from './lifeCycle'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RumConfiguration } from './configuration'
import type { ViewHistory } from './contexts/viewHistory'
import type { RumSessionManager } from './rumSessionManager'
import { startGlobalContext } from './contexts/globalContext'
import { startSessionContext } from './contexts/sessionContext'
import { createHooks } from './hooks'

describe('rum assembly', () => {
  describe('beforeSend', () => {
    describe('fields modification', () => {
      describe('modifiable fields', () => {
        it('should allow modification', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.view.url = 'modified'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { view: { url: '/path?foo=bar' } }),
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].view.url).toBe('modified')
        })

        it('should allow addition', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.view.name = 'added'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { view: { url: '/path?foo=bar' } }),
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].view.name).toBe('added')
        })

        it('should allow modification of view.performance.lcp.resource_url', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.view.performance.lcp.resource_url = 'modified_url'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.VIEW, {
              view: { performance: { lcp: { resource_url: 'original_url' } } },
            }),
          })

          const rumEvents = await getRumEvents()
          expect((rumEvents[0].view as any).performance.lcp.resource_url).toBe('modified_url')
        })

        describe('field resource.graphql on Resource events', () => {
          it('by default, it should not be modifiable', async () => {
            const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
              partialConfiguration: {
                beforeSend: (event) => (event.resource!.graphql = { operationType: 'query' }),
              },
            })

            notifyRawRumEvent(lifeCycle, {
              rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
            })

            const rumEvents = await getRumEvents()
            expect((rumEvents[0] as RumResourceEvent).resource.graphql).toBeUndefined()
          })

          it('with the writable_resource_graphql experimental flag is set, it should be modifiable', async () => {
            mockExperimentalFeatures([ExperimentalFeature.WRITABLE_RESOURCE_GRAPHQL])

            const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
              partialConfiguration: {
                beforeSend: (event) => (event.resource!.graphql = { operationType: 'query' }),
              },
            })

            notifyRawRumEvent(lifeCycle, {
              rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
            })

            const rumEvents = await getRumEvents()
            expect((rumEvents[0] as RumResourceEvent).resource.graphql).toEqual({ operationType: 'query' })
          })
        })
      })

      describe('context field', () => {
        it('should allow modification on context field for events other than views', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].context!.foo).toBe('bar')
        })

        it('should allow replacing the context field for events other than views', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].context!.foo).toBe('bar')
        })

        it('should empty the context field if set to null', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context = null
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].context).toBeUndefined()
        })

        it('should empty the context field if set to undefined', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context = undefined
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].context).toBeUndefined()
        })

        it('should empty the context field if deleted', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                delete event.context
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].context).toBeUndefined()
        })

        it('should define the context field even if the global context is empty', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                expect(event.context).toEqual({})
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })

          await getRumEvents()
        })

        it('should accept modification on context field for view events', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.VIEW),
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].context).toEqual({ foo: 'bar' })
        })

        it('should reject replacing the context field to non-object', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => {
                event.context = 1
              },
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          const rumEvents = await getRumEvents()
          expect(rumEvents[0].context!.foo).toBe('bar')
        })
      })

      describe('allowed customer provided field', () => {
        it('should allow modification of the error fingerprint', async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: {
              beforeSend: (event) => (event.error.fingerprint = 'my_fingerprint'),
            },
          })

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.ERROR),
          })

          const rumEvents = await getRumEvents()
          expect((rumEvents[0] as RumErrorEvent).error.fingerprint).toBe('my_fingerprint')
        })
      })

      it('should reject modification of field not sensitive, context or customer provided', async () => {
        const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            beforeSend: (event: RumEvent) => ((event.view as any).id = 'modified'),
          },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        const rumEvents = await getRumEvents()
        expect(rumEvents[0].view.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      })

      it('should not allow to add a sensitive field on the wrong event type', async () => {
        const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
          partialConfiguration: {
            beforeSend: (event) => {
              event.error = { message: 'added' }
            },
          },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        })

        const rumEvents = await getRumEvents()
        expect((rumEvents[0] as any).error?.message).toBeUndefined()
      })
    })

    describe('events dismission', () => {
      it('should allow dismissing events other than views', async () => {
        const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
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

        const rumEvents = await getRumEvents()
        expect(rumEvents.length).toBe(0)
      })

      it('should not allow dismissing view events', async () => {
        const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
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

        const rumEvents = await getRumEvents()
        expect(rumEvents[0].view.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
        expect(displaySpy).toHaveBeenCalledWith("Can't dismiss view events using beforeSend!")
      })
    })

    it('should not dismiss when true is returned', async () => {
      const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: {
          beforeSend: () => true,
        },
      })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        }),
      })

      const rumEvents = await getRumEvents()
      expect(rumEvents.length).toBe(1)
    })

    it('should not dismiss when undefined is returned', async () => {
      const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: {
          beforeSend: () => undefined,
        },
      })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        }),
      })

      const rumEvents = await getRumEvents()
      expect(rumEvents.length).toBe(1)
    })
  })

  describe('customer context', () => {
    it('should be merged with event attributes', async () => {
      const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        customerContext: { foo: 'bar' },
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      const rumEvents = await getRumEvents()
      expect((rumEvents[0].context as any).foo).toEqual('bar')
    })
  })

  describe('service and version', () => {
    const extraConfigurationOptions = { service: 'default service', version: 'default version' }

    describe('fields service and version', () => {
      it('it should be modifiable', async () => {
        const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
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
          rawRumEvent: createRawRumEvent(RumEventType.RESOURCE),
        })
        const rumEvents = await getRumEvents()
        expect((rumEvents[0] as RumResourceEvent).service).toBe('bar')
        expect((rumEvents[0] as RumResourceEvent).version).toBe('0.2.0')

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        })
        expect((rumEvents[1] as RumViewEvent).service).toBe('bar')
        expect((rumEvents[1] as RumViewEvent).version).toBe('0.2.0')
      })
    })
  })

  describe('assemble hook', () => {
    it('should add and override common properties', async () => {
      const { lifeCycle, hooks, getRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: { service: 'default service', version: 'default version' },
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
      const rumEvents = await getRumEvents()
      expect(rumEvents[0].service).toEqual('new service')
      expect(rumEvents[0].version).toEqual('new version')
      expect(rumEvents[0].view.id).toEqual('new view id')
    })

    it('should not override customer context', async () => {
      const { lifeCycle, hooks, getRumEvents } = setupAssemblyTestWithDefaults()

      hooks.register(HookNames.Assemble, ({ eventType }) => ({
        type: eventType,
        context: { foo: 'bar' },
      }))

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        customerContext: { foo: 'customer context' },
      })
      const rumEvents = await getRumEvents()
      expect(rumEvents[0].context).toEqual({ foo: 'customer context' })
    })
  })

  describe('event generation condition', () => {
    it('when tracked, it should generate event', async () => {
      const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      const rumEvents = await getRumEvents()
      expect(rumEvents.length).toBe(1)
    })

    it('when not tracked, it should not generate event', async () => {
      const sessionManager = createRumSessionManagerMock().setNotTracked()
      const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({ sessionManager })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      const rumEvents = await getRumEvents()
      expect(rumEvents.length).toBe(0)
    })

    it('should get session state from event start', async () => {
      const sessionManager = createRumSessionManagerMock()
      spyOn(sessionManager, 'findTrackedSession').and.callThrough()
      const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({ sessionManager })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        startTime: 123 as RelativeTime,
      })

      await getRumEvents()

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
      it(`stops sending ${eventType} events when reaching the limit`, async () => {
        const { lifeCycle, getRumEvents, reportErrorSpy } = setupAssemblyTestWithDefaults({
          partialConfiguration: { eventRateLimiterThreshold: 1 },
        })

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 100 as TimeStamp }),
        })
        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(eventType, { date: 200 as TimeStamp }),
        })

        const rumEvents = await getRumEvents()
        expect(rumEvents.length).toBe(1)
        expect(rumEvents[0].date).toBe(100)
        expect(reportErrorSpy).toHaveBeenCalledTimes(1)
        expect(reportErrorSpy.calls.argsFor(0)[0]).toEqual(
          jasmine.objectContaining({
            message,
            source: ErrorSource.AGENT,
          })
        )
      })

      it(`does not take discarded ${eventType} events into account`, async () => {
        const { lifeCycle, getRumEvents, reportErrorSpy } = setupAssemblyTestWithDefaults({
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
        const rumEvents = await getRumEvents()
        expect(rumEvents.length).toBe(1)
        expect(rumEvents[0].date).toBe(200)
        expect(reportErrorSpy).not.toHaveBeenCalled()
      })

      describe('when clock ticks with one minute', () => {
        let clock: Clock
        beforeEach(() => {
          clock = mockClock()
        })

        it(`allows to send new ${eventType} events after a minute`, async () => {
          const { lifeCycle, getRumEvents } = setupAssemblyTestWithDefaults({
            partialConfiguration: { eventRateLimiterThreshold: 1 },
          })

          const rumEvents = await getRumEvents()

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

          expect(rumEvents.length).toBe(2)
          expect(rumEvents[0].date).toBe(100)
          expect(rumEvents[1].date).toBe(300)
        })
      })
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
  const globalContext = startGlobalContext(hooks, mockRumConfiguration())
  startSessionContext(hooks, rumSessionManager, recorderApi, viewHistory)
  startRumAssembly(mockRumConfiguration(partialConfiguration), lifeCycle, hooks, reportErrorSpy)

  registerCleanupTask(() => {
    subscription.unsubscribe()
  })

  return {
    lifeCycle,
    hooks,
    reportErrorSpy,
    getRumEvents: async () => {
      // Wait for assembly to start producing events
      await Promise.resolve()
      return serverRumEvents
    },
    recorderApi,
    globalContext,
  }
}
