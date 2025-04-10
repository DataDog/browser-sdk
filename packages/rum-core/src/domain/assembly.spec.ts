import type { ClocksState, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { ErrorSource, ExperimentalFeature, ONE_MINUTE, display } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  mockEventBridge,
  mockExperimentalFeatures,
  setNavigatorOnLine,
  setNavigatorConnection,
  registerCleanupTask,
  mockClock,
  mockCookie,
} from '@datadog/browser-core/test'
import {
  createRumSessionManagerMock,
  createRawRumEvent,
  mockRumConfiguration,
  mockDisplayContext,
  mockViewHistory,
  mockUrlContexts,
} from '../../test'
import type { RumEventDomainContext } from '../domainContext.types'
import type { RawRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumErrorEvent, RumEvent, RumResourceEvent } from '../rumEvent.types'
import { HookNames, createHooks } from '../hooks'
import { startRumAssembly } from './assembly'
import type { RawRumEventCollectedData } from './lifeCycle'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RumConfiguration } from './configuration'
import type { ViewHistory } from './contexts/viewHistory'
import type { CommonContext } from './contexts/commonContext'
import type { RumSessionManager } from './rumSessionManager'

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

        describe('field resource.graphql on Resource events', () => {
          it('by default, it should not be modifiable', () => {
            const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
              partialConfiguration: {
                beforeSend: (event) => (event.resource!.graphql = { operationType: 'query' }),
              },
            })

            notifyRawRumEvent(lifeCycle, {
              rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
            })

            expect((serverRumEvents[0] as RumResourceEvent).resource.graphql).toBeUndefined()
          })

          it('with the writable_resource_graphql experimental flag is set, it should be modifiable', () => {
            mockExperimentalFeatures([ExperimentalFeature.WRITABLE_RESOURCE_GRAPHQL])

            const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
              partialConfiguration: {
                beforeSend: (event) => (event.resource!.graphql = { operationType: 'query' }),
              },
            })

            notifyRawRumEvent(lifeCycle, {
              rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
            })

            expect((serverRumEvents[0] as RumResourceEvent).resource.graphql).toEqual({ operationType: 'query' })
          })
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
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
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
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
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
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
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
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
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

  describe('rum context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, undefined),
      })

      expect(serverRumEvents[0].view.id).toBeDefined()
      expect(serverRumEvents[0].date).toBeDefined()
      expect(serverRumEvents[0].session.id).toBeDefined()
      expect(serverRumEvents[0].source).toBe('browser')
    })

    it('should be overwritten by event attributes', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, { date: 10 }),
      })

      expect(serverRumEvents[0].date).toBe(10)
    })
  })

  describe('rum global context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.context = { bar: 'foo' }
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect((serverRumEvents[0].context as any).bar).toEqual('foo')
    })

    it('should always have anonymous id', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.context = {}
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].context).toBe(undefined)
    })

    it('should ignore subsequent context mutation', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.context = { bar: 'foo', baz: 'foz' }
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      delete commonContext.context.bar
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect((serverRumEvents[0].context as any).bar).toEqual('foo')
      expect((serverRumEvents[1].context as any).bar).toBeUndefined()
    })
  })

  describe('rum user and account', () => {
    it('should be included in event attributes', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.user = { id: 'foo' }
      commonContext.account = { id: 'bar' }
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].usr!.id).toEqual('foo')
      expect(serverRumEvents[0].account!.id).toEqual('bar')
    })

    it('should always contain anonymous id', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.user = {}
      commonContext.account = {}

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].usr).toEqual({ anonymous_id: 'device-123' })
    })

    it('should not contain anonymous id when opt-out', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults({
        partialConfiguration: { trackAnonymousUser: false },
      })
      commonContext.user = {}
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].usr).toBeUndefined()
      expect(serverRumEvents[0].account).toBe(undefined)
    })

    it('should not include account if `id` is missing and display a warn', () => {
      expect(true).toBe(true)
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.account = { name: 'foo' }
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].account).toBe(undefined)
    })
  })

  describe('customer context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        customerContext: { foo: 'bar' },
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect((serverRumEvents[0].context as any).foo).toEqual('bar')
    })
  })

  describe('service and version', () => {
    const extraConfigurationOptions = { service: 'default service', version: 'default version' }

    describe('fields service and version', () => {
      it('it should be modifiable', () => {
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
          rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
        })

        expect((serverRumEvents[0] as RumResourceEvent).service).toBe('bar')
        expect((serverRumEvents[0] as RumResourceEvent).version).toBe('0.2.0')
      })
    })
  })

  describe('assemble hook', () => {
    it('should add and override common properties', () => {
      const { lifeCycle, hooks, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults({
        partialConfiguration: { service: 'default service', version: 'default version' },
      })
      commonContext.context = { foo: 'global context' }

      hooks.register(HookNames.Assemble, ({ eventType }) => ({
        type: eventType,
        service: 'new service',
        version: 'new version',
        context: { foo: 'bar' },
        view: { id: 'new view id', url: '' },
      }))

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].service).toEqual('new service')
      expect(serverRumEvents[0].version).toEqual('new version')
      expect(serverRumEvents[0].context).toEqual({ foo: 'bar' })
      expect(serverRumEvents[0].view.id).toEqual('new view id')
    })

    it('should not override customer context', () => {
      const { lifeCycle, hooks, serverRumEvents } = setupAssemblyTestWithDefaults()

      hooks.register(HookNames.Assemble, ({ eventType }) => ({
        type: eventType,
        context: { foo: 'bar' },
      }))

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        customerContext: { foo: 'customer context' },
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

  describe('session context', () => {
    it('should include the session type and id', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents[0].session).toEqual({
        has_replay: undefined,
        sampled_for_replay: jasmine.any(Boolean),
        is_active: undefined,
        id: '1234',
        type: 'user',
      })
    })

    it('should set the session.has_replay attribute if it is defined in the common context', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.hasReplay = true

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ERROR),
      })
      expect(serverRumEvents[0].session.has_replay).toBe(true)
    })

    it('should not use commonContext.hasReplay on view events', () => {
      const { lifeCycle, serverRumEvents, commonContext } = setupAssemblyTestWithDefaults()
      commonContext.hasReplay = true

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents[0].session.has_replay).toBe(undefined)
    })

    it('should set sampled_for_replay on view events when tracked with replay', () => {
      const sessionManager = createRumSessionManagerMock().setTrackedWithSessionReplay()
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({ sessionManager })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].session.sampled_for_replay).toBe(true)
    })

    it('should set sampled_for_replay on view events when tracked without replay', () => {
      const sessionManager = createRumSessionManagerMock().setTrackedWithoutSessionReplay()
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({ sessionManager })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].session.sampled_for_replay).toBe(false)
    })

    it('should not set sampled_for_replay on other events', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ERROR),
      })

      expect(serverRumEvents[0].session.sampled_for_replay).not.toBeDefined()
    })
  })

  describe('configuration context', () => {
    it('should include the configured sample rates', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0]._dd.configuration).toEqual({
        session_replay_sample_rate: 0,
        session_sample_rate: 100,
      })
    })

    it('should round sample rates', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults({
        partialConfiguration: {
          sessionSampleRate: 1.2341,
          sessionReplaySampleRate: 6.7891,
        },
      })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0]._dd.configuration).toEqual({
        session_sample_rate: 1.234,
        session_replay_sample_rate: 6.789,
      })
    })
  })

  describe('if event bridge detected', () => {
    it('includes the browser sdk version', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      notifyRawRumEvent(lifeCycle, { rawRumEvent: createRawRumEvent(RumEventType.VIEW) })

      mockEventBridge()

      notifyRawRumEvent(lifeCycle, { rawRumEvent: createRawRumEvent(RumEventType.VIEW) })

      expect(serverRumEvents[0]._dd.browser_sdk_version).not.toBeDefined()
      expect(serverRumEvents[1]._dd.browser_sdk_version).toBeDefined()
    })
  })

  describe('anonymous user id context', () => {
    it('includes the anonymous user id context', () => {
      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()

      mockCookie('expired=1&aid=123')

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].usr!.anonymous_id).toBeDefined()
    })
  })

  describe('connectivity', () => {
    it('should include the connectivity information', () => {
      setNavigatorOnLine(true)
      setNavigatorConnection({ effectiveType: '2g' })

      const { lifeCycle, serverRumEvents } = setupAssemblyTestWithDefaults()
      const rawRumEvent = createRawRumEvent(RumEventType.VIEW)
      notifyRawRumEvent(lifeCycle, { rawRumEvent })

      expect(serverRumEvents[0].connectivity).toEqual({
        status: 'connected',
        effective_type: '2g',
        interfaces: undefined,
      })
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
          registerCleanupTask(() => clock.cleanup())
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
  findView = () => ({ id: '7890', name: 'view name', startClocks: {} as ClocksState }),
}: AssemblyTestParams = {}) {
  const lifeCycle = new LifeCycle()
  const hooks = createHooks()
  const reportErrorSpy = jasmine.createSpy('reportError')
  const rumSessionManager = sessionManager ?? createRumSessionManagerMock().setId('1234')
  const commonContext = {
    context: {},
    user: {},
    account: {},
    hasReplay: undefined,
  } as CommonContext

  const serverRumEvents: RumEvent[] = []
  const subscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent) => {
    serverRumEvents.push(serverRumEvent)
  })

  startRumAssembly(
    mockRumConfiguration(partialConfiguration),
    lifeCycle,
    hooks,
    rumSessionManager,
    { ...mockViewHistory(), findView: () => findView() },
    mockUrlContexts(),
    mockDisplayContext(),
    () => commonContext,
    reportErrorSpy
  )

  registerCleanupTask(() => {
    subscription.unsubscribe()
  })

  return { lifeCycle, hooks, reportErrorSpy, serverRumEvents, commonContext }
}
