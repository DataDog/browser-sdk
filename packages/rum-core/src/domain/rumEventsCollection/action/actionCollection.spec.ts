import { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { createNewEvent } from '../../../../../core/test/specHelper'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType, ActionType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { startActionCollection } from './actionCollection'

describe('actionCollection', () => {
  let setupBuilder: TestSetupBuilder
  let addAction: ReturnType<typeof startActionCollection>['addAction']

  beforeEach(() => {
    setupBuilder = setup()
      .withForegroundContexts({
        isInForegroundAt: () => true,
      })
      .beforeBuild(({ lifeCycle, configuration, domMutationObservable, foregroundContexts }) => {
        ;({ addAction } = startActionCollection(lifeCycle, domMutationObservable, configuration, foregroundContexts))
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })
  it('should create action from auto action', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const event = createNewEvent('click')
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
      },
      duration: 100 as Duration,
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: ActionType.CLICK,
      event,
    })

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      action: {
        error: {
          count: 10,
        },
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        loading_time: (100 * 1e6) as ServerDuration,
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
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      event,
    })
  })

  it('should create action from custom action', () => {
    const { rawRumEvents } = setupBuilder.build()
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
})
