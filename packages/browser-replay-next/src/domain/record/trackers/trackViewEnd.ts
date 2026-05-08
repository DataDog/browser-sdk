import type { ViewEndRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'
import { timeStampNow } from './domUtils'

/**
 * In v8, the recorder does not use LifeCycle events. Instead, the consumer calls
 * `emitViewEnd()` directly when a view ends. This tracker simply exposes that
 * function so the orchestrator can wire it up.
 */
export function trackViewEnd(
  emitRecord: EmitRecordCallback<ViewEndRecord>,
  flushMutations: () => void
): { stop: () => void; emitViewEnd: () => void } {
  function emitViewEnd() {
    flushMutations()
    emitRecord({
      timestamp: timeStampNow(),
      type: RecordType.ViewEnd,
    })
  }

  return {
    stop: () => {
      // Nothing to disconnect — this tracker is driven externally
    },
    emitViewEnd,
  }
}

export type ViewEndTracker = Tracker & { emitViewEnd: () => void }
