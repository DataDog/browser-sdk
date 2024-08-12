import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RawRumActionEvent, RawRumEventCollectedData, RumConfiguration } from '@datadog/browser-rum-core'
import { collectAndValidateRawRumEvents, mockPageStateHistory } from '../../../test'
import type { RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType, ActionType } from '../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { startActionCollection } from './actionCollection'

const basePageStateHistory = mockPageStateHistory({ wasInPageStateAt: () => true })

describe('actionCollection', () => {
  const lifeCycle = new LifeCycle()
  let addAction: ReturnType<typeof startActionCollection>['addAction']
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>

  beforeEach(() => {
    const configuration = {} as RumConfiguration
    const domMutationObservable = new Observable<void>()

    ;({ addAction } = startActionCollection(lifeCycle, domMutationObservable, configuration, basePageStateHistory))

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  })

  it('should create action from auto action', () => {
    const event = createNewEvent('pointerup', { target: document.createElement('button') })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
      },
      frustrationTypes: [],
      duration: 100 as Duration,
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: ActionType.CLICK,
      event,
      target: {
        selector: '#foo',
        width: 1,
        height: 2,
      },
      position: { x: 1, y: 2 },
      events: [event],
    })

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      action: {
        error: {
          count: 10,
        },
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        loading_time: (100 * 1e6) as ServerDuration,
        frustration: {
          type: [],
        },
        long_task: {
          count: 10,
        },
        resource: {
          count: 10,
        },
        target: {
          name: 'foo',
        },
        type: ActionType.CLICK,
      },
      date: jasmine.any(Number),
      type: RumEventType.ACTION,
      view: {
        in_foreground: true,
      },
      _dd: {
        action: {
          target: {
            selector: '#foo',
            width: 1,
            height: 2,
          },
          position: {
            x: 1,
            y: 2,
          },
        },
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      events: [event],
    })
  })

  it('should create action from custom action', () => {
    addAction({
      name: 'foo',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: ActionType.CUSTOM,
    })

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      action: {
        id: jasmine.any(String),
        target: {
          name: 'foo',
        },
        type: ActionType.CUSTOM,
      },
      date: jasmine.any(Number),
      type: RumEventType.ACTION,
      view: {
        in_foreground: true,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({})
  })
  it('should not set the loading time field of the action', () => {
    const event = createNewEvent('pointerup', { target: document.createElement('button') })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 0,
      },
      duration: -10 as Duration,
      event,
      events: [event],
      frustrationTypes: [],
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      startClocks: { relative: 0 as RelativeTime, timeStamp: 0 as TimeStamp },
      type: ActionType.CLICK,
    })
    expect((rawRumEvents[0].rawRumEvent as RawRumActionEvent).action.loading_time).toBeUndefined()
  })

  it('should create action with handling stack', () => {
    addAction({
      name: 'foo',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: ActionType.CUSTOM,
      handlingStack: 'Error\n    at foo\n    at bar',
    })

    expect(rawRumEvents[0].domainContext).toEqual({
      handlingStack: 'Error\n    at foo\n    at bar',
    })
  })
})
