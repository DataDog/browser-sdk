import { Context } from '@datadog/browser-core'
import { createRawRumEvent } from '../../test/fixtures'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { RumEventType } from '../typesV2'
import { startRumAssemblyV2 } from './assemblyV2'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

interface ServerRumEvents {
  application: {
    id: string
  }
  action: {
    id: string
  }
  context: any
  date: number
  type: string
  session: {
    id: string
  }
  view: {
    id: string
    referrer: string
    url: string
  }
  long_task?: {
    duration: number
  }
  _dd: {
    format_version: 2
  }
}

describe('rum assembly v2', () => {
  let setupBuilder: TestSetupBuilder
  let lifeCycle: LifeCycle
  let globalContext: Context
  let serverRumEvents: ServerRumEvents[]
  let isTracked: boolean
  let viewSessionId: string | undefined

  beforeEach(() => {
    isTracked = true
    viewSessionId = '1234'
    setupBuilder = setup()
      .withSession({
        getId: () => '1234',
        isTracked: () => isTracked,
        isTrackedWithResource: () => true,
      })
      .withParentContexts({
        findActionV2: () => ({
          action: {
            id: '7890',
          },
        }),
        findViewV2: () => ({
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
        startRumAssemblyV2(applicationId, configuration, localLifeCycle, session, parentContexts, () => globalContext)
      })
    ;({ lifeCycle } = setupBuilder.build())

    serverRumEvents = []
    lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_V2_COLLECTED, ({ serverRumEvent }) =>
      serverRumEvents.push((serverRumEvent as unknown) as ServerRumEvents)
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('events', () => {
    it('should have snake cased attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, { longTask: { duration: 2 } }),
        startTime: 0,
      })

      expect(serverRumEvents[0].long_task!.duration).toBe(2)
    })
  })

  describe('rum context', () => {
    it('should be merged with event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, undefined),
        startTime: 0,
      })

      expect(serverRumEvents[0].view.id).toBeDefined()
      expect(serverRumEvents[0].date).toBeDefined()
    })

    it('should be snake cased', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, undefined),
        startTime: 0,
      })

      expect(serverRumEvents[0]._dd.format_version).toBe(2)
    })

    it('should be overwritten by event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, { date: 10 }),
        startTime: 0,
      })

      expect(serverRumEvents[0].date).toBe(10)
    })
  })

  describe('rum global context', () => {
    it('should be merged with event attributes', () => {
      globalContext = { bar: 'foo' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).bar).toEqual('foo')
    })

    it('should ignore subsequent context mutation', () => {
      globalContext = { bar: 'foo' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      delete globalContext.bar
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).bar).toEqual('foo')
      expect((serverRumEvents[1].context as any).bar).toBeUndefined()
    })

    it('should not be automatically snake cased', () => {
      globalContext = { fooBar: 'foo' }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).fooBar).toEqual('foo')
    })

    it('should ignore the current global context when a saved global context is provided', () => {
      globalContext = { replacedContext: 'b', addedContext: 'x' }

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        savedGlobalContext: { replacedContext: 'a' },
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).replacedContext).toEqual('a')
      expect((serverRumEvents[0].context as any).addedContext).toEqual(undefined)
    })
  })

  describe('customer context', () => {
    it('should be merged with event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        customerContext: { foo: 'bar' },
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })

      expect((serverRumEvents[0].context as any).foo).toEqual('bar')
    })

    it('should not be automatically snake cased', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
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
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
          rawRumEvent: createRawRumEvent(category),
          startTime: 0,
        })
        expect(serverRumEvents[0].action).toEqual({ id: '7890' })
        serverRumEvents = []
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents[0].action).not.toBeDefined()
      serverRumEvents = []

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        startTime: 0,
      })
      expect(serverRumEvents[0].action.id).not.toBeDefined()
      serverRumEvents = []
    })
  })

  describe('view context', () => {
    it('should be merged with event attributes', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
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

  describe('session', () => {
    it('when tracked, it should generate event', () => {
      isTracked = true

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(1)
    })

    it('when not tracked, it should not generate event', () => {
      isTracked = false

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(0)
    })

    it('when view context has session id, it should generate event', () => {
      viewSessionId = '1234'

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(1)
    })

    it('when view context has no session id, it should not generate event', () => {
      viewSessionId = undefined

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW),
        startTime: 0,
      })
      expect(serverRumEvents.length).toBe(0)
    })
  })
})
