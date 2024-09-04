import type { ClocksState, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { ErrorSource, ExperimentalFeature, ONE_MINUTE, display } from '@datadog/browser-core'
import {
  mockEventBridge,
  cleanupSyntheticsWorkerValues,
  mockSyntheticsWorkerValues,
  mockExperimentalFeatures,
  setNavigatorOnLine,
  setNavigatorConnection,
} from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../test'
import { createRumSessionManagerMock, setup, createRawRumEvent } from '../../test'
import type { RumEventDomainContext } from '../domainContext.types'
import type { RawRumActionEvent, RawRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumActionEvent, RumErrorEvent, RumEvent, RumResourceEvent } from '../rumEvent.types'
import { startRumAssembly } from './assembly'
import type { LifeCycle, RawRumEventCollectedData } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RumConfiguration } from './configuration'
import type { ViewContext } from './contexts/viewContexts'
import type { CommonContext } from './contexts/commonContext'
import type { CiVisibilityContext } from './contexts/ciVisibilityContext'

describe('rum assembly', () => {
  let setupBuilder: TestSetupBuilder
  let commonContext: CommonContext
  let serverRumEvents: RumEvent[]
  let extraConfigurationOptions: Partial<RumConfiguration> = {}
  let findView: () => ViewContext
  let reportErrorSpy: jasmine.Spy<jasmine.Func>
  let ciVisibilityContext: { test_execution_id: string } | undefined

  beforeEach(() => {
    findView = () => ({
      id: '7890',
      name: 'view name',
      startClocks: {} as ClocksState,
    })
    reportErrorSpy = jasmine.createSpy('reportError')
    commonContext = {
      context: {},
      user: {},
      hasReplay: undefined,
    }
    ciVisibilityContext = undefined

    setupBuilder = setup()
      .withViewContexts({
        findView: () => findView(),
      })
      .withActionContexts({
        findActionId: () => '7890',
      })
      .beforeBuild(
        ({ configuration, lifeCycle, sessionManager, viewContexts, urlContexts, actionContexts, displayContext }) => {
          serverRumEvents = []
          lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent) =>
            serverRumEvents.push(serverRumEvent)
          )
          startRumAssembly(
            { ...configuration, ...extraConfigurationOptions },
            lifeCycle,
            sessionManager,
            viewContexts,
            urlContexts,
            actionContexts,
            displayContext,
            { get: () => ciVisibilityContext } as CiVisibilityContext,
            () => commonContext,
            reportErrorSpy
          )
        }
      )
  })

  afterEach(() => {
    cleanupSyntheticsWorkerValues()
  })

  describe('beforeSend', () => {
    describe('fields modification', () => {
      describe('modifiable fields', () => {
        it('should allow modification', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => (event.view.url = 'modified'),
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { view: { url: '/path?foo=bar' } }),
          })

          expect(serverRumEvents[0].view.url).toBe('modified')
        })

        it('should allow addition', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => (event.view.name = 'added'),
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { view: { url: '/path?foo=bar' } }),
          })

          expect(serverRumEvents[0].view.name).toBe('added')
        })

        describe('field resource.graphql on Resource events', () => {
          it('by default, it should not be modifiable', () => {
            const { lifeCycle } = setupBuilder
              .withConfiguration({
                beforeSend: (event) => (event.resource!.graphql = { operationType: 'query' }),
              })
              .build()

            notifyRawRumEvent(lifeCycle, {
              rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
            })

            expect((serverRumEvents[0] as RumResourceEvent).resource.graphql).toBeUndefined()
          })

          it('with the writable_resource_graphql experimental flag is set, it should be modifiable', () => {
            mockExperimentalFeatures([ExperimentalFeature.WRITABLE_RESOURCE_GRAPHQL])

            const { lifeCycle } = setupBuilder
              .withConfiguration({
                beforeSend: (event) => (event.resource!.graphql = { operationType: 'query' }),
              })
              .build()

            notifyRawRumEvent(lifeCycle, {
              rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
            })

            expect((serverRumEvents[0] as RumResourceEvent).resource.graphql).toEqual({ operationType: 'query' })
          })
        })
      })

      describe('context field', () => {
        it('should allow modification on context field for events other than views', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })

          expect(serverRumEvents[0].context!.foo).toBe('bar')
        })

        it('should allow replacing the context field for events other than views', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                event.context = { foo: 'bar' }
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })

          expect(serverRumEvents[0].context!.foo).toBe('bar')
        })

        it('should empty the context field if set to null', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                event.context = null
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          expect(serverRumEvents[0].context).toBeUndefined()
        })

        it('should empty the context field if set to undefined', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                event.context = undefined
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          expect(serverRumEvents[0].context).toBeUndefined()
        })

        it('should empty the context field if deleted', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                delete event.context
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          expect(serverRumEvents[0].context).toBeUndefined()
        })

        it('should define the context field even if the global context is empty', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                expect(event.context).toEqual({})
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
          })
        })

        it('should accept modification on context field for view events', () => {
          mockExperimentalFeatures([ExperimentalFeature.VIEW_SPECIFIC_CONTEXT])
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.VIEW),
          })

          expect(serverRumEvents[0].context).toEqual({ foo: 'bar' })
        })

        it('should reject modification on context field for view events', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                event.context.foo = 'bar'
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.VIEW),
          })

          expect(serverRumEvents[0].context).toBeUndefined()
        })

        it('should reject replacing the context field to non-object', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => {
                event.context = 1
              },
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
            customerContext: { foo: 'bar' },
          })

          expect(serverRumEvents[0].context!.foo).toBe('bar')
        })
      })

      describe('allowed customer provided field', () => {
        it('should allow modification of the error fingerprint', () => {
          const { lifeCycle } = setupBuilder
            .withConfiguration({
              beforeSend: (event) => (event.error.fingerprint = 'my_fingerprint'),
            })
            .build()

          notifyRawRumEvent(lifeCycle, {
            rawRumEvent: createRawRumEvent(RumEventType.ERROR),
          })

          expect((serverRumEvents[0] as RumErrorEvent).error.fingerprint).toBe('my_fingerprint')
        })
      })

      it('should reject modification of field not sensitive, context or customer provided', () => {
        const { lifeCycle } = setupBuilder
          .withConfiguration({
            beforeSend: (event: RumEvent) => ((event.view as any).id = 'modified'),
          })
          .build()

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
            view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          }),
        })

        expect(serverRumEvents[0].view.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      })

      it('should not allow to add a sensitive field on the wrong event type', () => {
        const { lifeCycle } = setupBuilder
          .withConfiguration({
            beforeSend: (event) => {
              event.error = { message: 'added' }
            },
          })
          .build()

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        })

        expect((serverRumEvents[0] as any).error?.message).toBeUndefined()
      })
    })

    describe('events dismission', () => {
      it('should allow dismissing events other than views', () => {
        const { lifeCycle } = setupBuilder
          .withConfiguration({
            beforeSend: () => false,
          })
          .build()

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
        const { lifeCycle } = setupBuilder
          .withConfiguration({
            beforeSend: () => false,
          })
          .build()

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
      const { lifeCycle } = setupBuilder
        .withConfiguration({
          beforeSend: () => true,
        })
        .build()

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        }),
      })

      expect(serverRumEvents.length).toBe(1)
    })

    it('should not dismiss when undefined is returned', () => {
      const { lifeCycle } = setupBuilder
        .withConfiguration({
          beforeSend: () => undefined,
        })
        .build()

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
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, undefined),
      })

      expect(serverRumEvents[0].view.id).toBeDefined()
      expect(serverRumEvents[0].date).toBeDefined()
      expect(serverRumEvents[0].session.id).toBeDefined()
      expect(serverRumEvents[0].source).toBe('browser')
    })

    it('should be overwritten by event attributes', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, { date: 10 }),
      })

      expect(serverRumEvents[0].date).toBe(10)
    })
  })

  describe('priority of rum context', () => {
    it('should prioritize view customer context over global context', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.context = { foo: 'bar' }
      notifyRawRumEvent(lifeCycle, {
        customerContext: { foo: 'baz' },
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].context!.foo).toBe('baz')
    })

    it('should prioritize child customer context over inherited view context', () => {
      const { lifeCycle } = setupBuilder.build()
      findView = () => ({
        id: '7890',
        name: 'view name',
        startClocks: {} as ClocksState,
        customerContext: { foo: 'bar' },
      })
      notifyRawRumEvent(lifeCycle, {
        customerContext: { foo: 'baz' },
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })

      expect(serverRumEvents[0].context!.foo).toBe('baz')
    })
  })

  describe('rum global context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.context = { bar: 'foo' }
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect((serverRumEvents[0].context as any).bar).toEqual('foo')
    })

    it('should not be included if empty', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.context = {}
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].context).toBe(undefined)
    })

    it('should ignore subsequent context mutation', () => {
      const { lifeCycle } = setupBuilder.build()
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

    it('should ignore the current global context when a saved global context is provided', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.context = { replacedContext: 'b', addedContext: 'x' }

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        savedCommonContext: {
          context: { replacedContext: 'a' },
          user: {},
          hasReplay: undefined,
        },
      })

      expect((serverRumEvents[0].context as any).replacedContext).toEqual('a')
      expect((serverRumEvents[0].context as any).addedContext).toEqual(undefined)
    })
  })

  describe('rum user', () => {
    it('should be included in event attributes', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.user = { id: 'foo' }
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].usr!.id).toEqual('foo')
    })

    it('should not be included if empty', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.user = {}
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].usr).toBe(undefined)
    })

    it('should ignore the current user when a saved common context user is provided', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.user = { replacedAttribute: 'b', addedAttribute: 'x' }

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        savedCommonContext: {
          context: {},
          user: { replacedAttribute: 'a' },
          hasReplay: undefined,
        },
      })

      expect(serverRumEvents[0].usr!.replacedAttribute).toEqual('a')
      expect(serverRumEvents[0].usr!.addedAttribute).toEqual(undefined)
    })
  })

  describe('customer context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        customerContext: { foo: 'bar' },
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect((serverRumEvents[0].context as any).foo).toEqual('bar')
    })
  })

  describe('action context', () => {
    it('should be added on some event categories', () => {
      const { lifeCycle } = setupBuilder.build()
      ;[RumEventType.RESOURCE, RumEventType.LONG_TASK, RumEventType.ERROR].forEach((category) => {
        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(category),
        })
        expect(serverRumEvents[0].action).toEqual({ id: '7890' })
        serverRumEvents = []
      })

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents[0].action).not.toBeDefined()
      serverRumEvents = []

      const generatedRawRumActionEvent = createRawRumEvent(RumEventType.ACTION) as RawRumActionEvent
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: generatedRawRumActionEvent,
      })
      expect((serverRumEvents[0] as RumActionEvent).action.id).toEqual(generatedRawRumActionEvent.action.id)
      serverRumEvents = []
    })
  })

  describe('view context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].view).toEqual(
        jasmine.objectContaining({
          id: '7890',
          name: 'view name',
        })
      )
    })

    it('child event should have view customer context', () => {
      const { lifeCycle } = setupBuilder.build()
      findView = () => ({
        id: '7890',
        name: 'view name',
        startClocks: {} as ClocksState,
        customerContext: { foo: 'bar' },
      })
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].context).toEqual({ foo: 'bar' })
    })
  })

  describe('service and version', () => {
    beforeEach(() => {
      extraConfigurationOptions = { service: 'default service', version: 'default version' }
    })

    it('should come from the init configuration by default', () => {
      const { lifeCycle } = setupBuilder.build()

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].service).toEqual('default service')
      expect(serverRumEvents[0].version).toEqual('default version')
    })

    it('should be overridden by the view context', () => {
      const { lifeCycle } = setupBuilder.build()
      findView = () => ({ service: 'new service', version: 'new version', id: '1234', startClocks: {} as ClocksState })
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].service).toEqual('new service')
      expect(serverRumEvents[0].version).toEqual('new version')
    })

    describe('fields service and version', () => {
      it('it should be modifiable', () => {
        const { lifeCycle } = setupBuilder
          .withConfiguration({
            beforeSend: (event) => {
              event.service = 'bar'
              event.version = '0.2.0'

              return true
            },
          })
          .build()

        notifyRawRumEvent(lifeCycle, {
          rawRumEvent: createRawRumEvent(RumEventType.RESOURCE, { resource: { url: '/path?foo=bar' } }),
        })

        expect((serverRumEvents[0] as RumResourceEvent).service).toBe('bar')
        expect((serverRumEvents[0] as RumResourceEvent).version).toBe('0.2.0')
      })
    })
  })

  describe('url context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle, fakeLocation } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].view.url).toBe(fakeLocation.href!)
      expect(serverRumEvents[0].view.referrer).toBe(document.referrer)
    })
  })

  describe('event generation condition', () => {
    it('when tracked, it should generate event', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(1)
    })

    it('when not tracked, it should not generate event', () => {
      const { lifeCycle } = setupBuilder.withSessionManager(createRumSessionManagerMock().setNotTracked()).build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(0)
    })

    it('should get session state from event start', () => {
      const rumSessionManager = createRumSessionManagerMock()
      spyOn(rumSessionManager, 'findTrackedSession').and.callThrough()

      const { lifeCycle } = setupBuilder.withSessionManager(rumSessionManager).build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        startTime: 123 as RelativeTime,
      })

      expect(rumSessionManager.findTrackedSession).toHaveBeenCalledWith(123 as RelativeTime)
    })
  })

  describe('session context', () => {
    it('should include the session type and id', () => {
      const { lifeCycle } = setupBuilder.build()
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

    it('should detect synthetics sessions based on synthetics worker values', () => {
      mockSyntheticsWorkerValues()

      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].session.type).toEqual('synthetics')
    })

    it('should detect ci visibility tests', () => {
      ciVisibilityContext = { test_execution_id: 'traceId' }

      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].session.type).toEqual('ci_test')
    })

    it('should set the session.has_replay attribute if it is defined in the common context', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.hasReplay = true

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ERROR),
      })
      expect(serverRumEvents[0].session.has_replay).toBe(true)
    })

    it('should not use commonContext.hasReplay on view events', () => {
      const { lifeCycle } = setupBuilder.build()
      commonContext.hasReplay = true

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents[0].session.has_replay).toBe(undefined)
    })

    it('should set sampled_for_replay on view events when tracked with replay', () => {
      const { lifeCycle } = setupBuilder
        .withSessionManager(createRumSessionManagerMock().setTrackedWithSessionReplay())
        .build()

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].session.sampled_for_replay).toBe(true)
    })

    it('should set sampled_for_replay on view events when tracked without replay', () => {
      const { lifeCycle } = setupBuilder
        .withSessionManager(createRumSessionManagerMock().setTrackedWithoutSessionReplay())
        .build()

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].session.sampled_for_replay).toBe(false)
    })

    it('should not set sampled_for_replay on other events', () => {
      const { lifeCycle } = setupBuilder.build()

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ERROR),
      })

      expect(serverRumEvents[0].session.sampled_for_replay).not.toBeDefined()
    })
  })

  describe('configuration context', () => {
    it('should include the configured sample rates', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0]._dd.configuration).toEqual({
        session_replay_sample_rate: 0,
        session_sample_rate: 100,
      })
    })

    it('should round sample rates', () => {
      const { lifeCycle } = setupBuilder
        .withConfiguration({
          sessionSampleRate: 1.2341,
          sessionReplaySampleRate: 6.7891,
        })
        .build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0]._dd.configuration).toEqual({
        session_sample_rate: 1.234,
        session_replay_sample_rate: 6.789,
      })
    })
  })

  describe('synthetics context', () => {
    it('includes the synthetics context', () => {
      mockSyntheticsWorkerValues()

      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].synthetics).toBeTruthy()
    })
  })

  describe('if event bridge detected', () => {
    it('includes the browser sdk version', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, { rawRumEvent: createRawRumEvent(RumEventType.VIEW) })

      mockEventBridge()

      notifyRawRumEvent(lifeCycle, { rawRumEvent: createRawRumEvent(RumEventType.VIEW) })

      expect(serverRumEvents[0]._dd.browser_sdk_version).not.toBeDefined()
      expect(serverRumEvents[1]._dd.browser_sdk_version).toBeDefined()
    })
  })

  describe('ci visibility context', () => {
    it('includes the ci visibility context', () => {
      ciVisibilityContext = { test_execution_id: 'traceId' }

      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })

      expect(serverRumEvents[0].ci_test).toBeTruthy()
    })
  })

  describe('connectivity', () => {
    it('should include the connectivity information', () => {
      setNavigatorOnLine(true)
      setNavigatorConnection({ effectiveType: '2g' })

      const { lifeCycle } = setupBuilder.build()
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
        const { lifeCycle } = setupBuilder.withConfiguration({ eventRateLimiterThreshold: 1 }).build()
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
        const { lifeCycle } = setupBuilder
          .withConfiguration({
            eventRateLimiterThreshold: 1,
            beforeSend: (event) => {
              if (event.type === eventType && event.date === 100) {
                return false
              }
            },
          })
          .build()
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

      it(`allows to send new ${eventType} events after a minute`, () => {
        const { lifeCycle, clock } = setupBuilder
          .withFakeClock()
          .withConfiguration({ eventRateLimiterThreshold: 1 })
          .build()
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
