import type { Context } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { RumResourceEvent } from '../../../rumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackViewEventCounts } from './trackViewEventCounts'

describe('trackViewEventCounts', () => {
  const VIEW_ID = 'a'
  const OTHER_VIEW_ID = 'b'
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
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

  function notifyResourceEvent(viewId = VIEW_ID) {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: { id: viewId },
    } as unknown as RumResourceEvent & Context)
  }
})
