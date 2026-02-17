import { vi, afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { trackViewEnd } from './trackViewEnd'
import type { Tracker } from './tracker.types'

describe('trackViewEnd', () => {
  let lifeCycle: LifeCycle
  let emitRecordCallback: Mock<EmitRecordCallback>
  let flushMutationsCallback: Mock<() => void>
  let viewEndTracker: Tracker

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    emitRecordCallback = vi.fn()
    flushMutationsCallback = vi.fn()
    viewEndTracker = trackViewEnd(lifeCycle, emitRecordCallback, flushMutationsCallback)
  })

  afterEach(() => {
    viewEndTracker.stop()
  })

  it('should generate view end record', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

    expect(flushMutationsCallback).toHaveBeenCalledWith()
    expect(emitRecordCallback).toHaveBeenCalledWith({
      timestamp: expect.any(Number),
      type: RecordType.ViewEnd,
    })
  })
})
