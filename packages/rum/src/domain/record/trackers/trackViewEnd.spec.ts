import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import type { ViewEndCallback } from './trackViewEnd'
import { trackViewEnd } from './trackViewEnd'
import type { Tracker } from './tracker.types'

describe('trackViewEnd', () => {
  let lifeCycle: LifeCycle
  let viewEndCb: jasmine.Spy<ViewEndCallback>
  let stopViewEndTracker: Tracker

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    viewEndCb = jasmine.createSpy()
    stopViewEndTracker = trackViewEnd(lifeCycle, viewEndCb)
  })

  afterEach(() => {
    stopViewEndTracker()
  })

  it('should generate view end record', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

    expect(viewEndCb).toHaveBeenCalledWith({
      timestamp: jasmine.any(Number),
      type: RecordType.ViewEnd,
    })
  })
})
