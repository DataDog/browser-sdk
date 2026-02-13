import { vi, type Mock } from 'vitest'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { IncrementalSource, RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackMove } from './trackMove'
import type { Tracker } from './tracker.types'

describe('trackMove', () => {
  let emitRecordCallback: Mock<EmitRecordCallback>
  let moveTracker: Tracker

  beforeEach(() => {
    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    emitRecordCallback = vi.fn()
    moveTracker = trackMove(emitRecordCallback, scope)
    registerCleanupTask(() => {
      moveTracker.stop()
    })
  })

  it('should generate mouse move record', () => {
    const event = createNewEvent('mousemove', { clientX: 1, clientY: 2 })
    document.body.dispatchEvent(event)

    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.MouseMove,
        positions: [
          {
            x: 1,
            y: 2,
            id: expect.any(Number),
            timeOffset: 0,
          },
        ],
      },
    })
  })

  it('should generate touch move record', () => {
    const event = createNewEvent('touchmove', { changedTouches: [{ clientX: 1, clientY: 2 }] })
    document.body.dispatchEvent(event)

    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.TouchMove,
        positions: [
          {
            x: 1,
            y: 2,
            id: expect.any(Number),
            timeOffset: 0,
          },
        ],
      },
    })
  })

  it('should not generate mouse move record if x/y are missing', () => {
    const mouseMove = createNewEvent('mousemove')
    document.body.dispatchEvent(mouseMove)

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })
})
