import { LifeCycle, LifeCycleEventType } from '@flashcatcloud/browser-rum-core'
import { RecordType } from '../../../types'
import type { ViewEndCallback } from './trackViewEnd'
import { trackViewEnd } from './trackViewEnd'
import type { Tracker } from './tracker.types'

describe('trackViewEnd', () => {
  let lifeCycle: LifeCycle
  let viewEndCb: jasmine.Spy<ViewEndCallback>
  let viewEndTracker: Tracker

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    viewEndCb = jasmine.createSpy()
    viewEndTracker = trackViewEnd(lifeCycle, viewEndCb)
  })

  afterEach(() => {
    viewEndTracker.stop()
  })

  it('should generate view end record', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

    expect(viewEndCb).toHaveBeenCalledWith({
      timestamp: jasmine.any(Number),
      type: RecordType.ViewEnd,
    })
  })
})
