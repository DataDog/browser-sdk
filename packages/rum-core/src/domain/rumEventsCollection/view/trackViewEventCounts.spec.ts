import type { Context } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { RumResourceEvent } from '../../../rumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import type { Clock } from '../../../../../core/test/specHelper'
import { mockClock } from '../../../../../core/test/specHelper'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { KEEP_TRACKING_EVENT_COUNTS_AFTER_VIEW_DELAY, trackViewEventCounts } from './trackViewEventCounts'

describe('trackViewEventCounts', () => {
  const VIEW_ID = 'a'
  const OTHER_VIEW_ID = 'b'
  let lifeCycle: LifeCycle
  let clock: Clock | undefined

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  afterEach(() => {
    if (clock) clock.cleanup()
  })

  it('initializes eventCounts to 0', () => {
    const { eventCounts } = trackViewEventCounts(lifeCycle, VIEW_ID, noop)

    expect(eventCounts).toEqual({
      actionCount: 0,
      errorCount: 0,
      longTaskCount: 0,
      frustrationCount: 0,
      resourceCount: 0,
    })
  })

  it('increments counters', () => {
    const { eventCounts } = trackViewEventCounts(lifeCycle, VIEW_ID, noop)

    notifyResourceEvent()

    expect(eventCounts.resourceCount).toBe(1)
  })

  it('does not increment counters related to other views', () => {
    const { eventCounts } = trackViewEventCounts(lifeCycle, VIEW_ID, noop)

    notifyResourceEvent(OTHER_VIEW_ID)

    expect(eventCounts.resourceCount).toBe(0)
  })

  it('when calling scheduleStop, it keeps counting events for a bit of time', () => {
    clock = mockClock()
    const { scheduleStop, eventCounts } = trackViewEventCounts(lifeCycle, VIEW_ID, noop)

    scheduleStop()

    clock.tick(KEEP_TRACKING_EVENT_COUNTS_AFTER_VIEW_DELAY - 1)
    notifyResourceEvent()

    expect(eventCounts.resourceCount).toBe(1)

    clock.tick(1)
    notifyResourceEvent()

    expect(eventCounts.resourceCount).toBe(1)
  })

  function notifyResourceEvent(viewId = VIEW_ID) {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: { id: viewId },
    } as unknown as RumResourceEvent & Context)
  }
})
