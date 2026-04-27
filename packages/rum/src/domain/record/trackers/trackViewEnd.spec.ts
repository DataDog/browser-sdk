import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { trackViewEnd } from './trackViewEnd'
import type { Tracker } from './tracker.types'

describe('trackViewEnd', () => {
  let lifeCycle: LifeCycle
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let flushMutationsCallback: jasmine.Spy<() => void>
  let viewEndTracker: Tracker

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    emitRecordCallback = jasmine.createSpy()
    flushMutationsCallback = jasmine.createSpy()
    viewEndTracker = trackViewEnd(lifeCycle, emitRecordCallback, flushMutationsCallback)
  })

  afterEach(() => {
    viewEndTracker.stop()
  })

  it('should generate view end record', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

    expect(flushMutationsCallback).toHaveBeenCalledWith()
    expect(emitRecordCallback).toHaveBeenCalledWith({
      timestamp: jasmine.any(Number),
      type: RecordType.ViewEnd,
    })
  })
})
