import { Context } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { RumEventCategory } from '../index'
import { RawRumEvent } from '../types'
import { startRumAssembly } from './assembly'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

interface ServerRumEvents {
  application_id: string
  user_action: {
    id: string
  }
  date: number
  evt: {
    category: string
  }
  session_id: string
  view: {
    id: string
    referrer: string
    url: string
  }
  network?: {
    bytes_written: number
  }
}

describe('rum assembly', () => {
  let setupBuilder: TestSetupBuilder
  let lifeCycle: LifeCycle
  let globalContext: Context
  let serverRumEvents: ServerRumEvents[]
  let isTracked: boolean
  let viewSessionId: string | undefined

  function generateRawRumEvent(
    category: RumEventCategory,
    properties?: Partial<RawRumEvent>,
    savedGlobalContext?: Context,
    customerContext?: Context
  ) {
    const viewEvent = { evt: { category }, ...properties }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      customerContext,
      savedGlobalContext,
      rawRumEvent: viewEvent as RawRumEvent,
      startTime: 0,
    })
  }

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
        findAction: () => ({
          userAction: {
            id: '7890',
          },
        }),
        findView: () => ({
          sessionId: viewSessionId,
          view: {
            id: 'abcde',
            referrer: 'url',
            url: 'url',
          },
        }),
      })
      .beforeBuild(({ applicationId, configuration, lifeCycle: localLifeCycle, session, parentContexts }) => {
        startRumAssembly(applicationId, configuration, localLifeCycle, session, parentContexts, () => globalContext)
      })
    ;({ lifeCycle } = setupBuilder.build())

    serverRumEvents = []
    lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, ({ serverRumEvent }) =>
      serverRumEvents.push((serverRumEvent as unknown) as ServerRumEvents)
    )
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('events', () => {
    it('should have snake cased attributes', () => {
      generateRawRumEvent(RumEventCategory.RESOURCE, { network: { bytesWritten: 2 } })

      expect(serverRumEvents[0].network!.bytes_written).toBe(2)
    })
  })

  describe('rum context', () => {
    it('should be merged with event attributes', () => {
      generateRawRumEvent(RumEventCategory.VIEW)

      expect(serverRumEvents[0].view.id).toBeDefined()
      expect(serverRumEvents[0].date).toBeDefined()
    })

    it('should be snake cased', () => {
      generateRawRumEvent(RumEventCategory.VIEW)

      expect(serverRumEvents[0].application_id).toBe('appId')
    })

    it('should be overwritten by event attributes', () => {
      generateRawRumEvent(RumEventCategory.VIEW, { date: 10 })

      expect(serverRumEvents[0].date).toBe(10)
    })
  })

  describe('rum global context', () => {
    it('should be merged with event attributes', () => {
      globalContext = { bar: 'foo' }
      generateRawRumEvent(RumEventCategory.VIEW)

      expect((serverRumEvents[0] as any).bar).toEqual('foo')
    })

    it('should ignore subsequent context mutation', () => {
      globalContext = { bar: 'foo' }
      generateRawRumEvent(RumEventCategory.VIEW)
      delete globalContext.bar
      generateRawRumEvent(RumEventCategory.VIEW)

      expect((serverRumEvents[0] as any).bar).toEqual('foo')
      expect((serverRumEvents[1] as any).bar).toBeUndefined()
    })

    it('should not be automatically snake cased', () => {
      globalContext = { fooBar: 'foo' }
      generateRawRumEvent(RumEventCategory.VIEW)

      expect(((serverRumEvents[0] as any) as any).fooBar).toEqual('foo')
    })

    it('should ignore the current global context when a saved global context is provided', () => {
      globalContext = { replacedContext: 'b', addedContext: 'x' }

      generateRawRumEvent(RumEventCategory.VIEW, undefined, { replacedContext: 'a' })

      expect((serverRumEvents[0] as any).replacedContext).toEqual('a')
      expect((serverRumEvents[0] as any).addedContext).toEqual(undefined)
    })
  })

  describe('customer context', () => {
    it('should be merged with event attributes', () => {
      generateRawRumEvent(RumEventCategory.VIEW, undefined, undefined, { foo: 'bar' })

      expect((serverRumEvents[0] as any).foo).toEqual('bar')
    })

    it('should not be automatically snake cased', () => {
      generateRawRumEvent(RumEventCategory.VIEW, undefined, undefined, { fooBar: 'foo' })

      expect(((serverRumEvents[0] as any) as any).fooBar).toEqual('foo')
    })
  })

  describe('action context', () => {
    it('should be added on some event categories', () => {
      ;[RumEventCategory.RESOURCE, RumEventCategory.LONG_TASK, RumEventCategory.ERROR].forEach((category) => {
        generateRawRumEvent(category)
        expect(serverRumEvents[0].user_action.id).toBeDefined()
        serverRumEvents = []
      })
      ;[RumEventCategory.VIEW, RumEventCategory.USER_ACTION].forEach((category) => {
        generateRawRumEvent(category)
        expect(serverRumEvents[0].user_action).not.toBeDefined()
        serverRumEvents = []
      })
    })
  })

  describe('view context', () => {
    it('should be merged with event attributes', () => {
      generateRawRumEvent(RumEventCategory.USER_ACTION)

      expect(serverRumEvents[0].view).toEqual({
        id: 'abcde',
        referrer: 'url',
        url: 'url',
      })
      expect(serverRumEvents[0].session_id).toEqual('1234')
    })
  })

  describe('session', () => {
    it('when tracked, it should generate event', () => {
      isTracked = true

      generateRawRumEvent(RumEventCategory.VIEW)
      expect(serverRumEvents.length).toBe(1)
    })

    it('when not tracked, it should not generate event', () => {
      isTracked = false

      generateRawRumEvent(RumEventCategory.VIEW)
      expect(serverRumEvents.length).toBe(0)
    })

    it('when view context has session id, it should generate event', () => {
      viewSessionId = '1234'

      generateRawRumEvent(RumEventCategory.VIEW)
      expect(serverRumEvents.length).toBe(1)
    })

    it('when view context has no session id, it should not generate event', () => {
      viewSessionId = undefined

      generateRawRumEvent(RumEventCategory.VIEW)
      expect(serverRumEvents.length).toBe(0)
    })
  })
})
