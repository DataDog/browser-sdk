import type { Context } from '@datadog/browser-core'
import type { RumEvent } from '../../rumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { RumEventType } from '../../rawRumEvent.types'
import { trackViewEventCounts } from './trackViewEventCounts'

describe('trackViewEventCounts', () => {
  const lifeCycle = new LifeCycle()
  let viewEventCountsTracking: ReturnType<typeof trackViewEventCounts>
  let onChange: () => void

  beforeEach(() => {
    onChange = jasmine.createSpy('onChange')

    viewEventCountsTracking = trackViewEventCounts(lifeCycle, 'view-id', onChange)
  })

  afterEach(() => {
    viewEventCountsTracking.stop()
  })

  it('should track events count', () => {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ERROR,
      view: { id: 'view-id' },
    } as RumEvent & Context)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('should not count child events unrelated to the view', () => {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ERROR,
      view: { id: 'unrelated-view-id' },
    } as RumEvent & Context)

    expect(onChange).not.toHaveBeenCalled()
  })
})
