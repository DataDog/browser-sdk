import { registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { AssembledRumEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { trackViewEventCounts } from './trackViewEventCounts'

describe('trackViewEventCounts', () => {
  const lifeCycle = new LifeCycle()
  let onChange: () => void

  beforeEach(() => {
    onChange = jasmine.createSpy('onChange')

    const viewEventCountsTracking = trackViewEventCounts(lifeCycle, 'view-id', onChange)
    registerCleanupTask(viewEventCountsTracking.stop)
  })

  it('should track events count', () => {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ERROR,
      view: { id: 'view-id' },
    } as AssembledRumEvent)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('should not count child events unrelated to the view', () => {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.ERROR,
      view: { id: 'unrelated-view-id' },
    } as AssembledRumEvent)

    expect(onChange).not.toHaveBeenCalled()
  })
})
