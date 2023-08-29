import type { Context } from '@datadog/browser-core'
import type { RumEvent } from '../../../rumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import type { TestSetupBuilder } from '../../../../test'
import { setup } from '../../../../test'
import { FrustrationType, RumEventType } from '../../../rawRumEvent.types'
import { THROTTLE_VIEW_UPDATE_PERIOD } from './trackViews'
import type { ViewTest } from './setupViewTest.specHelper'
import { setupViewTest } from './setupViewTest.specHelper'
import { KEEP_TRACKING_EVENT_COUNTS_AFTER_VIEW_DELAY } from './trackViewEventCounts'

describe('trackViewEventCounts', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should track error count', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView, getLatestViewContext } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.errorCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ERROR,
      view: getLatestViewContext(),
    } as RumEvent & Context)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ERROR,
      view: getLatestViewContext(),
    } as RumEvent & Context)
    startView()

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(1).eventCounts.errorCount).toEqual(2)
    expect(getViewUpdate(2).eventCounts.errorCount).toEqual(0)
  })

  it('should track long task count', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView, getLatestViewContext } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.longTaskCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.LONG_TASK,
      view: getLatestViewContext(),
    } as RumEvent & Context)
    startView()

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(1).eventCounts.longTaskCount).toEqual(1)
    expect(getViewUpdate(2).eventCounts.longTaskCount).toEqual(0)
  })

  it('should track resource count', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView, getLatestViewContext } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: getLatestViewContext(),
    } as RumEvent & Context)
    startView()

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(1).eventCounts.resourceCount).toEqual(1)
    expect(getViewUpdate(2).eventCounts.resourceCount).toEqual(0)
  })

  it('should track action count', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView, getLatestViewContext } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.actionCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ACTION,
      action: { type: 'custom' },
      view: getLatestViewContext(),
    } as RumEvent & Context)
    startView()

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(1).eventCounts.actionCount).toEqual(1)
    expect(getViewUpdate(2).eventCounts.actionCount).toEqual(0)
  })

  it('should track frustration count', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView, getLatestViewContext } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.frustrationCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ACTION,
      action: {
        type: 'click',
        id: '123',
        frustration: {
          type: [FrustrationType.DEAD_CLICK, FrustrationType.ERROR_CLICK],
        },
      },
      view: getLatestViewContext(),
    } as RumEvent & Context)
    startView()

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(1).eventCounts.frustrationCount).toEqual(2)
    expect(getViewUpdate(2).eventCounts.frustrationCount).toEqual(0)
  })

  it('should not count child events unrelated to the view', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.errorCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ERROR,
      view: { id: 'unrelated-view-id' },
    } as RumEvent & Context)
    startView()

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(1).eventCounts.errorCount).toEqual(0)
    expect(getViewUpdate(2).eventCounts.errorCount).toEqual(0)
  })

  it('should reset event count when the view changes', () => {
    const { lifeCycle, changeLocation } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView, getLatestViewContext } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: getLatestViewContext(),
    } as RumEvent & Context)
    startView()

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(1).eventCounts.resourceCount).toEqual(1)
    expect(getViewUpdate(2).eventCounts.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: getLatestViewContext(),
    } as RumEvent & Context)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: getLatestViewContext(),
    } as RumEvent & Context)
    changeLocation('/baz')

    expect(getViewUpdateCount()).toEqual(5)
    expect(getViewUpdate(3).eventCounts.resourceCount).toEqual(2)
    expect(getViewUpdate(4).eventCounts.resourceCount).toEqual(0)
  })

  it('should update eventCounts when a resource event is collected (throttled)', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount, getLatestViewContext } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      actionCount: 0,
      frustrationCount: 0,
    })

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: getLatestViewContext(),
    } as RumEvent & Context)

    expect(getViewUpdateCount()).toEqual(1)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).eventCounts).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 1,
      actionCount: 0,
      frustrationCount: 0,
    })
  })

  it('should keep updating the view event counters for 5 min after view end', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount, getLatestViewContext, stop } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.resourceCount).toEqual(0)

    stop() // end the view

    clock.tick(KEEP_TRACKING_EVENT_COUNTS_AFTER_VIEW_DELAY - 1)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: getLatestViewContext(),
    } as RumEvent & Context)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(0).id).toEqual(getViewUpdate(1).id)
    expect(getViewUpdate(1).eventCounts.resourceCount).toEqual(1)
  })

  it('should not keep updating the view event counters 5 min after view end', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount, getLatestViewContext, stop } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).eventCounts.resourceCount).toEqual(0)

    stop() // end the view

    clock.tick(KEEP_TRACKING_EVENT_COUNTS_AFTER_VIEW_DELAY)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: getLatestViewContext(),
    } as RumEvent & Context)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(0).id).toEqual(getViewUpdate(1).id)
    expect(getViewUpdate(1).eventCounts.resourceCount).toEqual(0)
  })
})
