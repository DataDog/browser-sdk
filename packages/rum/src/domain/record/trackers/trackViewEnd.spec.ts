import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { trackViewEnd } from './trackViewEnd'
import type { Tracker } from './tracker.types'

describe('trackViewEnd', () => {
  let lifeCycle: LifeCycle
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let viewEndTracker: Tracker

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    emitRecordCallback = jasmine.createSpy()
    viewEndTracker = trackViewEnd(lifeCycle, noop, emitRecordCallback)
  })

  afterEach(() => {
    viewEndTracker.stop()
  })

  it('should generate view end record', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

    expect(emitRecordCallback).toHaveBeenCalledWith({
      timestamp: jasmine.any(Number),
      type: RecordType.ViewEnd,
    })
  })
})
