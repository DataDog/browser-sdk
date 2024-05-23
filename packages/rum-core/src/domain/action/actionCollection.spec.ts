import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RawRumActionEvent } from '@datadog/browser-rum-core'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import { RumEventType, ActionType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import { startActionCollection } from './actionCollection'

describe('actionCollection', () => {
  let setupBuilder: TestSetupBuilder
  let addAction: ReturnType<typeof startActionCollection>['addAction']

  beforeEach(() => {
    setupBuilder = setup()
      .withPageStateHistory({
        wasInPageStateAt: () => true,
      })
      .beforeBuild(({ lifeCycle, configuration, domMutationObservable, pageStateHistory }) => {
        ;({ addAction } = startActionCollection(lifeCycle, domMutationObservable, configuration, pageStateHistory))
      })
  })

  it('should create action from auto action', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()

    const event = createNewEvent('pointerup', { target: document.createElement('button') })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      type: ActionType.CLICK,
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      target: {
        selector: '#foo',
        width: 1,
        height: 2,
      },
      position: { x: 1, y: 2 },
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      duration: 100 as Duration,
      counts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
      },
      event,
      frustrationTypes: [],
      events: [event],
    })

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
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
      action: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        type: ActionType.CLICK,
        loading_time: (100 * 1e6) as ServerDuration,
        frustration: {
          type: [],
        },
        error: {
          count: 10,
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
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      events: [event],
    })
  })

  it('should create action from custom action', () => {
    const { rawRumEvents } = setupBuilder.build()
    addAction({
      type: ActionType.CUSTOM,
      name: 'foo',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
    })

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      type: RumEventType.ACTION,
      view: {
        in_foreground: true,
      },
      action: {
        id: jasmine.any(String),
        type: ActionType.CUSTOM,
        target: {
          name: 'foo',
        },
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({})
  })
  it('should not set the loading time field of the action', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const event = createNewEvent('pointerup', { target: document.createElement('button') })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      type: ActionType.CLICK,
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      startClocks: { relative: 0 as RelativeTime, timeStamp: 0 as TimeStamp },
      duration: -10 as Duration,
      counts: {
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 0,
      },
      event,
      frustrationTypes: [],
      events: [event],
    })
    expect((rawRumEvents[0].rawRumEvent as RawRumActionEvent).action.loading_time).toBeUndefined()
  })
})
