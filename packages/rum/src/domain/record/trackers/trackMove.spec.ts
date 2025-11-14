import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { EmitRecordCallback } from '../serialization'
import { IncrementalSource, RecordType } from '../../../types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { trackMove } from './trackMove'
import type { Tracker } from './tracker.types'

describe('trackMove', () => {
  let mouseMoveCallbackSpy: jasmine.Spy<EmitRecordCallback>
  let moveTracker: Tracker

  beforeEach(() => {
    mouseMoveCallbackSpy = jasmine.createSpy()
    const scope = createSerializationScopeForTesting({ emitRecord: mouseMoveCallbackSpy })
    takeFullSnapshotForTesting(scope)

    moveTracker = trackMove(scope)
    registerCleanupTask(() => {
      moveTracker.stop()
    })
  })

  it('should generate mouse move record', () => {
    const event = createNewEvent('mousemove', { clientX: 1, clientY: 2 })
    document.body.dispatchEvent(event)

    expect(mouseMoveCallbackSpy).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseMove,
        positions: [
          {
            x: 1,
            y: 2,
            id: jasmine.any(Number),
            timeOffset: 0,
          },
        ],
      },
    })
  })

  it('should generate touch move record', () => {
    const event = createNewEvent('touchmove', { changedTouches: [{ clientX: 1, clientY: 2 }] })
    document.body.dispatchEvent(event)

    expect(mouseMoveCallbackSpy).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.TouchMove,
        positions: [
          {
            x: 1,
            y: 2,
            id: jasmine.any(Number),
            timeOffset: 0,
          },
        ],
      },
    })
  })

  it('should not generate mouse move record if x/y are missing', () => {
    const mouseMove = createNewEvent('mousemove')
    document.body.dispatchEvent(mouseMove)

    expect(mouseMoveCallbackSpy).not.toHaveBeenCalled()
  })
})
