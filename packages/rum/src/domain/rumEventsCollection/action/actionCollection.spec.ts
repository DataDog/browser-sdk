import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventCategory } from '../../../types'
import { LifeCycleEventType } from '../../lifeCycle'
import { startActionCollection } from './actionCollection'
import { ActionType } from './trackActions'

describe('actionCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((lifeCycle, configuration) => {
      configuration.isEnabled = () => false
      startActionCollection(lifeCycle, configuration)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })
  it('should create action from auto action', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      duration: 100,
      id: 'xxx',
      measures: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
      },
      name: 'foo',
      startTime: 1234,
      type: ActionType.CLICK,
    })

    expect(rawRumEvents[0].startTime).toBe(1234)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      duration: 100 * 1e6,
      evt: {
        category: RumEventCategory.USER_ACTION,
        name: 'foo',
      },
      userAction: {
        id: 'xxx',
        measures: {
          errorCount: 10,
          longTaskCount: 10,
          resourceCount: 10,
        },
        type: ActionType.CLICK,
      },
    })
  })

  it('should create action from custom action', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, {
      action: {
        name: 'foo',
        startTime: 1234,
        type: ActionType.CUSTOM,
      },
    })

    expect(rawRumEvents[0].startTime).toBe(1234)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      evt: {
        category: RumEventCategory.USER_ACTION,
        name: 'foo',
      },
      userAction: {
        type: ActionType.CUSTOM,
      },
    })
  })
})
