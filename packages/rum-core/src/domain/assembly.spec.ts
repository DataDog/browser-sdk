import { DEFAULT_CONFIGURATION, noop } from '@datadog/browser-core'
import { createRawRumEvent } from '../../test/fixtures'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { CommonContext, RumEventType } from '../rawRumEvent.types'
import { RumActionEvent, RumEvent, RumLongTaskEvent } from '../rumEvent.types'
import { startRumAssembly } from './assembly'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

describe('rum assembly', () => {
  let setupBuilder: TestSetupBuilder
  let lifeCycle: LifeCycle
  let commonContext: CommonContext
  let serverRumEvents: RumEvent[]
  let isTracked: boolean
  let viewSessionId: string | undefined
  let beforeSend: (event: RumEvent) => void

  beforeEach(() => {
    isTracked = true
    viewSessionId = '1234'
    commonContext = {
      context: {},
      user: {},
    }
    beforeSend = noop
    setupBuilder = setup()
      .withSession({
        getId: () => '1234',
        isTracked: () => isTracked,
        isTrackedWithResource: () => true,
      })
      .withConfiguration({
        ...DEFAULT_CONFIGURATION,
        beforeSend: (x: RumEvent) => beforeSend(x),
      })
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
      .beforeBuild(({ applicationId, configuration, lifeCycle: localLifeCycle, session, parentContexts }) => {
        startRumAssembly(applicationId, configuration, localLifeCycle, session, parentContexts, () => commonContext)
      })
    ;({ lifeCycle } = setupBuilder.build())

    serverRumEvents = []
    lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, ({ serverRumEvent }) =>
      serverRumEvents.push(serverRumEvent)
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('events', () => {
    it('should have snake cased attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { longTask: { duration: 2 } }),
        startTime: 0,
      })

      expect((serverRumEvents[0] as RumLongTaskEvent).long_task.duration).toBe(2)
    })

    it('should allow modification on sensitive field', () => {
      beforeSend = (event: RumEvent) => (event.view.url = 'modified')

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { view: { url: '/path?foo=bar' } }),
        startTime: 0,
      })

      expect(serverRumEvents[0].view.url).toBe('modified')
    })

    it('should reject modification on non sensitive field', () => {
      beforeSend = (event: RumEvent) => ((event.view as any).id = 'modified')

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          view: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        }),
        startTime: 0,
      })

      expect(serverRumEvents[0].view.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    })
  })

  describe('rum context', () => {
    it('should be merged with event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, undefined),
        startTime: 0,
      })

      expect(serverRumEvents[0].view.id).toBeDefined()
      expect(serverRumEvents[0].date).toBeDefined()
    })

    it('should be snake cased', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, undefined),
        startTime: 0,
      })

      expect(serverRumEvents[0]._dd.format_version).toBe(2)
    })

    it('should be overwritten by event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, { date: 10 }),
        startTime: 0,
      })

      expect(serverRumEvents[0].date).toBe(10)
    })
  })

  describe('rum global context', () => {
    it('should be merged with event attributes', () => {
      commonContext.context = { bar: 'foo' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).bar).toEqual('foo')
    })

    it('should not be included if empty', () => {
      commonContext.context = {}
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect(serverRumEvents[0].context).toBe(undefined)
    })

    it('should ignore subsequent context mutation', () => {
      commonContext.context = { bar: 'foo', baz: 'foz' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      delete commonContext.context.bar
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).bar).toEqual('foo')
      expect((serverRumEvents[1].context as any).bar).toBeUndefined()
    })

    it('should not be automatically snake cased', () => {
      commonContext.context = { fooBar: 'foo' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).fooBar).toEqual('foo')
    })

    it('should ignore the current global context when a saved global context is provided', () => {
      commonContext.context = { replacedContext: 'b', addedContext: 'x' }

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        savedCommonContext: {
          context: { replacedContext: 'a' },
          user: {},
        },
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).replacedContext).toEqual('a')
      expect((serverRumEvents[0].context as any).addedContext).toEqual(undefined)
    })
  })

  describe('rum user', () => {
    it('should be included in event attributes', () => {
      commonContext.user = { id: 'foo' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect(serverRumEvents[0].usr!.id).toEqual('foo')
    })

    it('should not be included if empty', () => {
      commonContext.user = {}
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect(serverRumEvents[0].usr).toBe(undefined)
    })

    it('should not be automatically snake cased', () => {
      commonContext.user = { fooBar: 'foo' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect(serverRumEvents[0].usr!.fooBar).toEqual('foo')
    })

    it('should ignore the current user when a saved common context user is provided', () => {
      commonContext.user = { replacedAttribute: 'b', addedAttribute: 'x' }

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        savedCommonContext: {
          context: {},
          user: { replacedAttribute: 'a' },
        },
        startTime: 0,
      })

      expect(serverRumEvents[0].usr!.replacedAttribute).toEqual('a')
      expect(serverRumEvents[0].usr!.addedAttribute).toEqual(undefined)
    })
  })

  describe('customer context', () => {
    it('should be merged with event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        customerContext: { foo: 'bar' },
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).foo).toEqual('bar')
    })

    it('should not be automatically snake cased', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        customerContext: { fooBar: 'foo' },
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).fooBar).toEqual('foo')
    })
  })

  describe('action context', () => {
    it('should be added on some event categories', () => {
      ;[RumEventType.RESOURCE, RumEventType.LONG_TASK, RumEventType.ERROR].forEach((category) => {
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
          rawRumEvent: createRawRumEvent(category),
          startTime: 0,
        })
        expect(serverRumEvents[0].action).toEqual({ id: '7890' })
        serverRumEvents = []
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents[0].action).not.toBeDefined()
      serverRumEvents = []

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        startTime: 0,
      })
      expect((serverRumEvents[0] as RumActionEvent).action.id).not.toBeDefined()
      serverRumEvents = []
    })
  })

  describe('view context', () => {
    it('should be merged with event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        startTime: 0,
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
      isTracked = true

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(1)
    })

    it('when not tracked, it should not generate event', () => {
      isTracked = false

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(0)
    })

    it('when view context has session id, it should generate event', () => {
      viewSessionId = '1234'

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(1)
    })

    it('when view context has no session id, it should not generate event', () => {
      viewSessionId = undefined

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(0)
    })
  })

  describe('session context', () => {
    it('should include the session type and id', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents[0].session).toEqual({
        has_replay: undefined,
        id: '1234',
        type: 'user',
      })
    })

    it('should set the session.has_replay attribute if it is defined in the common context', () => {
      commonContext.hasReplay = true

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents[0].session.has_replay).toBe(true)
    })
  })
})
