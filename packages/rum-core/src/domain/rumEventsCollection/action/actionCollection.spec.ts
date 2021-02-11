import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType, ActionType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { startActionCollection } from './actionCollection'

describe('actionCollection', () => {
  let setupBuilder: TestSetupBuilder
  let addAction: ReturnType<typeof startActionCollection>['addAction']

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle, configuration }) => {
        ;({ addAction } = startActionCollection(lifeCycle, configuration))
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })
  it('should create action from auto action', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
      },
      duration: 100,
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      startTime: 1234,
      type: ActionType.CLICK,
    })

    expect(rawRumEvents[0].startTime).toBe(1234)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      action: {
        error: {
          count: 10,
        },
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        loading_time: 100 * 1e6,
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
    })
  })

  it('should create action from custom action', () => {
    const { rawRumEvents } = setupBuilder.build()
    addAction({
      name: 'foo',
      startTime: 1234,
      type: ActionType.CUSTOM,
    })

    expect(rawRumEvents[0].startTime).toBe(1234)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      action: {
        target: {
          name: 'foo',
        },
        type: ActionType.CUSTOM,
      },
      date: jasmine.any(Number),
      type: RumEventType.ACTION,
    })
  })
})
