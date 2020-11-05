import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventCategory } from '../../../types'
import { RumEventType } from '../../../typesV2'
import { LifeCycleEventType } from '../../lifeCycle'
import { startActionCollection } from './actionCollection'
import { ActionType } from './trackActions'

describe('actionCollection', () => {
  let setupBuilder: TestSetupBuilder
  let addAction: ReturnType<typeof startActionCollection>['addAction']

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => false,
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
      id: 'xxx',
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
    const { rawRumEvents } = setupBuilder.build()
    addAction({
      name: 'foo',
      startTime: 1234,
      type: ActionType.CUSTOM,
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

describe('actionCollection v2', () => {
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
    const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
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

    expect(rawRumEventsV2[0].startTime).toBe(1234)
    expect(rawRumEventsV2[0].rawRumEvent).toEqual({
      action: {
        error: {
          count: 10,
        },
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        loadingTime: 100 * 1e6,
        longTask: {
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
    const { rawRumEventsV2 } = setupBuilder.build()
    addAction({
      name: 'foo',
      startTime: 1234,
      type: ActionType.CUSTOM,
    })

    expect(rawRumEventsV2[0].startTime).toBe(1234)
    expect(rawRumEventsV2[0].rawRumEvent).toEqual({
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
