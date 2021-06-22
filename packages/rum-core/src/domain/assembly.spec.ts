import { ErrorSource, ONE_MINUTE, RawError, RelativeTime, display } from '@datadog/browser-core'
import { createRawRumEvent } from '../../test/fixtures'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { RumEventDomainContext } from '../domainContext.types'
import { CommonContext, RawRumErrorEvent, RawRumEvent, RumEventType } from '../rawRumEvent.types'
import { RumActionEvent, RumErrorEvent, RumEvent } from '../rumEvent.types'
import { startRumAssembly } from './assembly'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from './lifeCycle'

describe('rum assembly', () => {
  let setupBuilder: TestSetupBuilder
  let commonContext: CommonContext
  let serverRumEvents: RumEvent[]
  let viewSessionId: string | undefined

  beforeEach(() => {
    viewSessionId = '1234'
    commonContext = {
      context: {},
      user: {},
    }
    setupBuilder = setup()
      .withParentContexts({
        findAction: () => ({
          action: {
            id: '7890',
          },
        }),
        findView: () => ({
          session: {
            id: viewSessionId,
          },
          view: {
            id: 'abcde',
            referrer: 'url',
            url: 'url',
          },
        }),
      })
      .beforeBuild(({ applicationId, configuration, lifeCycle, session, parentContexts }) => {
        serverRumEvents = []
        lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent) =>
          serverRumEvents.push(serverRumEvent)
        )
        startRumAssembly(applicationId, configuration, lifeCycle, session, parentContexts, () => commonContext)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('beforeSend', () => {
    describe('fields modification', () => {
      describe('sensitive fields', () => {
        it('should allow modification on sensitive field', () => {
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

      it('should reject modification on non sensitive and non context field', () => {
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
        expect(displaySpy).toHaveBeenCalledWith(`Can't dismiss view events using beforeSend!`)
      })
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
    })

    it('should be overwritten by event attributes', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, { date: 10 }),
      })

      expect(serverRumEvents[0].date).toBe(10)
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

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect((serverRumEvents[0] as RumActionEvent).action.id).not.toEqual('7890')
      serverRumEvents = []
    })
  })

  describe('view context', () => {
    it('should be merged with event attributes', () => {
      const { lifeCycle } = setupBuilder.build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
      })
      expect(serverRumEvents[0].view).toEqual({
        id: 'abcde',
        referrer: 'url',
        url: 'url',
      })
      expect(serverRumEvents[0].session.id).toBe('1234')
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
      const { lifeCycle } = setupBuilder
        .withSession({
          getId: () => '1234',
          isTracked: () => false,
          isTrackedWithResource: () => false,
        })
        .build()
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(0)
    })

    it('when view context has current session id, it should generate event', () => {
      const { lifeCycle } = setupBuilder.build()
      viewSessionId = '1234'

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(1)
    })

    it('when view context has not the current session id, it should not generate event', () => {
      const { lifeCycle } = setupBuilder.build()
      viewSessionId = '6789'

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(0)
    })

    it('when view context has no session id, it should not generate event', () => {
      const { lifeCycle } = setupBuilder.build()
      viewSessionId = undefined

      notifyRawRumEvent(lifeCycle, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
      })
      expect(serverRumEvents.length).toBe(0)
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
        id: '1234',
        type: 'user',
      })
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
  })

  describe('error events limitation', () => {
    const notifiedRawErrors: RawError[] = []

    beforeEach(() => {
      notifiedRawErrors.length = 0
      setupBuilder.beforeBuild(({ lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error }) => notifiedRawErrors.push(error))
      })
    })

    it('stops sending error events when reaching the limit', () => {
      const { lifeCycle } = setupBuilder.withConfiguration({ maxErrorsByMinute: 1 }).build()
      notifyRawRumErrorEvent(lifeCycle, 'foo')
      notifyRawRumErrorEvent(lifeCycle, 'bar')

      expect(serverRumEvents.length).toBe(1)
      expect((serverRumEvents[0] as RumErrorEvent).error.message).toBe('foo')
      expect(notifiedRawErrors.length).toBe(1)
      expect(notifiedRawErrors[0]).toEqual(
        jasmine.objectContaining({
          message: 'Reached max number of errors by minute: 1',
          source: ErrorSource.AGENT,
        })
      )
    })

    it('does not take discarded errors into account', () => {
      const { lifeCycle } = setupBuilder
        .withConfiguration({
          maxErrorsByMinute: 1,
          beforeSend: (event) => {
            if (event.type === RumEventType.ERROR && (event as RumErrorEvent).error.message === 'discard me') {
              return false
            }
          },
        })
        .build()
      notifyRawRumErrorEvent(lifeCycle, 'discard me')
      notifyRawRumErrorEvent(lifeCycle, 'discard me')
      notifyRawRumErrorEvent(lifeCycle, 'discard me')
      notifyRawRumErrorEvent(lifeCycle, 'foo')
      expect(serverRumEvents.length).toBe(1)
      expect((serverRumEvents[0] as RumErrorEvent).error.message).toBe('foo')
      expect(notifiedRawErrors.length).toBe(0)
    })

    it('allows to send new errors after a minute', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().withConfiguration({ maxErrorsByMinute: 1 }).build()
      notifyRawRumErrorEvent(lifeCycle, 'foo')
      notifyRawRumErrorEvent(lifeCycle, 'bar')
      clock.tick(ONE_MINUTE)
      notifyRawRumErrorEvent(lifeCycle, 'baz')

      expect(serverRumEvents.length).toBe(2)
      expect((serverRumEvents[0] as RumErrorEvent).error.message).toBe('foo')
      expect((serverRumEvents[1] as RumErrorEvent).error.message).toBe('baz')
    })

    function notifyRawRumErrorEvent(lifeCycle: LifeCycle, message = 'oh snap') {
      const rawRumEvent = createRawRumEvent(RumEventType.ERROR) as RawRumErrorEvent
      rawRumEvent.error.message = message
      notifyRawRumEvent(lifeCycle, {
        rawRumEvent,
      })
    }
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
