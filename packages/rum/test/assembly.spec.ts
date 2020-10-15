import { Context } from '@datadog/browser-core'
import { RumEventCategory } from '../src'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { RawRumEvent } from '../src/types'
import { setup, TestSetupBuilder } from './specHelper'

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
  }
  network?: {
    bytes_written: number
  }
}

describe('rum assembly', () => {
  let setupBuilder: TestSetupBuilder
  let lifeCycle: LifeCycle
  let setGlobalContext: (context: Context) => void
  let serverRumEvents: ServerRumEvents[]

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
    setupBuilder = setup()
      .withParentContexts({
        findAction: () => ({
          userAction: {
            id: '7890',
          },
        }),
        findView: () => ({
          sessionId: '1234',
          view: {
            id: 'abcde',
            referrer: 'url',
            url: 'url',
          },
        }),
      })
      .withAssembly()
    ;({ lifeCycle, setGlobalContext } = setupBuilder.build())

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
      setGlobalContext({ bar: 'foo' })
      generateRawRumEvent(RumEventCategory.VIEW)

      expect((serverRumEvents[0] as any).bar).toEqual('foo')
    })

    it('should ignore subsequent context mutation', () => {
      const globalContext = { bar: 'foo' }
      setGlobalContext(globalContext)
      generateRawRumEvent(RumEventCategory.VIEW)
      delete globalContext.bar
      generateRawRumEvent(RumEventCategory.VIEW)

      expect((serverRumEvents[0] as any).bar).toEqual('foo')
      expect((serverRumEvents[1] as any).bar).toBeUndefined()
    })

    it('should not be automatically snake cased', () => {
      setGlobalContext({ fooBar: 'foo' })
      generateRawRumEvent(RumEventCategory.VIEW)

      expect(((serverRumEvents[0] as any) as any).fooBar).toEqual('foo')
    })

    it('should ignore the current global context when a saved global context is provided', () => {
      setGlobalContext({ replacedContext: 'b', addedContext: 'x' })

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
})
